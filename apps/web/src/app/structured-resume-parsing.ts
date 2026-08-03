import { buildResumeDocument } from "../../../../src/core/resume/document.js";
import { EvidenceSchema, type Evidence } from "../../../../src/schemas/evidence.js";
import { ProfileSchema, type Profile } from "../../../../src/schemas/profile.js";
import type { ResumeBlockKind, ResumeDocument, ResumeSectionKind } from "../../../../src/schemas/resume.js";
import { TAILORING_DEMO_LIMITS } from "./tailoring-demo-limits.js";
import { DemoParserErrorCode, significantTokens, type ParsedResumeBlock, type ParsedResumeInput } from "./tailoring-demo-parsers.js";

export const StructuredResumeSectionKind = Object.freeze([
  "contact",
  "summary",
  "experience",
  "education",
  "skills",
  "languages",
  "certifications",
  "projects",
  "other",
] as const);

export type StructuredResumeSectionKind = (typeof StructuredResumeSectionKind)[number];

export const StructuredResumeConfidence = Object.freeze(["high", "medium", "low"] as const);
export type StructuredResumeConfidence = (typeof StructuredResumeConfidence)[number];

export const StructuredResumeWarningCode = {
  NoHeadings: "STRUCTURED_RESUME_NO_HEADINGS",
  ReviewOtherSection: "STRUCTURED_RESUME_REVIEW_OTHER_SECTION",
  InitialBlockClassifiedAsContact: "STRUCTURED_RESUME_INITIAL_BLOCK_CLASSIFIED_AS_CONTACT",
  InitialBlockRequiresReview: "STRUCTURED_RESUME_INITIAL_BLOCK_REQUIRES_REVIEW",
  EmptySection: "STRUCTURED_RESUME_EMPTY_SECTION",
} as const;

export type StructuredResumeWarningCode =
  (typeof StructuredResumeWarningCode)[keyof typeof StructuredResumeWarningCode];

export const StructuredResumeParseMode = Object.freeze(["structured", "plain"] as const);
export type StructuredResumeParseMode = (typeof StructuredResumeParseMode)[number];

export const StructuredResumeReviewStatus = Object.freeze(["idle", "detected", "confirmed", "error"] as const);
export type StructuredResumeReviewStatus = (typeof StructuredResumeReviewStatus)[number];

export const StructuredResumeErrorCode = {
  InputInvalid: "STRUCTURED_RESUME_INPUT_INVALID",
  SectionInvalid: "STRUCTURED_RESUME_SECTION_INVALID",
  DraftInvalid: "STRUCTURED_RESUME_DRAFT_INVALID",
  ModeRequired: "STRUCTURED_RESUME_MODE_REQUIRED",
  NotConfirmed: "STRUCTURED_RESUME_NOT_CONFIRMED",
  DocumentInvalid: "STRUCTURED_RESUME_DOCUMENT_INVALID",
  ActionInvalid: "STRUCTURED_RESUME_ACTION_INVALID",
} as const;

export type StructuredResumeErrorCode =
  (typeof StructuredResumeErrorCode)[keyof typeof StructuredResumeErrorCode];

export type StructuredResumeLine = Readonly<{
  id: string;
  text: string;
  sourceLine: number;
  role: "heading" | "body";
}>;

export type StructuredResumeSection = Readonly<{
  id: string;
  kind: StructuredResumeSectionKind;
  detectedHeading: string | null;
  originalHeading: string | null;
  sourceStartLine: number;
  sourceEndLine: number;
  lines: readonly StructuredResumeLine[];
  confidence: StructuredResumeConfidence;
  warningCodes: readonly StructuredResumeWarningCode[];
  wasManuallyReviewed: boolean;
}>;

export type StructuredResumeDraft = Readonly<{
  draftId: "structured_resume_draft";
  sections: readonly StructuredResumeSection[];
  warningCodes: readonly StructuredResumeWarningCode[];
  lineCount: number;
}>;

