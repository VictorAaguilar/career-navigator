import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAREER_NAVIGATOR_BASE_PATH_INVALID,
  resolveCareerNavigatorBasePath,
} from "../../apps/web/vite-base-path.ts";
import { analyzeWebBundle, assertWebBundleBudget } from "../release/web-bundle-budget.mjs";
import { assertPagesArtifact, inspectPagesArtifact } from "../release/pages-artifact-check.mjs";
import {
  EXPECTED_PAGES_BASE_PATH,
  EXPECTED_PAGES_ORIGIN,
  GITHUB_PAGES_SMOKE_FAILED,
  runGithubPagesSmoke,
  validateDeployedSiteUrl,
} from "../release/github-pages-smoke.mjs";

const workflowPath = ".github/workflows/deploy-pages.yml";
const pagesBase = "/career-navigator/";

function readRepoFile(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function withDistFixture(files, test) {
  const distDir = mkdtempSync(join(tmpdir(), "career-navigator-pages-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const filePath = join(distDir, path);
      mkdirSync(dirname(filePath), { recursive: true });
      if (content === "SYMLINK") {
        const target = join(distDir, "assets", "target.js");
        writeFileSync(target, "console.log('target');");
        symlinkSync(target, filePath);
      } else {
        writeFileSync(filePath, content);
      }
    }
    test(distDir);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
}

function validDistFiles(overrides = {}) {
  return {
    "index.html": [
      "<!doctype html><html><head>",
      `<script type="module" src="${pagesBase}assets/index-abc.js"></script>`,
      `<link rel="stylesheet" href="${pagesBase}assets/index-abc.css">`,
      "</head><body><div id=\"root\"></div></body></html>",
    ].join(""),
    "assets/index-abc.js": "console.log('entry');",
    "assets/index-abc.css": "body{margin:0}",
    ...overrides,
  };
}

function createMockFetch(responses) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const queued = responses[url] ?? responses[String(new URL(url).pathname)];
    const response = Array.isArray(queued) ? queued.shift() : queued;
    if (response === undefined) {
      return mockResponse(404, "text/plain", "missing");
    }
    return response;
  };
  fetchFn.calls = calls;
  return fetchFn;
}

function mockResponse(status, contentType, body) {
  return {
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      },
    },
    async text() {
      return body;
    },
  };
}

function smokeResponses(htmlOverride) {
  const html = htmlOverride ?? [
    "<!doctype html><html><head><title>Career Navigator</title>",
    '<script type="module" src="/career-navigator/assets/index.js"></script>',
    '<link rel="stylesheet" href="/career-navigator/assets/index.css">',
    '</head><body><div id="root">Career Navigator</div></body></html>',
  ].join("");
  return {
    [`${EXPECTED_PAGES_ORIGIN}${EXPECTED_PAGES_BASE_PATH}`]: mockResponse(200, "text/html", html),
    [`${EXPECTED_PAGES_ORIGIN}/career-navigator/assets/index.js`]: mockResponse(
      200,
      "text/javascript",
      "console.log('ok');",
    ),
    [`${EXPECTED_PAGES_ORIGIN}/career-navigator/assets/index.css`]: mockResponse(200, "text/css", "body{}"),
  };
}

