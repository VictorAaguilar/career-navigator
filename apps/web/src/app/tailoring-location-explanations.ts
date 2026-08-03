import type { Evidence } from "../../../../src/schemas/evidence.js";
import type { ResumeDocument, ResumeSectionKind } from "../../../../src/schemas/resume.js";
import type { TailoringTargetResolution } from "../../../../src/schemas/targeting.js";
import { ResumeDocumentSchema } from "../../../../src/schemas/resume.js";
import {
  STRUCTURED_RESUME_SECTION_LABELS,
  type StructuredResumeSectionKind,
} from "./structured-resume-parsing.js";

export const ResumeLocationSource = Object.freeze(["structured", "plain"] as const);
export type ResumeLocationSource = (typeof ResumeLocationSource)[number];

export const ResumeLocationStatus = Object.freeze(["resolved", "ambiguous", "unresolved"] as const);
export type ResumeLocationStatus = (typeof ResumeLocationStatus)[number];

export const ResumeLocationWarningCode = {
  ApproximatePlainText: "TAILORING_LOCATION_APPROXIMATE_PLAIN_TEXT",
  AmbiguousTarget: "TAILORING_LOCATION_AMBIGUOUS_TARGET",
  UnresolvedTarget: "TAILORING_LOCATION_UNRESOLVED",
  HeadingHidden: "TAILORING_LOCATION_HEADING_HIDDEN",
} as const;
export type ResumeLocationWarningCode =
  (typeof ResumeLocationWarningCode)[keyof typeof ResumeLocationWarningCode];

export const TailoringLocationErrorCode = {
  IndexInvalid: "TAILORING_LOCATION_INDEX_INVALID",
  DuplicateId: "TAILORING_LOCATION_DUPLICATE_ID",
  NotFound: "TAILORING_LOCATION_NOT_FOUND",
  Ambiguous: "TAILORING_LOCATION_AMBIGUOUS",
  ExplanationInvalid: "TAILORING_EXPLANATION_INVALID",
} as const;
export type TailoringLocationErrorCode =
  (typeof TailoringLocationErrorCode)[keyof typeof TailoringLocationErrorCode];

export const TailoringTargetingReasonCode = Object.freeze([
  "evidence_block_match",
  "structured_section_match",
  "existing_target_resolution",
  "plain_text_position",
  "ambiguous_target",
  "unresolved_target",
] as const);
export type TailoringTargetingReasonCode = (typeof TailoringTargetingReasonCode)[number];

export type ResumeLocationReference = Readonly<{
  source: ResumeLocationSource;
  status: ResumeLocationStatus;
  sectionKind: ResumeSectionKind | null;
  sectionOrdinal: number | null;
  blockOrdinal: number | null;
  originalHeading: string | null;
  internalSectionId: string | null;
  internalBlockId: string | null;
  warningCodes: readonly ResumeLocationWarningCode[];
}>;

export type ResumeLocationIndex = Readonly<{
  documentId: string;
  profileId: string;
  source: ResumeLocationSource;
  sectionIds: readonly string[];
  blockIds: readonly string[];
  locationsByBlockId: Readonly<Record<string, ResumeLocationReference>>;
  summary: Readonly<{
    totalSections: number;
    totalBlocks: number;
    resolvedBlocks: number;
    approximateBlocks: number;
  }>;
}>;

const RESUME_SECTION_KIND_LABELS: Readonly<Record<ResumeSectionKind, string>> = deepFreeze({
  header: STRUCTURED_RESUME_SECTION_LABELS.contact,
  summary: STRUCTURED_RESUME_SECTION_LABELS.summary,
  experience: STRUCTURED_RESUME_SECTION_LABELS.experience,
  education: STRUCTURED_RESUME_SECTION_LABELS.education,
  skills: STRUCTURED_RESUME_SECTION_LABELS.skills,
  languages: STRUCTURED_RESUME_SECTION_LABELS.languages,
  certifications: STRUCTURED_RESUME_SECTION_LABELS.certifications,
  projects: STRUCTURED_RESUME_SECTION_LABELS.projects,
  publications: `${STRUCTURED_RESUME_SECTION_LABELS.other} sección`,
  volunteering: `${STRUCTURED_RESUME_SECTION_LABELS.other} sección`,
  other: `${STRUCTURED_RESUME_SECTION_LABELS.other} sección`,
});

const STRUCTURED_SECTION_KIND_BY_RESUME_KIND: Readonly<Record<ResumeSectionKind, StructuredResumeSectionKind>> = deepFreeze({
  header: "contact",
  summary: "summary",
  experience: "experience",
  education: "education",
  skills: "skills",
  languages: "languages",
  certifications: "certifications",
  projects: "projects",
  publications: "other",
  volunteering: "other",
  other: "other",
});

