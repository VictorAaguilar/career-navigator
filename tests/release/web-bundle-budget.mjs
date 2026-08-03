import { readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const basePathFromEnv = process.env.CAREER_NAVIGATOR_BASE_PATH ?? "/";

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
  basePath = basePathFromEnv,
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
  const basePathViolations = findBasePathViolations(initialAssets, basePath);
  const assetDetails = initialAssets
    .filter((asset) => !/^https?:\/\//iu.test(asset))
    .filter((asset) => !basePathViolations.some((violation) => violation.asset === asset))
    .map((asset) => assetDetail(distDir, asset, basePath));
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
      basePathViolations,
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
  basePathViolations,
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
  for (const violation of basePathViolations) {
    violations.push(`Asset inicial fuera del base path ${violation.basePath}: ${violation.asset}.`);
  }
  return violations;
}

function assetDetail(distDir, asset, basePath) {
  const assetPath = resolveAssetPath(distDir, asset, basePath);
  const normalizedAsset = normalize(asset);
  return Object.freeze({
    asset,
    path: assetPath,
    name: relative(distDir, assetPath).replace(/\\/gu, "/"),
    type: normalizedAsset.endsWith(".css") ? "css" : "js",
    bytes: statSync(assetPath).size,
  });
}

function resolveAssetPath(distDir, asset, basePath = "/") {
  if (/^https?:\/\//iu.test(asset)) {
    throw new Error(`WEB_BUNDLE_EXTERNAL_ASSET: ${asset}`);
  }
  const withoutQuery = stripBasePath(asset.split("?")[0], basePath);
  const localPath = withoutQuery.startsWith("/")
    ? join(distDir, withoutQuery.slice(1))
    : join(distDir, withoutQuery);
  const resolved = resolve(localPath);
  if (!resolved.startsWith(resolve(distDir))) {
    throw new Error("WEB_BUNDLE_ASSET_OUTSIDE_DIST");
  }
  return resolved;
}

function findBasePathViolations(assets, basePath) {
  if (basePath === "/" || basePath === "") {
    return [];
  }
  return assets
    .filter((asset) => asset.startsWith("/") && !asset.startsWith(basePath))
    .map((asset) => Object.freeze({ asset, basePath }));
}

function stripBasePath(asset, basePath) {
  if (basePath !== "/" && asset.startsWith(basePath)) {
    return `/${asset.slice(basePath.length)}`;
  }
  return asset;
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