describe("GitHub Pages deployment configuration", () => {
  it("uses local base / by default", () => {
    expect(resolveCareerNavigatorBasePath(undefined)).toBe("/");
  });

  it("uses the Pages base path when provided", () => {
    expect(resolveCareerNavigatorBasePath("/career-navigator/")).toBe("/career-navigator/");
  });

  it("normalizes a missing trailing slash", () => {
    expect(resolveCareerNavigatorBasePath("/career-navigator")).toBe("/career-navigator/");
  });

  it("keeps a leading slash requirement", () => {
    expect(() => resolveCareerNavigatorBasePath("career-navigator/")).toThrow(CAREER_NAVIGATOR_BASE_PATH_INVALID);
  });

  it("treats an empty value as local base", () => {
    expect(resolveCareerNavigatorBasePath("")).toBe("/");
  });

  it("rejects absolute URLs", () => {
    expect(() => resolveCareerNavigatorBasePath("https://example.test/career-navigator/")).toThrow(
      CAREER_NAVIGATOR_BASE_PATH_INVALID,
    );
  });

  it("rejects protocol-relative URLs", () => {
    expect(() => resolveCareerNavigatorBasePath("//example.test/career-navigator/")).toThrow(
      CAREER_NAVIGATOR_BASE_PATH_INVALID,
    );
  });

  it("rejects traversal", () => {
    expect(() => resolveCareerNavigatorBasePath("/career-navigator/../")).toThrow(
      CAREER_NAVIGATOR_BASE_PATH_INVALID,
    );
  });

  it("rejects query strings", () => {
    expect(() => resolveCareerNavigatorBasePath("/career-navigator/?x=1")).toThrow(
      CAREER_NAVIGATOR_BASE_PATH_INVALID,
    );
  });

  it("rejects fragments", () => {
    expect(() => resolveCareerNavigatorBasePath("/career-navigator/#app")).toThrow(
      CAREER_NAVIGATOR_BASE_PATH_INVALID,
    );
  });

  it("rejects backslashes", () => {
    expect(() => resolveCareerNavigatorBasePath("/career-navigator\\")).toThrow(CAREER_NAVIGATOR_BASE_PATH_INVALID);
  });

  it("is deterministic", () => {
    expect(resolveCareerNavigatorBasePath("/career-navigator")).toBe(resolveCareerNavigatorBasePath("/career-navigator"));
  });

  it("does not mutate environment input objects", () => {
    const env = Object.freeze({ CAREER_NAVIGATOR_BASE_PATH: "/career-navigator/" });
    expect(resolveCareerNavigatorBasePath(env.CAREER_NAVIGATOR_BASE_PATH)).toBe("/career-navigator/");
    expect(env).toEqual({ CAREER_NAVIGATOR_BASE_PATH: "/career-navigator/" });
  });

  it("keeps the PDF worker resolved from import.meta.url", () => {
    expect(readRepoFile("apps/web/src/app/resume-file-import.ts")).toContain(
      'new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url)',
    );
  });

  it("keeps resume import as a dynamic import", () => {
    expect(readRepoFile("apps/web/src/app/use-tailoring-demo-controller.ts")).toContain(
      'await import("./resume-file-import")',
    );
  });

  it("keeps DOCX rendering as a dynamic import", () => {
    expect(readRepoFile("apps/web/src/app/use-tailoring-demo-controller.ts")).toContain(
      'await import("./tailoring-demo-docx")',
    );
  });

  it("keeps DOCX download as a local Blob object URL", () => {
    const source = readRepoFile("apps/web/src/app/use-tailoring-demo-controller.ts");
    expect(source).toContain("URL.createObjectURL");
    expect(source).toContain("URL.revokeObjectURL");
    expect(source).not.toContain("fetch(");
  });
});