export type StructuredResumeParseResult = Readonly<{
  draft: StructuredResumeDraft;
  warnings: readonly StructuredResumeWarningCode[];
}>;

export const STRUCTURED_RESUME_SECTION_LABELS: Readonly<Record<StructuredResumeSectionKind, string>> = deepFreeze({
  contact: "Contacto",
  summary: "Perfil profesional",
  experience: "Experiencia",
  education: "Formación",
  skills: "Habilidades",
  languages: "Idiomas",
  certifications: "Certificaciones",
  projects: "Proyectos",
  other: "Otra",
});

export const STRUCTURED_RESUME_CONFIDENCE_LABELS: Readonly<Record<StructuredResumeConfidence, string>> = deepFreeze({
  high: "Confianza alta",
  medium: "Confianza media",
  low: "Confianza baja",
});

export const STRUCTURED_RESUME_WARNING_LABELS: Readonly<Record<StructuredResumeWarningCode, string>> = deepFreeze({
  STRUCTURED_RESUME_NO_HEADINGS: "No se detectaron encabezados seguros. Puedes usar el análisis de texto plano.",
  STRUCTURED_RESUME_REVIEW_OTHER_SECTION: "Esta sección no coincide con una categoría conocida y requiere revisión.",
  STRUCTURED_RESUME_INITIAL_BLOCK_CLASSIFIED_AS_CONTACT: "El bloque inicial se conserva como contacto porque contiene señales de contacto visibles.",
  STRUCTURED_RESUME_INITIAL_BLOCK_REQUIRES_REVIEW: "El bloque inicial se conserva como otra sección para revisión.",
  STRUCTURED_RESUME_EMPTY_SECTION: "La sección solo contiene un encabezado o líneas vacías.",
});

export const STRUCTURED_RESUME_ALIASES: Readonly<Record<Exclude<StructuredResumeSectionKind, "other">, readonly string[]>> = deepFreeze({
  contact: [
    "contacto",
    "datos de contacto",
    "informacion de contacto",
    "contact",
    "contact details",
    "contact information",
  ],
  summary: [
    "perfil",
    "perfil profesional",
    "resumen",
    "resumen profesional",
    "objetivo profesional",
    "professional profile",
    "professional summary",
    "summary",
    "profile",
  ],
  experience: [
    "experiencia",
    "experiencia profesional",
    "experiencia laboral",
    "historial profesional",
    "work experience",
    "professional experience",
    "employment history",
    "experience",
  ],
  education: [
    "formacion",
    "formacion academica",
    "educacion",
    "estudios",
    "academic background",
    "education",
    "studies",
  ],
  skills: [
    "habilidades",
    "competencias",
    "competencias tecnicas",
    "aptitudes",
    "conocimientos",
    "skills",
    "technical skills",
    "competencies",
    "core skills",
  ],
  languages: [
    "idiomas",
    "languages",
    "language skills",
  ],
  certifications: [
    "certificaciones",
    "cursos y certificaciones",
    "licencias y certificaciones",
    "certifications",
    "licenses and certifications",
    "courses and certifications",
  ],
  projects: [
    "proyectos",
    "proyectos destacados",
    "proyectos profesionales",
    "projects",
    "selected projects",
    "professional projects",
  ],
});

type SourceLine = Readonly<{
  text: string;
  number: number;
}>;

type HeadingDetection = Readonly<{
  kind: StructuredResumeSectionKind;
  confidence: StructuredResumeConfidence;
  originalHeading: string;
  warningCodes: readonly StructuredResumeWarningCode[];
}>;

const MAX_HEADING_LENGTH = 72;
const MAX_HEADING_WORDS = 8;
const BULLET_PATTERN = /^\s*(?:[-*•]|\d+[.)])\s+/u;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/iu;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/iu;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/u;
const DATE_LINE_PATTERN = /^\s*(?:19|20)\d{2}(?:[-/]\d{1,2}(?:[-/]\d{1,2})?)?\s*$/u;
const SENTENCE_END_PATTERN = /[.!?]$/u;
const PUNCTUATION_LIST_PATTERN = /[,;|]{2,}/u;
const ROLE_TITLE_PATTERN = /\b(?:developer|desarrollador|engineer|ingeniero|manager|lead|director|analyst|analista|consultant|consultor|frontend|backend|fullstack|software)\b/iu;

