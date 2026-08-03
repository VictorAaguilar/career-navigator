import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeWebBundle, assertWebBundleBudget } from "./web-bundle-budget.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PAGES_ARTIFACT_BASE_PATH = "/career-navigator/";
export const PAGES_ARTIFACT_CHECK_FAILED = "PAGES_ARTIFACT_CHECK_FAILED";

const FORBIDDEN_PATTERNS = Object.freeze([
  /^\.env(?:\.|$)/iu,
  /^\.git(?:\/|$)/iu,
  /(?:^|\/)node_modules(?:\/|$)/iu,
  /(?:^|\/)test-results(?:\/|$)/iu,
  /(?:^|\/)playwright-report(?:\/|$)/iu,
  /\.(?:docx|pdf|log|tmp|bak|map)$/iu,
  /(?:^|\/)(?:cv|resume|curriculum|offer|job-description)\.(?:md|txt|pdf|docx)$/iu,
]);

export function inspectPagesArtifact({
  distDir = resolve(repoRoot, "apps", "web", "dist"),
  basePath = PAGES_ARTIFACT_BASE_PATH,
} = {}) {
  const resolvedDist = resolve(distDir);
  const findings = [];
  const files = [];

  try {
    const distStat = statSync(resolvedDist);
    if (!distStat.isDirectory()) {
      findings.push("PAGES_ARTIFACT_DIST_NOT_DIRECTORY");
    }
  } catch {
    findings.push("PAGES_ARTIFACT_DIST_MISSING");
    return freezeReport(resolvedDist, files, findings);
  }

  walkDist(resolvedDist, resolvedDist, files, findings);

  const indexPath = resolve(resolvedDist, "index.html");
  if (!files.includes("index.html")) {
    findings.push("PAGES_ARTIFACT_INDEX_MISSING");
  } else {
    const html = readFileSync(indexPath, "utf8");
    if (!html.includes(`${basePath}assets/`)) {
      findings.push("PAGES_ARTIFACT_BASE_PATH_MISSING");
    }
    if (/\b(?:src|href)=["']\/assets\//iu.test(html)) {
      findings.push("PAGES_ARTIFACT_ROOT_ASSET_REFERENCE");
    }
    const activeRefs = [
      ...extractAttributeValues(html, "script", "src"),
      ...extractAttributeValues(html, "link", "href").filter((href) => !href.startsWith("data:")),
    ];
    if (activeRefs.some((ref) => /^https?:\/\//iu.test(ref) || ref.startsWith("//") || /cdnjs|unpkg|jsdelivr/iu.test(ref))) {
      findings.push("PAGES_ARTIFACT_EXTERNAL_REFERENCE");
    }
  }

  try {
    assertWebBundleBudget(analyzeWebBundle({ distDir: resolvedDist, basePath }));
  } catch (error) {
    findings.push(error instanceof Error ? error.message.split("\n")[0] : String(error));
  }

  return freezeReport(resolvedDist, files, findings);
}

export function assertPagesArtifact(report = inspectPagesArtifact()) {
  if (report.findings.length > 0) {
    throw new Error([PAGES_ARTIFACT_CHECK_FAILED, ...report.findings].join("\n"));
  }
  return report;
}

function walkDist(root, current, files, findings) {
  for (const entry of readdirSync(current)) {
    const path = resolve(current, entry);
    const rel = relative(root, path).replace(/\\/gu, "/");
    const lst = lstatSync(path);
    if (lst.isSymbolicLink()) {
      findings.push(`PAGES_ARTIFACT_SYMLINK: ${rel}`);
      continue;
    }
    if (lst.isDirectory()) {
      walkDist(root, path, files, findings);
      continue;
    }
    files.push(rel);
    if (lst.nlink > 1) {
      findings.push(`PAGES_ARTIFACT_HARDLINK: ${rel}`);
    }
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(rel))) {
      findings.push(`PAGES_ARTIFACT_FORBIDDEN_FILE: ${rel}`);
    }
    const content = readFileSync(path, "utf8");
    if (/[A-Z]:\\+(?:CODEX|Users)|\/CODEX\/|\/Users\/tester\//u.test(content)) {
      findings.push(`PAGES_ARTIFACT_ABSOLUTE_PATH: ${rel}`);
    }
  }
}

function extractAttributeValues(html, tagName, attributeName) {
  const values = [];
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "giu");
  const attributePattern = new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, "iu");
  for (const match of html.matchAll(tagPattern)) {
    const attribute = attributePattern.exec(match[0]);
    if (attribute !== null) {
      values.push(attribute[1]);
    }
  }
  return values;
}

function freezeReport(distDir, files, findings) {
  return Object.freeze({
    distDir,
    files: Object.freeze([...files].sort(compareStable)),
    findings: Object.freeze([...new Set(findings)].sort(compareStable)),
  });
}

function compareStable(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = assertPagesArtifact();
    console.log(`PAGES_ARTIFACT_OK ${report.files.length} files`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