const SAFE_HEADING_MAX_LENGTH = 72;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/iu;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/u;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/iu;

export function buildResumeLocationIndex(resumeDocument: ResumeDocument): ResumeLocationIndex {
  validateResumeDocumentForLocation(resumeDocument);

  const source = inferLocationSource(resumeDocument);
  const locationsByBlockId: Record<string, ResumeLocationReference> = {};
  const sectionIds: string[] = [];
  const blockIds: string[] = [];
  let approximateBlocks = 0;

  for (const [sectionIndex, section] of resumeDocument.sections.entries()) {
    sectionIds.push(section.sectionId);
    const originalHeading = safeOriginalHeading(section.kind, section.label);
    for (const [blockIndex, block] of section.blocks.entries()) {
      blockIds.push(block.blockId);
      const warningCodes: ResumeLocationWarningCode[] =
        source === "plain" ? [ResumeLocationWarningCode.ApproximatePlainText] : [];
      if (source === "plain") {
        approximateBlocks += 1;
      }
      if (source === "structured" && section.kind === "other" && originalHeading === null && section.label.trim().length > 0) {
        warningCodes.push(ResumeLocationWarningCode.HeadingHidden);
      }
      locationsByBlockId[block.blockId] = buildLocationReference({
        source,
        status: "resolved",
        sectionKind: section.kind,
        sectionOrdinal: sectionIndex + 1,
        blockOrdinal: blockIndex + 1,
        originalHeading,
        internalSectionId: section.sectionId,
        internalBlockId: block.blockId,
        warningCodes,
      });
    }
  }

  return deepFreeze({
    documentId: resumeDocument.documentId,
    profileId: resumeDocument.profileId,
    source,
    sectionIds,
    blockIds,
    locationsByBlockId,
    summary: {
      totalSections: sectionIds.length,
      totalBlocks: blockIds.length,
      resolvedBlocks: blockIds.length,
      approximateBlocks,
    },
  });
}

export function resolveEvidenceLocation(
  evidence: Evidence,
  locationIndex: ResumeLocationIndex,
): ResumeLocationReference {
  const blockId = evidence.reference?.experienceId;
  if (blockId === undefined) {
    return unresolvedLocation(locationIndex.source);
  }
  return resolveBlockLocation(locationIndex, blockId);
}

export function resolveBlockLocation(
  locationIndex: ResumeLocationIndex,
  blockId: string,
): ResumeLocationReference {
  const location = locationIndex.locationsByBlockId[blockId];
  if (location === undefined) {
    return unresolvedLocation(locationIndex.source);
  }
  return copyLocationReference(location);
}

export function resolveTargetLocation(
  resolution: TailoringTargetResolution,
  locationIndex: ResumeLocationIndex,
): ResumeLocationReference {
  if (resolution.status === "resolved") {
    return resolveBlockLocation(locationIndex, resolution.selectedBlockIds[0]);
  }
  if (resolution.status === "ambiguous") {
    return buildLocationReference({
      source: locationIndex.source,
      status: "ambiguous",
      sectionKind: null,
      sectionOrdinal: null,
      blockOrdinal: null,
      originalHeading: null,
      internalSectionId: null,
      internalBlockId: null,
      warningCodes: [ResumeLocationWarningCode.AmbiguousTarget],
    });
  }
  return unresolvedLocation(locationIndex.source);
}

export function reasonCodesForTargetLocation(
  location: ResumeLocationReference,
): readonly TailoringTargetingReasonCode[] {
  if (location.status === "ambiguous") {
    return ["ambiguous_target"];
  }
  if (location.status === "unresolved") {
    return ["unresolved_target"];
  }
  const codes: TailoringTargetingReasonCode[] = ["existing_target_resolution", "evidence_block_match"];
  if (location.source === "plain") {
    codes.push("plain_text_position");
  } else if (location.sectionKind !== null) {
    codes.push("structured_section_match");
  }
  return deepFreeze(codes);
}

export function formatResumeLocationLabel(location: ResumeLocationReference): string {
  assertResumeLocationReference(location);
  if (location.status === "unresolved") {
    return "Ubicación no disponible";
  }
  if (location.status === "ambiguous") {
    return "Ubicación aproximada";
  }
  if (location.source === "plain") {
    return `Texto del currículum · párrafo ${location.blockOrdinal ?? 1}`;
  }

  const sectionLabel = visibleSectionLabel(location);
  const headingSuffix = location.sectionKind === "other" && location.originalHeading !== null
    ? `: ${location.originalHeading}`
    : "";
  return `${sectionLabel}${headingSuffix} · bloque ${location.blockOrdinal ?? 1}`;
}