const ALIAS_ENTRIES = Object.entries(STRUCTURED_RESUME_ALIASES).flatMap(([kind, aliases]) =>
  aliases.map((alias) => ({
    kind: kind as Exclude<StructuredResumeSectionKind, "other">,
    alias,
    key: normalizeHeadingKey(alias),
  })),
);

export function parseStructuredResumeText(resumeText: string): StructuredResumeParseResult {
  if (typeof resumeText !== "string" || resumeText.trim().length === 0) {
    throw new Error(StructuredResumeErrorCode.InputInvalid);
  }
  if (resumeText.length > TAILORING_DEMO_LIMITS.resumeTextMaxLength) {
    throw new Error(DemoParserErrorCode.ResumeTooLong);
  }

  const sourceLines = splitSourceLines(resumeText);
  const headingIndexes = sourceLines
    .map((line, index) => ({ index, detection: detectHeading(line.text) }))
    .filter((item): item is { index: number; detection: HeadingDetection } => item.detection !== null);

  if (headingIndexes.length === 0) {
    const section = buildSection({
      index: 0,
      kind: "other",
      confidence: "low",
      headingLine: null,
      bodyLines: sourceLines,
      warnings: [StructuredResumeWarningCode.NoHeadings],
    });
    const draft = buildDraft([section], [StructuredResumeWarningCode.NoHeadings], sourceLines.length);
    return deepFreeze({ draft, warnings: draft.warningCodes });
  }

  const sections: StructuredResumeSection[] = [];
  if (headingIndexes[0].index > 0) {
    const initialLines = sourceLines.slice(0, headingIndexes[0].index);
    const initialKind = isSafeInitialContactBlock(initialLines) ? "contact" : "other";
    sections.push(buildSection({
      index: sections.length,
      kind: initialKind,
      confidence: initialKind === "contact" ? "medium" : "low",
      headingLine: null,
      bodyLines: initialLines,
      warnings: [
        initialKind === "contact"
          ? StructuredResumeWarningCode.InitialBlockClassifiedAsContact
          : StructuredResumeWarningCode.InitialBlockRequiresReview,
      ],
    }));
  }

  for (const [headingPosition, heading] of headingIndexes.entries()) {
    const nextHeading = headingIndexes[headingPosition + 1];
    const bodyStart = heading.index + 1;
    const bodyEnd = nextHeading === undefined ? sourceLines.length : nextHeading.index;
    const bodyLines = sourceLines.slice(bodyStart, bodyEnd);
    const hasVisibleBody = bodyLines.some((line) => line.text.trim().length > 0);
    sections.push(buildSection({
      index: sections.length,
      kind: heading.detection.kind,
      confidence: hasVisibleBody ? heading.detection.confidence : "low",
      headingLine: sourceLines[heading.index],
      bodyLines,
      warnings: [
        ...heading.detection.warningCodes,
        ...(hasVisibleBody ? [] : [StructuredResumeWarningCode.EmptySection]),
      ],
    }));
  }

  const warningCodes = sortedUnique(sections.flatMap((section) => section.warningCodes));
  const draft = buildDraft(sections, warningCodes, sourceLines.length);
  return deepFreeze({ draft, warnings: draft.warningCodes });
}

export function updateStructuredResumeSectionKind(
  draft: StructuredResumeDraft,
  sectionId: string,
  kind: StructuredResumeSectionKind,
): StructuredResumeDraft {
  assertStructuredResumeDraft(draft);
  if (!isStructuredResumeSectionKind(kind)) {
    throw new Error(StructuredResumeErrorCode.SectionInvalid);
  }
  let found = false;
  const sections = draft.sections.map((section) => {
    if (section.id !== sectionId) {
      return copySection(section);
    }
    found = true;
    return buildSectionFromExisting(section, kind, true);
  });
  if (!found) {
    throw new Error(StructuredResumeErrorCode.SectionInvalid);
  }
  return buildDraft(sections, sortedUnique(sections.flatMap((section) => section.warningCodes)), draft.lineCount);
}

