import { readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const WEB_BUNDLE_BUDGETS = Object.freeze({
  initialJsBytes: 466_000,
  initialCssBytes: 16_000,
  initialHtmlBytes: 2_500,
});

export const HEAVY_INITIAL_ASSET_PATTERNS = Object.freeze([
  /pdf(?:\.worker)?[-.]/iu,
  /jszip/iu,
  /docx/iu,
]);

export function analyzeWebBundle({
  distDir = resolve(repoRoot, "apps", "web", "dist"),
  budgets = WEB_BUNDLE_BUDGETS,
} = {}) {
  const indexPath = resolve(distDir, "index.html");
  const html = readText(indexPath);
  const scripts = extractAttributeValues(html, "script", "src");
  const stylesheets = extractAttributeValues(html, "link", "href").filter((href) => href.endsWith(".css"));
  const initialAssets = [...scripts, ...stylesheets];
  const initialJs = scripts.filter((src) => src.endsWith(".js") || src.endsWith(".mjs"));
  const initialCss = stylesheets;
  const externalUrls = initialAssets.filter((asset) => /^https?:\/\//iu.test(asset));
  const heavyInitialAssets = initialAssets.filter((asset) =>
    HEAVY_INITIAL_ASSET_PATTERNS.some((pattern) => pattern.test(asset)),
  );
  const assetDetails = initialAssets
    .filter((asset) => !/^https?:\/\//iu.test(asset))
    .map((asset) => assetDetail(distDir, asset));
  const initialJsBytes = assetDetails
    .filter((asset) => asset.type === "js")
    .reduce((total, asset) => total + asset.bytes, 0);
  const initialCssBytes = assetDetails
    .filter((asset) => asset.type === "css")
    .reduce((total, asset) => total + asset.bytes, 0);
  const htmlBytes = Buffer.byteLength(html, "utf8");
  const assetNames = listInitialAssetNames(assetDetails);

  return Object.freeze({
    distDir,
    indexPath,
    budgets,
    htmlBytes,
    initialJsBytes,
    initialCssBytes,
    initialJs,
    initialCss,
    assetDetails: Object.freeze(assetDetails),
    assetNames: Object.freeze(assetNames),
    externalUrls: Object.freeze(externalUrls),
    heavyInitialAssets: Object.freeze(heavyInitialAssets),
    violations: Object.freeze(buildViolations({
      htmlBytes,
      initialJsBytes,
      initialCssBytes,
      initialJs,
      initialCss,
      externalUrls,
      heavyInitialAssets,
      budgets,
    })),
  });
}

export function assertWebBundleBudget(report = analyzeWebBundle()) {
  if (report.violations.length > 0) {
    throw new Error(formatBundleBudgetFailure(report));
  }
  return report;
}

export function formatBundleBudgetSummary(report) {
  return [
    `HTML inicial: ${report.htmlBytes} bytes / ${report.budgets.initialHtmlBytes}`,
    `JS inicial: ${report.initialJsBytes} bytes / ${report.budgets.initialJsBytes}`,
    `CSS inicial: ${report.initialCssBytes} bytes / ${report.budgets.initialCssBytes}`,
    `Assets iniciales: ${report.assetNames.join(", ")}`,
  ].join("\n");
}

export function formatBundleBudgetFailure(report) {
  return [
    "WEB_BUNDLE_BUDGET_FAILED",
    ...report.violations,
    formatBundleBudgetSummary(report),
  ].join("\n");
}

function buildViolations({
  htmlBytes,
  initialJsBytes,
  initialCssBytes,
  initialJs,
  initialCss,
  externalUrls,
  heavyInitialAssets,
  budgets,
}) {
  const violations = [];
  if (htmlBytes > budgets.initialHtmlBytes) {
    violations.push(`HTML inicial ${htmlBytes} bytes supera presupuesto ${budgets.initialHtmlBytes}.`);
  }
  if (initialJs.length === 0) {
    violations.push("No se encontró entry JS inicial en index.html.");
  }
  if (initialCss.length === 0) {
    violations.push("No se encontró CSS inicial en index.html.");
  }
  if (initialJsBytes > budgets.initialJsBytes) {
    violations.push(`JS inicial ${initialJsBytes} bytes supera presupuesto ${budgets.initialJsBytes}.`);
  }
  if (initialCssBytes > budgets.initialCssBytes) {
    violations.push(`CSS inicial ${initialCssBytes} bytes supera presupuesto ${budgets.initialCssBytes}.`);
  }
  if (externalUrls.length > 0) {
    violations.push(`Assets iniciales con URL externa: ${externalUrls.join(", ")}.`);
  }
  if (heavyInitialAssets.length > 0) {
    violations.push(`Chunks pesados cargados de inicio: ${heavyInitialAssets.join(", ")}.`);
  }
  return violations;
}

function assetDetail(distDir, asset) {
  const assetPath = resolveAssetPath(distDir, asset);
  const normalizedAsset = normalize(asset);
  return Object.freeze({
    asset,
    path: assetPath,
    name: relative(distDir, assetPath).replace(/\\/gu, "/"),
    type: normalizedAsset.endsWith(".css") ? "css" : "js",
    bytes: statSync(assetPath).size,
  });
}

function resolveAssetPath(distDir, asset) {
  if (/^https?:\/\//iu.test(asset)) {
    throw new Error(`WEB_BUNDLE_EXTERNAL_ASSET: ${asset}`);
  }
  const withoutQuery = asset.split("?")[0];
  const localPath = withoutQuery.startsWith("/")
    ? join(distDir, withoutQuery.slice(1))
    : join(distDir, withoutQuery);
  const resolved = resolve(localPath);
  if (!resolved.startsWith(resolve(distDir))) {
    throw new Error("WEB_BUNDLE_ASSET_OUTSIDE_DIST");
  }
  return resolved;
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

function listInitialAssetNames(assetDetails) {
  return assetDetails.map((asset) => asset.name).sort(compareStable);
}

function compareStable(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readText(path) {
  return readFileSync(path, "utf8");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = assertWebBundleBudget();
    console.log(formatBundleBudgetSummary(report));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
