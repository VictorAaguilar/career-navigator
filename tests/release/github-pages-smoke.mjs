import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const GITHUB_PAGES_SMOKE_FAILED = "GITHUB_PAGES_SMOKE_FAILED";
export const EXPECTED_PAGES_ORIGIN = "https://victoraaguilar.github.io";
export const EXPECTED_PAGES_BASE_PATH = "/career-navigator/";

export function validateDeployedSiteUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PAGES_SMOKE_URL_INVALID");
  }
  if (url.protocol !== "https:") {
    throw new Error("PAGES_SMOKE_URL_NOT_HTTPS");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("PAGES_SMOKE_URL_CREDENTIALS");
  }
  if (url.search !== "") {
    throw new Error("PAGES_SMOKE_URL_QUERY");
  }
  if (url.hash !== "") {
    throw new Error("PAGES_SMOKE_URL_FRAGMENT");
  }
  if (url.origin !== EXPECTED_PAGES_ORIGIN) {
    throw new Error("PAGES_SMOKE_URL_ORIGIN");
  }
  if (url.pathname !== EXPECTED_PAGES_BASE_PATH) {
    throw new Error("PAGES_SMOKE_URL_PATH");
  }
  return url;
}

export async function runGithubPagesSmoke({
  deployedSiteUrl = process.env.DEPLOYED_SITE_URL,
  fetchFn = fetch,
  attempts = 8,
  retryDelayMs = 2_000,
  requestTimeoutMs = 8_000,
} = {}) {
  const siteUrl = validateDeployedSiteUrl(deployedSiteUrl ?? "");
  const index = await fetchWithRetries(siteUrl, {
    fetchFn,
    attempts,
    retryDelayMs,
    requestTimeoutMs,
    expectedContent: "Career Navigator",
  });
  const html = index.body;
  const scripts = extractAttributeValues(html, "script", "src");
  const styles = extractAttributeValues(html, "link", "href").filter((href) => href.endsWith(".css"));
  const findings = [];

  if (!/<title>Career Navigator<\/title>/iu.test(html)) {
    findings.push("PAGES_SMOKE_TITLE_MISSING");
  }
  if (!html.includes("root")) {
    findings.push("PAGES_SMOKE_ROOT_MISSING");
  }
  if (scripts.length === 0) {
    findings.push("PAGES_SMOKE_ENTRY_JS_MISSING");
  }
  if (styles.length === 0) {
    findings.push("PAGES_SMOKE_CSS_MISSING");
  }
  if (/\b(?:src|href)=["']\/assets\//iu.test(html)) {
    findings.push("PAGES_SMOKE_ROOT_ASSET_REFERENCE");
  }

  const assetUrls = [...scripts, ...styles].map((asset) => resolvePageAsset(siteUrl, asset));
  for (const assetUrl of assetUrls) {
    if (assetUrl.origin !== siteUrl.origin || !assetUrl.pathname.startsWith(EXPECTED_PAGES_BASE_PATH)) {
      findings.push(`PAGES_SMOKE_ASSET_OUTSIDE_ORIGIN: ${assetUrl.pathname}`);
    }
  }

  for (const assetUrl of assetUrls) {
    const response = await fetchOnce(assetUrl, { fetchFn, requestTimeoutMs });
    if (response.status !== 200) {
      findings.push(`PAGES_SMOKE_ASSET_STATUS_${response.status}: ${assetUrl.pathname}`);
      continue;
    }
    const contentType = response.contentType.toLowerCase();
    if (assetUrl.pathname.endsWith(".css") && !contentType.includes("text/css")) {
      findings.push(`PAGES_SMOKE_CSS_CONTENT_TYPE: ${contentType}`);
    }
    if (
      (assetUrl.pathname.endsWith(".js") || assetUrl.pathname.endsWith(".mjs")) &&
      !/javascript|ecmascript|text\/plain/iu.test(contentType)
    ) {
      findings.push(`PAGES_SMOKE_JS_CONTENT_TYPE: ${contentType}`);
    }
  }

  if (findings.length > 0) {
    throw new Error([GITHUB_PAGES_SMOKE_FAILED, ...findings].join("\n"));
  }

  return Object.freeze({
    siteUrl: siteUrl.href,
    attempts: index.attempts,
    assetCount: assetUrls.length,
  });
}

async function fetchWithRetries(url, options) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const response = await fetchOnce(url, options);
    lastStatus = response.status;
    if (response.status === 200 && response.body.includes(options.expectedContent)) {
      return Object.freeze({ ...response, attempts: attempt });
    }
    if (attempt < options.attempts) {
      await delay(options.retryDelayMs);
    }
  }
  throw new Error(`${GITHUB_PAGES_SMOKE_FAILED}\nPAGES_SMOKE_INDEX_UNAVAILABLE status=${lastStatus}`);
}

async function fetchOnce(url, { fetchFn, requestTimeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchFn(url.href, { signal: controller.signal });
    const body = await response.text();
    return Object.freeze({
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function resolvePageAsset(siteUrl, asset) {
  if (/^https?:\/\//iu.test(asset) || asset.startsWith("//")) {
    throw new Error(`${GITHUB_PAGES_SMOKE_FAILED}\nPAGES_SMOKE_EXTERNAL_ASSET: ${asset}`);
  }
  return new URL(asset, siteUrl);
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runGithubPagesSmoke();
    console.log(`GITHUB_PAGES_SMOKE_OK ${result.siteUrl} assets=${result.assetCount} attempts=${result.attempts}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