export function buildParsedResumeFromStructuredDraft(draft: StructuredResumeDraft): ParsedResumeInput {
  assertStructuredResumeDraft(draft);

  const blocks = bodyBlocksFromDraft(draft);
  if (blocks.length === 0) {
    throw new Error(StructuredResumeErrorCode.DocumentInvalid);
  }
  if (blocks.length > TAILORING_DEMO_LIMITS.maxResumeBlocks) {
    throw new Error(DemoParserErrorCode.ResumeTooManyBlocks);
  }

  const evidences = blocks.map((block) => buildEvidence(block));
  const profile = buildProfile(evidences);
  const resumeDocument = buildResumeDocumentFromStructuredDraft(draft, evidences);
  return deepFreeze({ profile, evidences, resumeDocument, blocks });
}

export function buildResumeDocumentFromStructuredDraft(
  draft: StructuredResumeDraft,
  evidences: readonly Evidence[],
): ResumeDocument {
  assertStructuredResumeDraft(draft);
  const evidenceByBlockId = new Map<string, Evidence>();
  for (const evidence of evidences) {
    if (evidence.reference?.experienceId !== undefined) {
      evidenceByBlockId.set(evidence.reference.experienceId, evidence);
    }
  }

  const sections = draft.sections
    .map((section, sectionIndex) => {
      const blocks = section.lines
        .filter((line) => line.text.trim().length > 0)
        .map((line, blockIndex) => {
          const blockId = blockIdFor(sectionIndex, blockIndex);
          const evidence = line.role === "body" ? evidenceByBlockId.get(blockId) : undefined;
          return {
            blockId,
            kind: blockKindForLine(line),
            order: blockIndex,
            originalText: line.text,
            evidenceIds: evidence === undefined ? [] : [evidence.id],
            sourceLocator: {
              kind: "text_line",
              value: `line:${line.sourceLine}`,
            },
          };
        });

      return {
        sectionId: section.id,
        kind: resumeSectionKindFor(section.kind),
        label: section.originalHeading ?? STRUCTURED_RESUME_SECTION_LABELS[section.kind],
        order: sectionIndex,
        blocks,
      };
    })
    .filter((section) => section.blocks.length > 0);

  if (sections.length === 0) {
    throw new Error(StructuredResumeErrorCode.DocumentInvalid);
  }

  try {
    return buildResumeDocument({
      documentId: "demo_resume_document",
      profileId: "demo_profile",
      source: { format: "plain_text" },
      sections,
      evidences: [...evidences],
    });
  } catch {
    throw new Error(StructuredResumeErrorCode.DocumentInvalid);
  }
}

export function assertStructuredResumeDraft(value: unknown): asserts value is StructuredResumeDraft {
  if (!isRecord(value) || value.draftId !== "structured_resume_draft") {
    throw new Error(StructuredResumeErrorCode.DraftInvalid);
  }
  if (Object.keys(value).some((key) => !["draftId", "sections", "warningCodes", "lineCount"].includes(key))) {
    throw new Error(StructuredResumeErrorCode.DraftInvalid);
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0 || !Array.isArray(value.warningCodes)) {
    throw new Error(StructuredResumeErrorCode.DraftInvalid);
  }
  for (const section of value.sections) {
    assertStructuredResumeSection(section);
  }
  for (const warningCode of value.warningCodes) {
    if (!isStructuredResumeWarningCode(warningCode)) {
      throw new Error(StructuredResumeErrorCode.DraftInvalid);
    }
  }
}

export function normalizeHeadingForComparison(value: string): string {
  return normalizeHeadingKey(value);
}

