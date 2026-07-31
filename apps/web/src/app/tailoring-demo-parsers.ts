import { buildResumeDocument } from "../../../../src/core/resume/document.js";
import { EvidenceSchema, type Evidence } from "../../../../src/schemas/evidence.js";
import { OfferSchema, type Offer } from "../../../../src/schemas/job.js";
import { ProfileSchema, type Profile } from "../../../../src/schemas/profile.js";
import type { Requirement } from "../../../../src/schemas/requirement.js";
import type { ResumeDocument, ResumeSectionKind } from "../../../../src/schemas/resume.js";
import { TAILORING_DEMO_LIMITS } from "./tailoring-demo-limits.js";

export const DemoParserErrorCode = {
  EmptyResumeText: "TAILORING_DEMO_EMPTY_RESUME_TEXT",
  ResumeTooLong: "TAILORING_DEMO_RESUME_TOO_LONG",
  ResumeTooManyBlocks: "TAILORING_DEMO_RESUME_TOO_MANY_BLOCKS",
  EmptyJobText: "TAILORING_DEMO_EMPTY_JOB_TEXT",
  JobTooLong: "TAILORING_DEMO_JOB_TOO_LONG",
  TooManyRequirements: "TAILORING_DEMO_TOO_MANY_REQUIREMENTS",
  InvalidParsedProfile: "TAILORING_DEMO_INVALID_PARSED_PROFILE",
  InvalidParsedEvidence: "TAILORING_DEMO_INVALID_PARSED_EVIDENCE",
  InvalidParsedOffer: "TAILORING_DEMO_INVALID_PARSED_OFFER",
} as const;

export type ParsedResumeInput = Readonly<{
  profile: Profile;
  evidences: Evidence[];
  resumeDocument: ResumeDocument;
  blocks: readonly ParsedResumeBlock[];
}>;

export type ParsedResumeBlock = Readonly<{
  blockId: string;
  evidenceId: string;
  text: string;
  order: number;
}>;

export type ParsedOfferInput = Readonly<{
  offer: Offer;
  requirementTexts: readonly string[];
}>;

const TOKEN_SPLIT_PATTERN = /[^\p{L}\p{N}+#./-]+/gu;
const BULLET_PREFIX_PATTERN = /^\s*(?:[-*•]|[0-9]+[.)])\s+/u;
const SENTENCE_SPLIT_PATTERN = /(?<=[.!?])\s+/u;
const STOP_WORDS = new Set([
  "con",
  "para",
  "por",
  "una",
  "uno",
  "del",
  "las",
  "los",
  "and",
  "the",
  "with",
  "from",
  "que",
  "de",
  "en",
  "la",
  "el",
  "y",
  "o",
  "a",
]);

export function parseResumeText(resumeText: string): ParsedResumeInput {
  if (resumeText.trim().length === 0) {
    throw new Error(DemoParserErrorCode.EmptyResumeText);
  }
  if (resumeText.length > TAILORING_DEMO_LIMITS.resumeTextMaxLength) {
    throw new Error(DemoParserErrorCode.ResumeTooLong);
  }

  const blockTexts = splitResumeBlocks(resumeText);
  if (blockTexts.length > TAILORING_DEMO_LIMITS.maxResumeBlocks) {
    throw new Error(DemoParserErrorCode.ResumeTooManyBlocks);
  }

  const blocks = blockTexts.map((text, index) => ({
    blockId: stablePositionId("resume_block", index),
    evidenceId: stablePositionId("evidence", index),
    text,
    order: index,
  }));

  const evidences = blocks.map((block) => parseEvidence(block));
  const profile = parseProfile(evidences);
  const resumeDocument = buildResumeDocument({
    documentId: "demo_resume_document",
    profileId: profile.id,
    source: { format: "plain_text" },
    sections: [
      {
        sectionId: "demo_resume_section_experience",
        kind: inferResumeSectionKind(blocks),
        label: "Currículum pegado",
        order: 0,
        blocks: blocks.map((block) => ({
          blockId: block.blockId,
          kind: "paragraph",
          order: block.order,
          originalText: block.text,
          evidenceIds: [block.evidenceId],
          sourceLocator: {
            kind: "text_offset",
            value: `block:${block.order + 1}`,
          },
        })),
      },
    ],
    evidences,
  });

  return deepFreeze({ profile, evidences, resumeDocument, blocks });
}