export function formatResumeLocationDetail(location: ResumeLocationReference): string {
  assertResumeLocationReference(location);
  if (location.status === "unresolved") {
    return "No fue posible determinar una ubicación segura.";
  }
  if (location.status === "ambiguous") {
    return "La ubicación es aproximada; revisa el bloque antes de aceptar el cambio.";
  }
  if (location.source === "plain") {
    return `Ubicación aproximada por párrafo ${location.blockOrdinal ?? 1} del texto plano.`;
  }
  return `Sección ${visibleSectionLabel(location)}, bloque ${location.blockOrdinal ?? 1}.`;
}

export function formatResumeLocationWarning(code: ResumeLocationWarningCode): string {
  if (code === ResumeLocationWarningCode.ApproximatePlainText) {
    return "La ubicación es aproximada porque se utiliza el análisis de texto plano.";
  }
  if (code === ResumeLocationWarningCode.AmbiguousTarget) {
    return "Revisa el bloque antes de aceptar el cambio.";
  }
  if (code === ResumeLocationWarningCode.UnresolvedTarget) {
    return "No fue posible determinar una ubicación segura.";
  }
  if (code === ResumeLocationWarningCode.HeadingHidden) {
    return "El encabezado original no se muestra porque puede contener datos sensibles.";
  }
  throwLocationError(TailoringLocationErrorCode.ExplanationInvalid);
}

export function formatTargetingReasonLabel(
  code: TailoringTargetingReasonCode,
  location: ResumeLocationReference,
): string {
  assertResumeLocationReference(location);
  if (!TailoringTargetingReasonCode.some((item) => item === code)) {
    throwLocationError(TailoringLocationErrorCode.ExplanationInvalid);
  }
  if (code === "evidence_block_match") {
    return "Este bloque contiene la evidencia relacionada con el requisito.";
  }
  if (code === "structured_section_match") {
    return `Esta ubicación corresponde a la sección revisada de ${visibleSectionLabel(location)}.`;
  }
  if (code === "existing_target_resolution") {
    return "Este bloque fue seleccionado por la resolución determinista de targeting.";
  }
  if (code === "plain_text_position") {
    return "La ubicación es aproximada porque se utiliza el análisis de texto plano.";
  }
  if (code === "ambiguous_target") {
    return "La ubicación es aproximada; revisa el bloque antes de aceptar el cambio.";
  }
  return "No fue posible determinar una ubicación segura.";
}

export function assertResumeLocationReference(value: unknown): asserts value is ResumeLocationReference {
  if (!isRecord(value)) {
    throwLocationError(TailoringLocationErrorCode.ExplanationInvalid);
  }
  const allowedKeys = [
    "source",
    "status",
    "sectionKind",
    "sectionOrdinal",
    "blockOrdinal",
    "originalHeading",
    "internalSectionId",
    "internalBlockId",
    "warningCodes",
  ];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throwLocationError(TailoringLocationErrorCode.ExplanationInvalid);
  }
  if (!ResumeLocationSource.some((source) => source === value.source)) {
    throwLocationError(TailoringLocationErrorCode.ExplanationInvalid);
  }
  if (!ResumeLocationStatus.some((status) => status === value.status)) {
    throwLocationError(TailoringLocationErrorCode.ExplanationInvalid);
  }
  if (!Array.isArray(value.warningCodes) || value.warningCodes.some((code) => !isResumeLocationWarningCode(code))) {
    throwLocationError(TailoringLocationErrorCode.ExplanationInvalid);
  }
}

export function assertResumeLocationIndex(value: unknown): asserts value is ResumeLocationIndex {
  if (!isRecord(value)) {
    throwLocationError(TailoringLocationErrorCode.IndexInvalid);
  }
  const allowedKeys = [
    "documentId",
    "profileId",
    "source",
    "sectionIds",
    "blockIds",
    "locationsByBlockId",
    "summary",
  ];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throwLocationError(TailoringLocationErrorCode.IndexInvalid);
  }
  if (
    typeof value.documentId !== "string" ||
    typeof value.profileId !== "string" ||
    !ResumeLocationSource.some((source) => source === value.source) ||
    !Array.isArray(value.sectionIds) ||
    !Array.isArray(value.blockIds) ||
    !isRecord(value.locationsByBlockId) ||
    !isRecord(value.summary)
  ) {
    throwLocationError(TailoringLocationErrorCode.IndexInvalid);
  }
  for (const location of Object.values(value.locationsByBlockId)) {
    assertResumeLocationReference(location);
  }
}

