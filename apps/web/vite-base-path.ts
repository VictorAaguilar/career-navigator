export const CAREER_NAVIGATOR_BASE_PATH_ENV = "CAREER_NAVIGATOR_BASE_PATH";
export const CAREER_NAVIGATOR_BASE_PATH_INVALID = "CAREER_NAVIGATOR_BASE_PATH_INVALID";

export function resolveCareerNavigatorBasePath(value = process.env[CAREER_NAVIGATOR_BASE_PATH_ENV]): string {
  if (value === undefined || value === "") {
    return "/";
  }
  if (hasControlCharacter(value)) {
    throwInvalidBasePath("control characters are not allowed");
  }
  if (value.includes("\\")) {
    throwInvalidBasePath("backslashes are not allowed");
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(value)) {
    throwInvalidBasePath("absolute URLs and protocols are not allowed");
  }
  if (value.startsWith("//")) {
    throwInvalidBasePath("protocol-relative URLs are not allowed");
  }
  if (!value.startsWith("/")) {
    throwInvalidBasePath("base path must start with /");
  }
  if (value.includes("..")) {
    throwInvalidBasePath("path traversal is not allowed");
  }
  if (value.includes("?")) {
    throwInvalidBasePath("query strings are not allowed");
  }
  if (value.includes("#")) {
    throwInvalidBasePath("fragments are not allowed");
  }
  return value.endsWith("/") ? value : `${value}/`;
}

function hasControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value);
}

function throwInvalidBasePath(reason: string): never {
  throw new Error(`${CAREER_NAVIGATOR_BASE_PATH_INVALID}: ${reason}.`);
}