export function parseJobText(jobText: string): ParsedOfferInput {
  if (jobText.trim().length === 0) {
    throw new Error(DemoParserErrorCode.EmptyJobText);
  }
  if (jobText.length > TAILORING_DEMO_LIMITS.jobTextMaxLength) {
    throw new Error(DemoParserErrorCode.JobTooLong);
  }

  const requirementTexts = extractRequirementTexts(jobText);
  if (requirementTexts.length > TAILORING_DEMO_LIMITS.maxRequirements) {
    throw new Error(DemoParserErrorCode.TooManyRequirements);
  }

  const requirements = requirementTexts.map((text, index): Requirement => ({
    id: stablePositionId("requirement", index),
    originalText: text,
    category: inferRequirementCategory(text),
    isRequired: true,
    level: "unspecified",
    competencyOrTool: text,
    weight: index < 10 ? 70 : 50,
    extractionConfidence: 0.74,
  }));

  const offerResult = OfferSchema.safeParse({
    id: "demo_offer",
    company: { name: "Oferta pegada" },
    title: "Oferta laboral objetivo",
    location: { remoteFriendly: true },
    modality: "unspecified",
    contract: "unspecified",
    source: "tailoring-ui-demo",
    description: jobText.trim(),
    responsibilities: requirementTexts.length === 0 ? ["Responsabilidades no estructuradas"] : requirementTexts,
    requirements,
    status: "unknown",
    language: "preserve_original",
  });
  if (!offerResult.success) {
    throw new Error(DemoParserErrorCode.InvalidParsedOffer);
  }

  return deepFreeze({ offer: offerResult.data, requirementTexts });
}

export function extractRequirementTexts(jobText: string): string[] {
  const candidates = jobText
    .split(/\r?\n/u)
    .flatMap((line) => splitJobLine(line))
    .map(normalizeVisibleSpaces)
    .filter((line) => line.length > 0);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.toLocaleLowerCase("es");
    if (seen.has(key)) {
      continue;
    }
    unique.push(candidate);
    seen.add(key);
  }

  return unique.slice(0, TAILORING_DEMO_LIMITS.maxRequirements);
}

export function significantTokens(value: string): string[] {
  const tokens = value
    .toLocaleLowerCase("es")
    .split(TOKEN_SPLIT_PATTERN)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return Array.from(new Set(tokens)).sort(compareStable);
}

function splitResumeBlocks(resumeText: string): string[] {
  return resumeText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function splitJobLine(line: string): string[] {
  const withoutBullet = line.replace(BULLET_PREFIX_PATTERN, "").trim();
  if (withoutBullet.length === 0) {
    return [];
  }
  const sentenceParts = withoutBullet.split(SENTENCE_SPLIT_PATTERN).filter((part) => part.trim().length > 0);
  return sentenceParts.length > 1 ? sentenceParts : [withoutBullet];
}

function parseEvidence(block: ParsedResumeBlock): Evidence {
  const result = EvidenceSchema.safeParse({
    id: block.evidenceId,
    type: "experience",
    title: shortTitle(block.text),
    description: block.text,
    source: "cv",
    declaredLevel: "unspecified",
    verified: false,
    confidence: 0.72,
    tags: significantTokens(block.text).slice(0, 12),
    reference: {
      profileSection: "experience",
      experienceId: block.blockId,
    },
  });
  if (!result.success) {
    throw new Error(DemoParserErrorCode.InvalidParsedEvidence);
  }
  return result.data;
}

function parseProfile(evidences: Evidence[]): Profile {
  const result = ProfileSchema.safeParse({
    id: "demo_profile",
    professionalTitle: "Perfil importado desde texto",
    headline: "Contenido pegado localmente para una demo determinista",
    location: { remoteFriendly: true },
    targetRoles: ["Rol objetivo"],
    targetIndustries: ["Industria no especificada"],
    professionalLevel: "unspecified",
    experience: evidences.map((evidence, index) => ({
      id: stablePositionId("experience", index),
      title: evidence.title,
      company: "No inferido",
      summary: evidence.description,
      competencies: evidence.tags ?? [],
    })),
    competencies: Array.from(new Set(evidences.flatMap((evidence) => evidence.tags ?? []))).sort(compareStable),
    evidenceIds: evidences.map((evidence) => evidence.id),
    confidence: 0.72,
  });
  if (!result.success) {
    throw new Error(DemoParserErrorCode.InvalidParsedProfile);
  }
  return result.data;
}

function inferResumeSectionKind(blocks: readonly ParsedResumeBlock[]): ResumeSectionKind {
  const allText = blocks.map((block) => block.text).join(" ").toLocaleLowerCase("es");
  if (/\b(skill|skills|competencia|competencias|herramientas)\b/u.test(allText)) {
    return "skills";
  }
  return "experience";
}

function inferRequirementCategory(text: string): Requirement["category"] {
  const lower = text.toLocaleLowerCase("es");
  if (/\b(idioma|language|english|inglés|francés|alemán)\b/u.test(lower)) {
    return "language";
  }
  if (/\b(certificaci[oó]n|certificate|certification)\b/u.test(lower)) {
    return "certification";
  }
  if (/\b(typescript|javascript|python|react|node|sql|aws|azure|docker|kubernetes|vite)\b/u.test(lower)) {
    return "tool";
  }
  if (/\b(experiencia|experience|años|years)\b/u.test(lower)) {
    return "experience";
  }
  return "skill";
}

function shortTitle(value: string): string {
  const normalized = normalizeVisibleSpaces(value);
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}...`;
}

function normalizeVisibleSpaces(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function stablePositionId(prefix: string, index: number): string {
  return `${prefix}_${String(index + 1).padStart(3, "0")}`;
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