function validateResumeDocumentForLocation(resumeDocument: ResumeDocument): void {
  if (!resumeDocument || !Array.isArray(resumeDocument.sections)) {
    throwLocationError(TailoringLocationErrorCode.IndexInvalid);
  }
  assertUniqueIds(
    resumeDocument.sections.map((section) => section.sectionId),
    TailoringLocationErrorCode.DuplicateId,
  );
  assertUniqueIds(
    resumeDocument.sections.flatMap((section) => section.blocks.map((block) => block.blockId)),
    TailoringLocationErrorCode.DuplicateId,
  );
  const result = ResumeDocumentSchema.safeParse(resumeDocument);
  if (!result.success) {
    throwLocationError(TailoringLocationErrorCode.IndexInvalid);
  }
}

function inferLocationSource(resumeDocument: ResumeDocument): ResumeLocationSource {
  const sections = resumeDocument.sections;
  const blocks = sections.flatMap((section) => section.blocks);
  const hasPlainSignal =
    sections.some((section) => section.sectionId.startsWith("demo_resume_section_")) ||
    blocks.some((block) => block.blockId.startsWith("resume_block_") || block.sourceLocator?.kind === "text_offset");
  const hasStructuredSignal =
    sections.some((section) => section.sectionId.startsWith("section-")) ||
    blocks.some((block) => block.blockId.startsWith("section-") || block.sourceLocator?.kind === "text_line");

  if (hasPlainSignal && hasStructuredSignal) {
    throwLocationError(TailoringLocationErrorCode.IndexInvalid);
  }
  return hasPlainSignal ? "plain" : "structured";
}

function buildLocationReference(location: ResumeLocationReference): ResumeLocationReference {
  assertResumeLocationReference(location);
  return deepFreeze({
    source: location.source,
    status: location.status,
    sectionKind: location.sectionKind,
    sectionOrdinal: location.sectionOrdinal,
    blockOrdinal: location.blockOrdinal,
    originalHeading: location.originalHeading,
    internalSectionId: location.internalSectionId,
    internalBlockId: location.internalBlockId,
    warningCodes: sortedUnique(location.warningCodes),
  });
}

function unresolvedLocation(source: ResumeLocationSource): ResumeLocationReference {
  return buildLocationReference({
    source,
    status: "unresolved",
    sectionKind: null,
    sectionOrdinal: null,
    blockOrdinal: null,
    originalHeading: null,
    internalSectionId: null,
    internalBlockId: null,
    warningCodes: [ResumeLocationWarningCode.UnresolvedTarget],
  });
}

function copyLocationReference(location: ResumeLocationReference): ResumeLocationReference {
  return buildLocationReference({
    source: location.source,
    status: location.status,
    sectionKind: location.sectionKind,
    sectionOrdinal: location.sectionOrdinal,
    blockOrdinal: location.blockOrdinal,
    originalHeading: location.originalHeading,
    internalSectionId: location.internalSectionId,
    internalBlockId: location.internalBlockId,
    warningCodes: [...location.warningCodes],
  });
}

function visibleSectionLabel(location: ResumeLocationReference): string {
  if (location.sectionKind === null) {
    return "Ubicación";
  }
  const structuredKind = STRUCTURED_SECTION_KIND_BY_RESUME_KIND[location.sectionKind];
  if (structuredKind === "other") {
    return `${STRUCTURED_RESUME_SECTION_LABELS.other} sección`;
  }
  return RESUME_SECTION_KIND_LABELS[location.sectionKind];
}

function safeOriginalHeading(sectionKind: ResumeSectionKind, label: string): string | null {
  if (sectionKind === "header") {
    return null;
  }
  const trimmed = label.trim();
  if (trimmed.length === 0 || trimmed.length > SAFE_HEADING_MAX_LENGTH) {
    return null;
  }
  if (EMAIL_PATTERN.test(trimmed) || PHONE_PATTERN.test(trimmed) || URL_PATTERN.test(trimmed)) {
    return null;
  }
  const defaultLabel = RESUME_SECTION_KIND_LABELS[sectionKind];
  if (trimmed === defaultLabel || (sectionKind === "other" && trimmed === STRUCTURED_RESUME_SECTION_LABELS.other)) {
    return null;
  }
  return trimmed;
}

function assertUniqueIds(values: readonly string[], errorCode: TailoringLocationErrorCode): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throwLocationError(errorCode);
    }
    seen.add(value);
  }
}

function isResumeLocationWarningCode(value: unknown): value is ResumeLocationWarningCode {
  return typeof value === "string" && Object.values(ResumeLocationWarningCode).some((code) => code === value);
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values)).sort(compareStable);
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function throwLocationError(code: TailoringLocationErrorCode): never {
  throw new Error(code);
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