function detectHeading(text: string): HeadingDetection | null {
  if (!isHeadingCandidate(text)) {
    return null;
  }
  const key = normalizeHeadingKey(text);
  const exact = ALIAS_ENTRIES.find((entry) => entry.key === key);
  if (exact !== undefined) {
    return {
      kind: exact.kind,
      confidence: "high",
      originalHeading: text,
      warningCodes: [],
    };
  }

  const contained = ALIAS_ENTRIES.find((entry) =>
    key.length > entry.key.length &&
    (key.startsWith(`${entry.key} `) || key.endsWith(` ${entry.key}`)),
  );
  if (contained !== undefined && isTitleLike(text)) {
    return {
      kind: contained.kind,
      confidence: "medium",
      originalHeading: text,
      warningCodes: [],
    };
  }

  if (isUnknownHeadingLike(text)) {
    return {
      kind: "other",
      confidence: "low",
      originalHeading: text,
      warningCodes: [StructuredResumeWarningCode.ReviewOtherSection],
    };
  }

  return null;
}

function isHeadingCandidate(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_HEADING_LENGTH) {
    return false;
  }
  if (BULLET_PATTERN.test(trimmed) || URL_PATTERN.test(trimmed) || EMAIL_PATTERN.test(trimmed) || PHONE_PATTERN.test(trimmed)) {
    return false;
  }
  if (DATE_LINE_PATTERN.test(trimmed) || SENTENCE_END_PATTERN.test(trimmed) || PUNCTUATION_LIST_PATTERN.test(trimmed)) {
    return false;
  }
  const words = trimmed.split(/\s+/u).filter(Boolean);
  if (words.length > MAX_HEADING_WORDS) {
    return false;
  }
  if (words.length > 3 && /[a-z]/u.test(trimmed) && trimmed === trimmed.toLocaleLowerCase("es")) {
    return false;
  }
  return true;
}

function isTitleLike(text: string): boolean {
  const trimmed = text.trim().replace(/:$/u, "");
  return trimmed === trimmed.toLocaleUpperCase("es") || /^[\p{Lu}\p{N}][\p{L}\p{N}&/ -]*$/u.test(trimmed);
}

function isUnknownHeadingLike(text: string): boolean {
  const raw = text.trim();
  const trimmed = raw.replace(/:$/u, "");
  const words = trimmed.split(/\s+/u).filter(Boolean);
  const isUppercaseText = /\p{L}/u.test(trimmed) && trimmed === trimmed.toLocaleUpperCase("es");
  const strongHeadingFormat = raw.endsWith(":") || isUppercaseText;
  return (
    strongHeadingFormat &&
    words.length <= 4 &&
    isTitleLike(trimmed) &&
    !/[,;|]/u.test(trimmed) &&
    !ROLE_TITLE_PATTERN.test(trimmed)
  );
}

function buildSection({
  index,
  kind,
  confidence,
  headingLine,
  bodyLines,
  warnings,
}: {
  index: number;
  kind: StructuredResumeSectionKind;
  confidence: StructuredResumeConfidence;
  headingLine: SourceLine | null;
  bodyLines: readonly SourceLine[];
  warnings: readonly StructuredResumeWarningCode[];
}): StructuredResumeSection {
  const lines: StructuredResumeLine[] = [];
  if (headingLine !== null) {
    lines.push({
      id: lineIdFor(index, 0),
      text: headingLine.text,
      sourceLine: headingLine.number,
      role: "heading",
    });
  }
  for (const [bodyIndex, line] of bodyLines.entries()) {
    lines.push({
      id: lineIdFor(index, lines.length),
      text: line.text,
      sourceLine: line.number,
      role: "body",
    });
  }

  const visibleLines = lines.filter((line) => line.text.trim().length > 0);
  const firstLine = visibleLines[0] ?? lines[0];
  const lastLine = visibleLines[visibleLines.length - 1] ?? lines[lines.length - 1];
  return deepFreeze({
    id: sectionIdFor(index),
    kind,
    detectedHeading: headingLine?.text.trim() ?? null,
    originalHeading: headingLine?.text ?? null,
    sourceStartLine: firstLine?.sourceLine ?? 1,
    sourceEndLine: lastLine?.sourceLine ?? firstLine?.sourceLine ?? 1,
    lines,
    confidence,
    warningCodes: sortedUnique(warnings),
    wasManuallyReviewed: false,
  });
}

