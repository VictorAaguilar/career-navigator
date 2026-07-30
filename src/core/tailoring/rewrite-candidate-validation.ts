import type { GenerationEvidenceContext, RewriteGenerationBatch, RewriteGenerationRequest } from "../../schemas/generation";
import { RewriteGenerationBatchSchema } from "../../schemas/generation";
import type {
  RewriteCandidateFinding,
  RewriteCandidateFindingCode,
  RewriteCandidateFindingSeverity,
  RewriteCandidateSubmission,
  RewriteCandidateValidationBatch,
  RewriteCandidateValidationStatus,
} from "../../schemas/candidate";
import {
  RewriteCandidateSubmissionSchema,
  RewriteCandidateValidationBatchSchema,
} from "../../schemas/candidate";

export const RewriteCandidateValidationInputErrorCode = {
  InvalidGenerationBatch: "CANDIDATE_VALIDATION_INPUT_INVALID_GENERATION_BATCH",
  InvalidCandidate: "CANDIDATE_VALIDATION_INPUT_INVALID_CANDIDATE",
  DuplicateRequestId: "CANDIDATE_VALIDATION_INPUT_DUPLICATE_REQUEST_ID",
  UnknownRequestId: "CANDIDATE_VALIDATION_INPUT_UNKNOWN_REQUEST_ID",
  MissingCandidate: "CANDIDATE_VALIDATION_INPUT_MISSING_CANDIDATE",
} as const;

export type RewriteCandidateValidationInputErrorCode =
  (typeof RewriteCandidateValidationInputErrorCode)[keyof typeof RewriteCandidateValidationInputErrorCode];

export type ValidateRewriteCandidatesInput = {
  generationBatch: RewriteGenerationBatch;
  candidates: RewriteCandidateSubmission[];
};

type ValidatedCandidateInput = {
  generationBatch: RewriteGenerationBatch;
  candidates: RewriteCandidateSubmission[];
};

type TextSpan = {
  value: string;
  start: number;
  end: number;
};

const ErrorFindingCodes = new Set<RewriteCandidateFindingCode>([
  "candidate_contains_markdown",
  "candidate_added_unsupported_date",
  "candidate_removed_original_date",
  "candidate_added_unsupported_metric",
  "candidate_removed_original_metric",
]);

export function validateRewriteCandidates(input: ValidateRewriteCandidatesInput): RewriteCandidateValidationBatch {
  const validatedInput = validateInput(input);
  const candidatesByRequestId = new Map(
    validatedInput.candidates.map((candidate) => [candidate.requestId, candidate]),
  );

  const results = [...validatedInput.generationBatch.requests]
    .map((request) => {
      const candidate = candidatesByRequestId.get(request.requestId);
      if (!candidate) {
        throwInputError(RewriteCandidateValidationInputErrorCode.MissingCandidate);
      }
      return validateCandidate(validatedInput.generationBatch, request, candidate);
    })
    .sort((left, right) => compareStable(left.validationId, right.validationId));

  const summary = {
    totalRequests: results.length,
    totalCandidates: results.length,
    accepted: results.filter((result) => result.status === "accepted").length,
    rejected: results.filter((result) => result.status === "rejected").length,
    humanReview: results.filter((result) => result.status === "human_review").length,
    totalFindings: results.reduce((total, result) => total + result.findings.length, 0),
  };

  const batch = RewriteCandidateValidationBatchSchema.parse({
    offerId: validatedInput.generationBatch.offerId,
    profileId: validatedInput.generationBatch.profileId,
    documentId: validatedInput.generationBatch.documentId,
    validationScope: "deterministic_surface_checks_only",
    results,
    summary,
  });

  return deepFreeze(batch);
}

function validateInput(input: ValidateRewriteCandidatesInput): ValidatedCandidateInput {
  const batchResult = RewriteGenerationBatchSchema.safeParse(input.generationBatch);
  if (!batchResult.success) {
    throwInputError(RewriteCandidateValidationInputErrorCode.InvalidGenerationBatch);
  }

  const candidates: RewriteCandidateSubmission[] = [];
  for (const candidate of input.candidates) {
    const candidateResult = RewriteCandidateSubmissionSchema.safeParse(candidate);
    if (!candidateResult.success) {
      throwInputError(RewriteCandidateValidationInputErrorCode.InvalidCandidate);
    }
    candidates.push(candidateResult.data);
  }

  assertUnique(
    candidates.map((candidate) => candidate.requestId),
    RewriteCandidateValidationInputErrorCode.DuplicateRequestId,
  );

  const requestIds = new Set(batchResult.data.requests.map((request) => request.requestId));
  for (const candidate of candidates) {
    if (!requestIds.has(candidate.requestId)) {
      throwInputError(RewriteCandidateValidationInputErrorCode.UnknownRequestId);
    }
  }

  const candidateRequestIds = new Set(candidates.map((candidate) => candidate.requestId));
  for (const request of batchResult.data.requests) {
    if (!candidateRequestIds.has(request.requestId)) {
      throwInputError(RewriteCandidateValidationInputErrorCode.MissingCandidate);
    }
  }

  return {
    generationBatch: batchResult.data,
    candidates,
  };
}