describe("GitHub Pages deployment workflow", () => {
  const workflow = readRepoFile(workflowPath);

  it("creates the workflow file", () => {
    expect(workflow).toContain("Deploy Career Navigator RC to GitHub Pages");
  });

  it("validates pull requests to universal-redesign", () => {
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches: [universal-redesign]");
  });

  it("deploys on push to universal-redesign only", () => {
    expect(workflow).toContain("push:");
    expect(workflow).not.toContain("branches: [main]");
  });

  it("supports manual workflow dispatch", () => {
    expect(workflow).toContain("workflow_dispatch:");
  });

  it("restricts manual deployment to universal-redesign", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/universal-redesign'");
    expect(workflow).toContain("GITHUB_PAGES_DEPLOY_SKIPPED");
  });

  it("does not deploy feature branches", () => {
    expect(workflow).not.toContain("feature/");
    expect(workflow).toContain("IS_DEPLOYABLE_REF");
  });

  it("uses minimal global permissions", () => {
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/u);
  });

  it("does not grant pages write globally", () => {
    expect(workflow.split("jobs:")[0]).not.toContain("pages: write");
  });

  it("grants pages write only in deploy job", () => {
    expect(workflow).toMatch(/deploy:[\s\S]*pages: write/u);
  });

  it("grants id-token write only in deploy job", () => {
    expect(workflow).toMatch(/deploy:[\s\S]*id-token: write/u);
    expect(workflow.split("deploy:")[0]).not.toContain("id-token: write");
  });

  it("uses the github-pages environment", () => {
    expect(workflow).toContain("name: github-pages");
  });

  it("uses stable Pages concurrency", () => {
    expect(workflow).toContain("group: pages");
    expect(workflow).toContain("cancel-in-progress: true");
  });

  it("makes deploy depend on validate-and-build", () => {
    expect(workflow).toMatch(/deploy:[\s\S]*needs: validate-and-build/u);
  });

  it("makes public smoke depend on deploy", () => {
    expect(workflow).toMatch(/public-smoke:[\s\S]*needs: deploy/u);
  });

  it("uploads only apps/web/dist", () => {
    expect(workflow).toContain("path: apps/web/dist");
  });

  it("does not upload node_modules", () => {
    expect(workflow).not.toContain("path: node_modules");
  });

  it("does not use secrets or PATs", () => {
    expect(workflow).not.toMatch(/secrets\.|\bPAT\b|SSH/u);
  });

  it("does not use pull_request_target", () => {
    expect(workflow).not.toContain("pull_request_target");
  });

  it("does not pipe curl to shell", () => {
    expect(workflow).not.toMatch(/curl[\s\S]*\|[\s\S]*(?:sh|bash)/u);
  });

  it("uses only allowed official actions", () => {
    const actions = Array.from(workflow.matchAll(/uses:\s*([^@\s]+)@/gu), (match) => match[1]);
    expect(new Set(actions)).toEqual(
      new Set([
        "actions/checkout",
        "actions/setup-node",
        "actions/configure-pages",
        "actions/upload-pages-artifact",
        "actions/deploy-pages",
      ]),
    );
  });

  it("pins all actions by 40 character SHAs", () => {
    const shas = Array.from(workflow.matchAll(/uses:\s*[^@\s]+@([a-f0-9]{40})/giu), (match) => match[1]);
    expect(shas.length).toBe(7);
    expect(shas.every((sha) => /^[a-f0-9]{40}$/u.test(sha))).toBe(true);
  });

  it("checks out without persistent credentials", () => {
    expect(workflow).toContain("persist-credentials: false");
  });

  it("uses Node 24 explicitly", () => {
    expect(workflow).toContain('node-version: "24"');
    expect(workflow).not.toContain("node-version: latest");
    expect(workflow).not.toContain("lts/*");
  });

  it("uses npm cache", () => {
    expect(workflow).toContain("cache: npm");
  });

  it("sets the Pages base path for workflow builds", () => {
    expect(workflow).toContain("CAREER_NAVIGATOR_BASE_PATH: /career-navigator/");
  });

  it("does not install browsers in CI", () => {
    expect(workflow).not.toContain("playwright install");
    expect(workflow).toContain("google-chrome --version");
  });

  it("runs the Pages E2E before upload", () => {
    expect(workflow.indexOf("npm run web:e2e:pages")).toBeLessThan(workflow.indexOf("Upload Pages artifact"));
  });
});

