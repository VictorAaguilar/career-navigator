import {
  JobImportError as JobImportErrorClass,
  JobImportErrorCode as JobImportErrorCodes,
  type JobImportSource,
} from "./job-file-import-contract";
import { TAILORING_DEMO_LIMITS } from "./tailoring-demo-limits";

export {
  getJobImportErrorMessage,
  JobImportError,
  JobImportErrorCode,
} from "./job-file-import-contract";
export type {
  JobImportSource,
} from "./job-file-import-contract";

export type JobImportFileLike = Readonly<{
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

export type JobImportResult = Readonly<{
  source: Exclude<JobImportSource, "manual">;
  text: string;
}>;

const TXT_MIME = "text/plain";
const MARKDOWN_MIME_VALUES = Object.freeze([TXT_MIME, "text/markdown", "text/x-markdown"]);

export async function importJobFile(file: JobImportFileLike): Promise<JobImportResult> {
  const source = getJobImportSource(file);
  const bytes = await readJobImportBytes(file);
  const text = normalizeImportedJobText(decodeUtf8(bytes));
  if (text.trim().length === 0) {
    throw new JobImportErrorClass(JobImportErrorCodes.EmptyText);
  }
  if (text.length > TAILORING_DEMO_LIMITS.jobTextMaxLength) {
    throw new JobImportErrorClass(JobImportErrorCodes.TextTooLarge);
  }
  return deepFreeze({ source, text });
}

export function getJobImportSource(file: JobImportFileLike | null | undefined): Exclude<JobImportSource, "manual"> {
  if (file === null || file === undefined) {
    throw new JobImportErrorClass(JobImportErrorCodes.FileRequired);
  }
  if (file.size <= 0) {
    throw new JobImportErrorClass(JobImportErrorCodes.EmptyText);
  }
  if (file.size > TAILORING_DEMO_LIMITS.jobImportFileMaxBytes) {
    throw new JobImportErrorClass(JobImportErrorCodes.FileTooLarge);
  }

  const extension = getLowercaseExtension(file.name);
  if (extension !== ".txt" && extension !== ".md" && extension !== ".markdown") {
    throw new JobImportErrorClass(JobImportErrorCodes.TypeUnsupported);
  }
  if (file.type !== "" && extension === ".txt" && !file.type.startsWith(TXT_MIME)) {
    throw new JobImportErrorClass(JobImportErrorCodes.TypeUnsupported);
  }
  if (
    file.type !== "" &&
    (extension === ".md" || extension === ".markdown") &&
    !MARKDOWN_MIME_VALUES.includes(file.type)
  ) {
    throw new JobImportErrorClass(JobImportErrorCodes.TypeUnsupported);
  }

  return extension === ".txt" ? "txt" : "md";
}

async function readJobImportBytes(file: JobImportFileLike): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    throw new JobImportErrorClass(JobImportErrorCodes.EmptyText);
  }
  return bytes;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new JobImportErrorClass(JobImportErrorCodes.DecodeFailed);
  }
}

function normalizeImportedJobText(value: string): string {
  return value
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/gu, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function getLowercaseExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
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