function buildSectionFromExisting(
  section: StructuredResumeSection,
  kind: StructuredResumeSectionKind,
  wasManuallyReviewed: boolean,
): StructuredResumeSection {
  const warnings = kind === "other"
    ? sortedUnique([...section.warningCodes, StructuredResumeWarningCode.ReviewOtherSection])
    : section.warningCodes.filter((warning) => warning !== StructuredResumeWarningCode.ReviewOtherSection);
  return deepFreeze({
    ...copySection(section),
    kind,
    confidence: wasManuallyReviewed ? "medium" : section.confidence,
    warningCodes: sortedUnique(warnings),
    wasManuallyReviewed,
  });
}

function buildDraft(
  sections: readonly StructuredResumeSection[],
  warningCodes: readonly StructuredResumeWarningCode[],
  lineCount: number,
): StructuredResumeDraft {
  const draft = {
    draftId: "structured_resume_draft" as const,
    sections: sections.map(copySection),
    warningCodes: sortedUnique(warningCodes),
    lineCount,
  };
  assertStructuredResumeDraft(draft);
  return deepFreeze(draft);
}

function bodyBlocksFromDraft(draft: StructuredResumeDraft): ParsedResumeBlock[] {
  const blocks: ParsedResumeBlock[] = [];
  for (const [sectionIndex, section] of draft.sections.entries()) {
    for (const [blockIndex, line] of section.lines.filter((item) => item.text.trim().length > 0).entries()) {
      if (line.role !== "body") {
        continue;
      }
      const blockId = blockIdFor(sectionIndex, blockIndex);
      blocks.push({
        blockId,
        evidenceId: evidenceIdFor(blocks.length),
        text: line.text,
        order: blocks.length,
      });
    }
  }
  return blocks;
}