describe("GitHub Pages build and artifact checks", () => {
  it("accepts Pages base assets", () => {
    withDistFixture(validDistFiles(), (distDir) => {
      expect(assertWebBundleBudget(analyzeWebBundle({ distDir, basePath: pagesBase })).violations).toEqual([]);
    });
  });

  it("rejects root /assets references for Pages", () => {
    withDistFixture(
      validDistFiles({
        "index.html": '<script type="module" src="/assets/index-abc.js"></script><link rel="stylesheet" href="/assets/index-abc.css">',
      }),
      (distDir) => {
        expect(analyzeWebBundle({ distDir, basePath: pagesBase }).violations.join("\n")).toContain(
          "Asset inicial fuera del base path",
        );
      },
    );
  });

  it("maps Pages entry JS to a local file", () => {
    withDistFixture(validDistFiles(), (distDir) => {
      expect(analyzeWebBundle({ distDir, basePath: pagesBase }).assetNames).toContain("assets/index-abc.js");
    });
  });

  it("maps Pages CSS to a local file", () => {
    withDistFixture(validDistFiles(), (distDir) => {
      expect(analyzeWebBundle({ distDir, basePath: pagesBase }).assetNames).toContain("assets/index-abc.css");
    });
  });

  it("keeps PDF.js deferred", () => {
    withDistFixture(validDistFiles({ "assets/pdf-DEMO.js": "console.log('pdf');" }), (distDir) => {
      expect(analyzeWebBundle({ distDir, basePath: pagesBase }).assetNames).not.toContain("assets/pdf-DEMO.js");
    });
  });

  it("keeps the PDF worker deferred", () => {
    withDistFixture(validDistFiles({ "assets/pdf.worker-DEMO.mjs": "console.log('worker');" }), (distDir) => {
      expect(analyzeWebBundle({ distDir, basePath: pagesBase }).assetNames).not.toContain(
        "assets/pdf.worker-DEMO.mjs",
      );
    });
  });

  it("keeps JSZip deferred", () => {
    withDistFixture(validDistFiles({ "assets/jszip.min-DEMO.js": "console.log('zip');" }), (distDir) => {
      expect(analyzeWebBundle({ distDir, basePath: pagesBase }).assetNames).not.toContain(
        "assets/jszip.min-DEMO.js",
      );
    });
  });

  it("keeps DOCX deferred", () => {
    withDistFixture(validDistFiles({ "assets/tailoring-demo-docx-DEMO.js": "console.log('docx');" }), (distDir) => {
      expect(analyzeWebBundle({ distDir, basePath: pagesBase }).assetNames).not.toContain(
        "assets/tailoring-demo-docx-DEMO.js",
      );
    });
  });

  it("fails when a heavy chunk becomes initial", () => {
    withDistFixture(
      validDistFiles({
        "index.html": [
          `<script type="module" src="${pagesBase}assets/index-abc.js"></script>`,
          `<script type="module" src="${pagesBase}assets/jszip.min-DEMO.js"></script>`,
          `<link rel="stylesheet" href="${pagesBase}assets/index-abc.css">`,
        ].join(""),
        "assets/jszip.min-DEMO.js": "console.log('zip');",
      }),
      (distDir) => {
        expect(analyzeWebBundle({ distDir, basePath: pagesBase }).violations.join("\n")).toContain(
          "Chunks pesados cargados de inicio",
        );
      },
    );
  });

  it("fails on external bundle assets", () => {
    withDistFixture(
      validDistFiles({
        "index.html": `<script type="module" src="https://cdn.example.test/index.js"></script><link rel="stylesheet" href="${pagesBase}assets/index-abc.css">`,
      }),
      (distDir) => {
        expect(analyzeWebBundle({ distDir, basePath: pagesBase }).violations.join("\n")).toContain(
          "Assets iniciales con URL externa",
        );
      },
    );
  });

  it("fails when an asset is absent", () => {
    withDistFixture({ "index.html": `<script type="module" src="${pagesBase}assets/missing.js"></script>` }, (distDir) => {
      expect(() => analyzeWebBundle({ distDir, basePath: pagesBase })).toThrow();
    });
  });

  it("accepts a valid Pages artifact", () => {
    withDistFixture(validDistFiles(), (distDir) => {
      expect(assertPagesArtifact(inspectPagesArtifact({ distDir })).files).toContain("index.html");
    });
  });

  it("rejects an artifact without index", () => {
    withDistFixture({ "assets/index.js": "console.log('x')" }, (distDir) => {
      expect(inspectPagesArtifact({ distDir }).findings).toContain("PAGES_ARTIFACT_INDEX_MISSING");
    });
  });

  it("rejects symlinks", () => {
    withDistFixture(validDistFiles({ "assets/link.js": "SYMLINK" }), (distDir) => {
      expect(inspectPagesArtifact({ distDir }).findings.join("\n")).toContain("PAGES_ARTIFACT_SYMLINK");
    });
  });

  it("rejects personal files", () => {
    withDistFixture(validDistFiles({ "resume.txt": "personal" }), (distDir) => {
      expect(inspectPagesArtifact({ distDir }).findings.join("\n")).toContain("PAGES_ARTIFACT_FORBIDDEN_FILE");
    });
  });

  it("rejects .env files", () => {
    withDistFixture(validDistFiles({ ".env": "SECRET=1" }), (distDir) => {
      expect(inspectPagesArtifact({ distDir }).findings.join("\n")).toContain("PAGES_ARTIFACT_FORBIDDEN_FILE");
    });
  });

  it("rejects DOCX files", () => {
    withDistFixture(validDistFiles({ "download.docx": "docx" }), (distDir) => {
      expect(inspectPagesArtifact({ distDir }).findings.join("\n")).toContain("PAGES_ARTIFACT_FORBIDDEN_FILE");
    });
  });

  it("rejects PDF files", () => {
    withDistFixture(validDistFiles({ "upload.pdf": "pdf" }), (distDir) => {
      expect(inspectPagesArtifact({ distDir }).findings.join("\n")).toContain("PAGES_ARTIFACT_FORBIDDEN_FILE");
    });
  });

  it("rejects test-results files", () => {
    withDistFixture(validDistFiles({ "test-results/output.txt": "test" }), (distDir) => {
      expect(inspectPagesArtifact({ distDir }).findings.join("\n")).toContain("PAGES_ARTIFACT_FORBIDDEN_FILE");
    });
  });

  it("rejects sensitive absolute paths", () => {
    withDistFixture(validDistFiles({ "assets/index-abc.js": "const p='C:\\\\CODEX\\\\career-navigator';" }), (distDir) => {
      expect(inspectPagesArtifact({ distDir }).findings.join("\n")).toContain("PAGES_ARTIFACT_ABSOLUTE_PATH");
    });
  });

  it("returns artifact files deterministically", () => {
    withDistFixture(validDistFiles({ "assets/z.js": "", "assets/a.js": "" }), (distDir) => {
      const files = inspectPagesArtifact({ distDir }).files;
      expect(files).toEqual([...files].sort());
    });
  });
});