function validateCandidate(
  generationBatch: RewriteGenerationBatch,
  request: RewriteGenerationRequest,
  candidate: RewriteCandidateSubmission,
): RewriteCandidateValidationBatch["results"][number] {
  const validationId = canonicalId("rewrite-validation", [
    ["offer", generationBatch.offerId],
    ["profile", generationBatch.profileId],
    ["document", generationBatch.documentId],
    ["request", request.requestId],
  ]);
  const candidateId = canonicalId("rewrite-candidate", [
    ["offer", generationBatch.offerId],
    ["profile", generationBatch.profileId],
    ["document", generationBatch.documentId],
    ["request", request.requestId],
  ]);
  const findings = buildFindings(validationId, request, candidate.candidateText);
  const status = statusFromFindings(findings);

  return {
    validationId,
    candidateId,
    requestId: request.requestId,
    proposalId: request.proposalId,
    actionId: request.actionId,
    resolutionId: request.resolutionId,
    blockId: request.blockId,
    originalText: request.originalText,
    candidateText: candidate.candidateText,
    status,
    findings,
  };
}

function buildFindings(
  validationId: string,
  request: RewriteGenerationRequest,
  candidateText: string,
): RewriteCandidateFinding[] {
  const originalText = request.originalText;
  const evidenceText = evidenceContextTextValues(request.evidenceContexts);
  const allowedText = [originalText, ...evidenceText];
  const findingEntries: Array<{ code: RewriteCandidateFindingCode; severity: RewriteCandidateFindingSeverity; values: string[] }> = [];

  const markdownValues = detectMarkdown(candidateText);
  if (markdownValues.length > 0) {
    findingEntries.push({ code: "candidate_contains_markdown", severity: "error", values: markdownValues });
  }

  const originalDates = extractDateTokens(originalText).values;
  const allowedDates = sortedUnique(allowedText.flatMap((value) => extractDateTokens(value).values));
  const candidateDates = extractDateTokens(candidateText).values;
  addMissingAndAddedFindings(findingEntries, {
    required: originalDates,
    allowed: allowedDates,
    candidate: candidateDates,
    removedCode: "candidate_removed_original_date",
    addedCode: "candidate_added_unsupported_date",
    severity: "error",
  });

  const originalMetrics = extractMetricTokens(originalText).values;
  const allowedMetrics = sortedUnique(allowedText.flatMap((value) => extractMetricTokens(value).values));
  const candidateMetrics = extractMetricTokens(candidateText).values;
  addMissingAndAddedFindings(findingEntries, {
    required: originalMetrics,
    allowed: allowedMetrics,
    candidate: candidateMetrics,
    removedCode: "candidate_removed_original_metric",
    addedCode: "candidate_added_unsupported_metric",
    severity: "error",
  });

  const originalProperNouns = extractProperNounTokens(originalText);
  const allowedProperNouns = sortedUnique(allowedText.flatMap(extractProperNounTokens));
  const candidateProperNouns = extractProperNounTokens(candidateText);
  addMissingAndAddedFindings(findingEntries, {
    required: originalProperNouns,
    allowed: allowedProperNouns,
    candidate: candidateProperNouns,
    removedCode: "candidate_removed_original_proper_noun",
    addedCode: "candidate_added_unverified_proper_noun",
    severity: "review",
  });

  if (candidateText === originalText) {
    findingEntries.push({ code: "candidate_unchanged", severity: "review", values: [] });
  }

  return findingEntries
    .filter((entry) => entry.code === "candidate_unchanged" || entry.values.length > 0)
    .sort((left, right) => compareStable(left.code, right.code))
    .map((entry) => ({
      findingId: canonicalId("rewrite-finding", [
        ["validation", validationId],
        ["code", entry.code],
      ]),
      code: entry.code,
      severity: entry.severity,
      values: sortedUnique(entry.values),
    }));
}

function addMissingAndAddedFindings(
  entries: Array<{ code: RewriteCandidateFindingCode; severity: RewriteCandidateFindingSeverity; values: string[] }>,
  input: {
    required: string[];
    allowed: string[];
    candidate: string[];
    removedCode: RewriteCandidateFindingCode;
    addedCode: RewriteCandidateFindingCode;
    severity: RewriteCandidateFindingSeverity;
  },
): void {
  const candidateSet = new Set(input.candidate);
  const allowedSet = new Set(input.allowed);
  const missing = input.required.filter((value) => !candidateSet.has(value));
  const added = input.candidate.filter((value) => !allowedSet.has(value));
  if (missing.length > 0) {
    entries.push({ code: input.removedCode, severity: input.severity, values: sortedUnique(missing) });
  }
  if (added.length > 0) {
    entries.push({ code: input.addedCode, severity: input.severity, values: sortedUnique(added) });
  }
}