function buildEvidence(block: ParsedResumeBlock): Evidence {
  const result = EvidenceSchema.safeParse({
    id: block.evidenceId,
    type: "experience",
    title: shortTitle(block.text),
    description: block.text,
    associatedCompetency: primarySignal(block.text),
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

function buildProfile(evidences: Evidence[]): Profile {
  const result = ProfileSchema.safeParse({
    id: "demo_profile",
    professionalTitle: "Perfil importado desde texto",
    headline: "Contenido pegado localmente para una demo determinista",
    location: { remoteFriendly: true },
    targetRoles: ["Rol objetivo"],
    targetIndustries: ["Industria no especificada"],
    professionalLevel: "unspecified",
    experience: evidences.map((evidence, index) => ({
      id: `experience_${String(index + 1).padStart(3, "0")}`,
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

function assertStructuredResumeSection(value: unknown): asserts value is StructuredResumeSection {
  if (!isRecord(value)) {
    throw new Error(StructuredResumeErrorCode.SectionInvalid);
  }
  const allowedKeys = [
    "id",
    "kind",
    "detectedHeading",
    "originalHeading",
    "sourceStartLine",
    "sourceEndLine",
    "lines",
    "confidence",
    "warningCodes",
    "wasManuallyReviewed",
  ];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new Error(StructuredResumeErrorCode.SectionInvalid);
  }
  if (
    typeof value.id !== "string" ||
    !isStructuredResumeSectionKind(value.kind) ||
    !isStructuredResumeConfidence(value.confidence) ||
    !Array.isArray(value.lines) ||
    !Array.isArray(value.warningCodes) ||
    typeof value.wasManuallyReviewed !== "boolean" ||
    typeof value.sourceStartLine !== "number" ||
    typeof value.sourceEndLine !== "number" ||
    value.sourceStartLine < 1 ||
    value.sourceEndLine < value.sourceStartLine
  ) {
    throw new Error(StructuredResumeErrorCode.SectionInvalid);
  }
  for (const line of value.lines) {
    if (!isRecord(line) || Object.keys(line).some((key) => !["id", "text", "sourceLine", "role"].includes(key))) {
      throw new Error(StructuredResumeErrorCode.SectionInvalid);
    }
    if (typeof line.id !== "string" || typeof line.text !== "string" || typeof line.sourceLine !== "number") {
      throw new Error(StructuredResumeErrorCode.SectionInvalid);
    }
    if (line.role !== "heading" && line.role !== "body") {
      throw new Error(StructuredResumeErrorCode.SectionInvalid);
    }
  }
  for (const warningCode of value.warningCodes) {
    if (!isStructuredResumeWarningCode(warningCode)) {
      throw new Error(StructuredResumeErrorCode.SectionInvalid);
    }
  }
}

function isStructuredResumeSectionKind(value: unknown): value is StructuredResumeSectionKind {
  return typeof value === "string" && StructuredResumeSectionKind.some((kind) => kind === value);
}

function isStructuredResumeConfidence(value: unknown): value is StructuredResumeConfidence {
  return typeof value === "string" && StructuredResumeConfidence.some((confidence) => confidence === value);
}

function isStructuredResumeWarningCode(value: unknown): value is StructuredResumeWarningCode {
  return typeof value === "string" && Object.values(StructuredResumeWarningCode).some((code) => code === value);
}

function splitSourceLines(value: string): SourceLine[] {
  return value.split(/\r\n|\n|\r/u).map((text, index) => ({ text, number: index + 1 }));
}

function normalizeHeadingKey(value: string): string {
  return value
    .trim()
    .replace(/:$/u, "")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function isSafeInitialContactBlock(lines: readonly SourceLine[]): boolean {
  const visible = lines.map((line) => line.text.trim()).filter((line) => line.length > 0);
  if (visible.length === 0 || visible.length > 6) {
    return false;
  }
  const joined = visible.join("\n");
  return EMAIL_PATTERN.test(joined) || PHONE_PATTERN.test(joined) || URL_PATTERN.test(joined);
}

function blockKindForLine(line: StructuredResumeLine): ResumeBlockKind {
  if (line.role === "heading") {
    return "heading";
  }
  return BULLET_PATTERN.test(line.text) ? "bullet" : "paragraph";
}

function resumeSectionKindFor(kind: StructuredResumeSectionKind): ResumeSectionKind {
  const mapping: Record<StructuredResumeSectionKind, ResumeSectionKind> = {
    contact: "header",
    summary: "summary",
    experience: "experience",
    education: "education",
    skills: "skills",
    languages: "languages",
    certifications: "certifications",
    projects: "projects",
    other: "other",
  };
  return mapping[kind];
}

function shortTitle(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}...`;
}

function primarySignal(value: string): string | undefined {
  return significantTokens(value)[0];
}

function copySection(section: StructuredResumeSection): StructuredResumeSection {
  return deepFreeze({
    id: section.id,
    kind: section.kind,
    detectedHeading: section.detectedHeading,
    originalHeading: section.originalHeading,
    sourceStartLine: section.sourceStartLine,
    sourceEndLine: section.sourceEndLine,
    lines: section.lines.map((line) => ({ ...line })),
    confidence: section.confidence,
    warningCodes: [...section.warningCodes],
    wasManuallyReviewed: section.wasManuallyReviewed,
  });
}

function sectionIdFor(index: number): string {
  return `section-${String(index).padStart(3, "0")}`;
}

function lineIdFor(sectionIndex: number, lineIndex: number): string {
  return `${sectionIdFor(sectionIndex)}-line-${String(lineIndex).padStart(3, "0")}`;
}

function blockIdFor(sectionIndex: number, blockIndex: number): string {
  return `${sectionIdFor(sectionIndex)}-block-${String(blockIndex).padStart(3, "0")}`;
}

function evidenceIdFor(index: number): string {
  return `evidence_${String(index + 1).padStart(3, "0")}`;
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values)).sort(compareStable);
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