describe("GitHub Pages public smoke", () => {
  it("accepts the expected public URL", () => {
    expect(validateDeployedSiteUrl("https://victoraaguilar.github.io/career-navigator/").href).toBe(
      "https://victoraaguilar.github.io/career-navigator/",
    );
  });

  it("rejects HTTP", () => {
    expect(() => validateDeployedSiteUrl("http://victoraaguilar.github.io/career-navigator/")).toThrow(
      "PAGES_SMOKE_URL_NOT_HTTPS",
    );
  });

  it("rejects credentials", () => {
    expect(() => validateDeployedSiteUrl("https://u:p@victoraaguilar.github.io/career-navigator/")).toThrow(
      "PAGES_SMOKE_URL_CREDENTIALS",
    );
  });

  it("rejects query strings", () => {
    expect(() => validateDeployedSiteUrl("https://victoraaguilar.github.io/career-navigator/?x=1")).toThrow(
      "PAGES_SMOKE_URL_QUERY",
    );
  });

  it("rejects fragments", () => {
    expect(() => validateDeployedSiteUrl("https://victoraaguilar.github.io/career-navigator/#app")).toThrow(
      "PAGES_SMOKE_URL_FRAGMENT",
    );
  });

  it("rejects an incorrect pathname", () => {
    expect(() => validateDeployedSiteUrl("https://victoraaguilar.github.io/")).toThrow("PAGES_SMOKE_URL_PATH");
  });

  it("fetches HTML, JS and CSS successfully", async () => {
    const result = await runGithubPagesSmoke({
      deployedSiteUrl: "https://victoraaguilar.github.io/career-navigator/",
      fetchFn: createMockFetch(smokeResponses()),
      retryDelayMs: 0,
    });
    expect(result.assetCount).toBe(2);
  });

  it("fails on final 404 HTML", async () => {
    await expect(
      runGithubPagesSmoke({
        deployedSiteUrl: "https://victoraaguilar.github.io/career-navigator/",
        fetchFn: createMockFetch({
          [`${EXPECTED_PAGES_ORIGIN}${EXPECTED_PAGES_BASE_PATH}`]: mockResponse(404, "text/html", "missing"),
        }),
        attempts: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("PAGES_SMOKE_INDEX_UNAVAILABLE");
  });

  it("checks entry JS status", async () => {
    const responses = smokeResponses();
    responses[`${EXPECTED_PAGES_ORIGIN}/career-navigator/assets/index.js`] = mockResponse(404, "text/plain", "");
    await expect(
      runGithubPagesSmoke({
        deployedSiteUrl: "https://victoraaguilar.github.io/career-navigator/",
        fetchFn: createMockFetch(responses),
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("PAGES_SMOKE_ASSET_STATUS_404");
  });

  it("checks CSS status", async () => {
    const responses = smokeResponses();
    responses[`${EXPECTED_PAGES_ORIGIN}/career-navigator/assets/index.css`] = mockResponse(404, "text/plain", "");
    await expect(
      runGithubPagesSmoke({
        deployedSiteUrl: "https://victoraaguilar.github.io/career-navigator/",
        fetchFn: createMockFetch(responses),
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("PAGES_SMOKE_ASSET_STATUS_404");
  });

  it("rejects external assets", async () => {
    await expect(
      runGithubPagesSmoke({
        deployedSiteUrl: "https://victoraaguilar.github.io/career-navigator/",
        fetchFn: createMockFetch(
          smokeResponses('<title>Career Navigator</title><script src="https://cdn.example.test/app.js"></script>'),
        ),
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("PAGES_SMOKE_EXTERNAL_ASSET");
  });

  it("rejects root asset references", async () => {
    await expect(
      runGithubPagesSmoke({
        deployedSiteUrl: "https://victoraaguilar.github.io/career-navigator/",
        fetchFn: createMockFetch(
          smokeResponses(
            '<title>Career Navigator</title><div id="root">Career Navigator</div><script src="/assets/index.js"></script><link rel="stylesheet" href="/assets/index.css">',
          ),
        ),
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("PAGES_SMOKE_ROOT_ASSET_REFERENCE");
  });

  it("uses limited retries for deployment propagation", async () => {
    const responses = smokeResponses();
    responses[`${EXPECTED_PAGES_ORIGIN}${EXPECTED_PAGES_BASE_PATH}`] = [
      mockResponse(404, "text/html", "missing"),
      mockResponse(200, "text/html", '<title>Career Navigator</title><script src="/career-navigator/assets/index.js"></script><link rel="stylesheet" href="/career-navigator/assets/index.css"><div id="root">Career Navigator</div>'),
    ];
    const fetchFn = createMockFetch(responses);
    const result = await runGithubPagesSmoke({
      deployedSiteUrl: "https://victoraaguilar.github.io/career-navigator/",
      fetchFn,
      retryDelayMs: 0,
    });
    expect(result.attempts).toBe(2);
  });

  it("has a fixed timeout setting", async () => {
    const fetchFn = createMockFetch(smokeResponses());
    await runGithubPagesSmoke({
      deployedSiteUrl: "https://victoraaguilar.github.io/career-navigator/",
      fetchFn,
      requestTimeoutMs: 100,
      retryDelayMs: 0,
    });
    expect(fetchFn.calls.length).toBe(3);
  });

  it("uses stable safe errors", async () => {
    await expect(
      runGithubPagesSmoke({
        deployedSiteUrl: "https://victoraaguilar.github.io/career-navigator/",
        fetchFn: createMockFetch({
          [`${EXPECTED_PAGES_ORIGIN}${EXPECTED_PAGES_BASE_PATH}`]: mockResponse(
            200,
            "text/html",
            "<html>SECRET HTML SHOULD NOT BE PRINTED</html>",
          ),
        }),
        attempts: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(GITHUB_PAGES_SMOKE_FAILED);
  });
});

describe("GitHub Pages deployment regressions", () => {
  it("keeps TailoringSession intact", () => {
    expect(readRepoFile("apps/web/src/app/tailoring-session.ts")).toContain("tailoring_session_v1");
  });

  it("does not touch matching", () => {
    expect(readRepoFile("src/core/matching/matcher.ts")).toContain("evaluateJobRequirements");
  });

  it("does not touch scoring", () => {
    expect(readRepoFile("src/core/scoring/scoring.ts")).toContain("scoreTraceabilityResult");
  });

  it("keeps proposal generation intact", () => {
    expect(readRepoFile("src/core/tailoring/rewrite-proposals.ts")).toContain("buildRewriteProposals");
  });

  it("keeps DOCX renderer intact", () => {
    expect(readRepoFile("src/core/tailoring/docx-renderer.ts")).toContain("renderResumeExportModelToDocx");
  });

  it("does not add storage", () => {
    const source = readRepoFile("apps/web/src/App.tsx") + readRepoFile(workflowPath);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/u);
  });

  it("does not add analytics", () => {
    expect(readRepoFile(workflowPath) + readRepoFile("apps/web/src/App.tsx")).not.toMatch(/analytics|gtag|telemetry/u);
  });

  it("does not add backend calls", () => {
    expect(readRepoFile("apps/web/src/app/use-tailoring-demo-controller.ts")).not.toContain("fetch(");
  });

  it("does not add LLM calls", () => {
    expect(readRepoFile("apps/web/src/App.tsx") + readRepoFile(workflowPath)).not.toMatch(/OpenAI|Anthropic|Gemini/u);
  });

  it("does not add OCR", () => {
    expect(readRepoFile("docs/redesign/RELEASE_NOTES_RC1.md")).toContain("No hay OCR");
  });

  it("shows a public RC warning without claiming legal compliance", () => {
    const source = readRepoFile("apps/web/src/components/stages/StartStage.tsx");
    expect(source).toContain("Versión candidata pública de prueba");
    expect(source).toContain("datos ficticios");
    expect(source).not.toMatch(/certificad|cumplimiento|privacidad absoluta/iu);
  });

  it("does not add deployment dependencies", () => {
    const packageJson = JSON.parse(readRepoFile("package.json"));
    expect(JSON.stringify(packageJson.dependencies)).not.toMatch(/gh-pages|netlify|vercel/u);
    expect(JSON.stringify(packageJson.devDependencies)).not.toMatch(/gh-pages|netlify|vercel/u);
  });

  it("keeps package-lock free from deployment tools", () => {
    expect(readRepoFile("package-lock.json")).not.toMatch(/gh-pages|netlify|vercel/u);
  });
});