function detectMarkdown(text: string): string[] {
  const values: string[] = [];
  if (/```/.test(text)) {
    values.push("```");
  }
  if (/~~~/.test(text)) {
    values.push("~~~");
  }
  if (/^[ \t]{0,3}#{1,6}\s+\S/m.test(text)) {
    values.push("heading");
  }
  if (/^[ \t]*[-*+]\s+\S/m.test(text)) {
    values.push("unordered_list");
  }
  if (/^[ \t]*\d+[.)]\s+\S/m.test(text)) {
    values.push("ordered_list");
  }
  if (/^[ \t]*>\s+\S/m.test(text)) {
    values.push("blockquote");
  }
  const linkPattern = /!?\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"\n]+")?\)/g;
  for (const match of text.matchAll(linkPattern)) {
    values.push(match[0].startsWith("!") ? "image" : "link");
  }
  return sortedUnique(values);
}

function extractDateTokens(text: string): { values: string[]; spans: TextSpan[] } {
  const spans: TextSpan[] = [];
  const patterns = [
    /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g,
    /\b\d{1,2}[/-]\d{1,2}[/-](?:19|20)\d{2}\b/g,
    /\b\d{1,2}[/-](?:19|20)\d{2}\b/g,
    /\b(?:19|20)\d{2}\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }
      const span = { value: match[0], start: match.index, end: match.index + match[0].length };
      if (!spans.some((existing) => overlaps(existing, span))) {
        spans.push(span);
      }
    }
  }

  return {
    values: sortedUnique(spans.map((span) => span.value)),
    spans,
  };
}

function extractMetricTokens(text: string): { values: string[]; spans: TextSpan[] } {
  const dateSpans = extractDateTokens(text).spans;
  const spans: TextSpan[] = [];
  const patterns = [
    /\b(?:USD|EUR|GBP)\s?\d+(?:[.,]\d+)?\b/g,
    /[$€£]\s?\d+(?:[.,]\d+)?\b/g,
    /\b\d+(?:[.,]\d+)?\s?%/g,
    /\b\d+(?:[.,]\d+)?\s?(?:k|K|M|m|hours?|hrs?|years?|months?|days?|users?|people|projects?|teams?|x|ms|s|kg|km|MB|GB)\b/g,
    /\b\d+(?:[.,]\d+)?\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }
      const span = { value: match[0], start: match.index, end: match.index + match[0].length };
      if (dateSpans.some((dateSpan) => overlaps(dateSpan, span)) || spans.some((existing) => overlaps(existing, span))) {
        continue;
      }
      spans.push(span);
    }
  }

  return {
    values: sortedUnique(spans.map((span) => span.value)),
    spans,
  };
}

function extractProperNounTokens(text: string): string[] {
  const values: string[] = [];
  const sequencePattern = /\b\p{Lu}[\p{L}\p{M}]*(?:[\s-]+\p{Lu}[\p{L}\p{M}]*)+\b/gu;
  const acronymPattern = /\b\p{Lu}{2,}\b/gu;
  for (const match of text.matchAll(sequencePattern)) {
    values.push(match[0]);
  }
  for (const match of text.matchAll(acronymPattern)) {
    values.push(match[0]);
  }
  return sortedUnique(values);
}

function evidenceContextTextValues(evidenceContexts: GenerationEvidenceContext[]): string[] {
  const values: string[] = [];
  for (const evidenceContext of evidenceContexts) {
    values.push(evidenceContext.title, evidenceContext.description);
    if (evidenceContext.associatedCompetency !== undefined) {
      values.push(evidenceContext.associatedCompetency);
    }
    if (evidenceContext.date !== undefined) {
      values.push(evidenceContext.date);
    }
    if (evidenceContext.tags !== undefined) {
      values.push(...evidenceContext.tags);
    }
    if (evidenceContext.reference !== undefined) {
      if (evidenceContext.reference.profileSection !== undefined) {
        values.push(evidenceContext.reference.profileSection);
      }
      if (evidenceContext.reference.experienceId !== undefined) {
        values.push(evidenceContext.reference.experienceId);
      }
      if (evidenceContext.reference.projectId !== undefined) {
        values.push(evidenceContext.reference.projectId);
      }
      if (evidenceContext.reference.educationId !== undefined) {
        values.push(evidenceContext.reference.educationId);
      }
    }
  }
  return values;
}

function statusFromFindings(findings: RewriteCandidateFinding[]): RewriteCandidateValidationStatus {
  if (findings.some((finding) => finding.severity === "error")) {
    return "rejected";
  }
  if (findings.some((finding) => finding.severity === "review")) {
    return "human_review";
  }
  return "accepted";
}

function canonicalId(kind: string, parts: Array<[string, string]>): string {
  const encodedParts = parts.map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return [kind, ...encodedParts].join("|");
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort(compareStable);
}

function assertUnique<T extends string | number>(values: T[], errorCode: RewriteCandidateValidationInputErrorCode): void {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      throwInputError(errorCode);
    }
    seen.add(value);
  }
}

function overlaps(left: TextSpan, right: TextSpan): boolean {
  return left.start < right.end && right.start < left.end;
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function throwInputError(code: RewriteCandidateValidationInputErrorCode): never {
  throw new Error(code);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }

  return value;
}
