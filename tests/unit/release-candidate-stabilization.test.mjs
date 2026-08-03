import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WEB_BUNDLE_BUDGETS,
  analyzeWebBundle,
  assertWebBundleBudget,
} from "../release/web-bundle-budget.mjs";

function readRepoFile(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function withDistFixture(files, test) {
  const distDir = mkdtempSync(join(tmpdir(), "career-navigator-bundle-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const filePath = join(distDir, path);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
    }
    test(distDir);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
}

describe("Release Candidate stabilization", () => {
  it("keeps explicit web bundle budgets for initial HTML, JS and CSS", () => {
    expect(WEB_BUNDLE_BUDGETS).toEqual({
      initialHtmlBytes: 2_500,
      initialJsBytes: 466_000,
      initialCssBytes: 16_000,
    });
    expect(Object.isFrozen(WEB_BUNDLE_BUDGETS)).toBe(true);
  });

  it("accepts hashed production entry assets without depending on exact Vite filenames", () => {
    withDistFixture(
      {
        "index.html": [
          '<!doctype html><html><head>',
          '<script type="module" crossorigin src="/assets/index-AbC123.js"></script>',
          '<link rel="stylesheet" crossorigin href="/assets/index-AbC123.css">',
          "</head><body></body></html>",
        ].join(""),
        "assets/index-AbC123.js": "console.log('entry');",
        "assets/index-AbC123.css": "body{margin:0}",
      },
      (distDir) => {
        const report = assertWebBundleBudget(analyzeWebBundle({ distDir }));

        expect(report.assetNames).toEqual(["assets/index-AbC123.css", "assets/index-AbC123.js"]);
        expect(report.violations).toEqual([]);
      },
    );
  });

  it("rejects a production build without an initial JavaScript entry", () => {
    withDistFixture(
      {
        "index.html": '<!doctype html><html><head><link rel="stylesheet" href="/assets/index.css"></head></html>',
        "assets/index.css": "body{margin:0}",
      },
      (distDir) => {
        const report = analyzeWebBundle({ distDir });
        expect(report.violations).toContain("No se encontró entry JS inicial en index.html.");
      },
    );
  });

  it("rejects a production build without an initial stylesheet", () => {
    withDistFixture(
      {
        "index.html": '<!doctype html><html><head><script type="module" src="/assets/index.js"></script></head></html>',
        "assets/index.js": "console.log('entry');",
      },
      (distDir) => {
        const report = analyzeWebBundle({ distDir });
        expect(report.violations).toContain("No se encontró CSS inicial en index.html.");
      },
    );
  });

  it("rejects initial JS and CSS over the configured budget", () => {
    withDistFixture(
      {
        "index.html": [
          '<!doctype html><html><head>',
          '<script type="module" src="/assets/index.js"></script>',
          '<link rel="stylesheet" href="/assets/index.css">',
          "</head></html>",
        ].join(""),
        "assets/index.js": "x".repeat(WEB_BUNDLE_BUDGETS.initialJsBytes + 1),
        "assets/index.css": "y".repeat(WEB_BUNDLE_BUDGETS.initialCssBytes + 1),
      },
      (distDir) => {
        const message = () => assertWebBundleBudget(analyzeWebBundle({ distDir }));
        expect(message).toThrow("WEB_BUNDLE_BUDGET_FAILED");
        expect(message).toThrow("JS inicial");
        expect(message).toThrow("CSS inicial");
      },
    );
  });

  it("rejects heavy deferred libraries when they become initial assets", () => {
    withDistFixture(
      {
        "index.html": [
          '<!doctype html><html><head>',
          '<script type="module" src="/assets/pdf.worker-abc.mjs"></script>',
          '<script type="module" src="/assets/index.js"></script>',
          '<link rel="stylesheet" href="/assets/index.css">',
          "</head></html>",
        ].join(""),
        "assets/pdf.worker-abc.mjs": "console.log('worker');",
        "assets/index.js": "console.log('entry');",
        "assets/index.css": "body{margin:0}",
      },
      (distDir) => {
        const report = analyzeWebBundle({ distDir });
        expect(report.heavyInitialAssets).toEqual(["/assets/pdf.worker-abc.mjs"]);
        expect(report.violations.join("\n")).toContain("Chunks pesados cargados de inicio");
      },
    );
  });

  it("rejects external initial assets", () => {
    withDistFixture(
      {
        "index.html": [
          '<!doctype html><html><head>',
          '<script type="module" src="https://cdn.example.test/index.js"></script>',
          '<link rel="stylesheet" href="/assets/index.css">',
          "</head></html>",
        ].join(""),
        "assets/index.css": "body{margin:0}",
      },
      (distDir) => {
        const report = analyzeWebBundle({ distDir });
        expect(report.externalUrls).toEqual(["https://cdn.example.test/index.js"]);
        expect(report.violations.join("\n")).toContain("Assets iniciales con URL externa");
      },
    );
  });

  it("keeps release scripts explicit and free from dependency installation", () => {
    const packageJson = JSON.parse(readRepoFile("package.json"));

    expect(packageJson.scripts["web:e2e:rc"]).toBe("node tests/e2e/release-candidate-flow.mjs");
    expect(packageJson.scripts["web:e2e:rc:headed"]).toBe("node tests/e2e/release-candidate-flow.mjs --headed");
    expect(packageJson.scripts["web:bundle:check"]).toBe("node tests/release/web-bundle-budget.mjs");
    expect(packageJson.scripts["release:check"]).toBe("node tests/release/release-check.mjs");
    expect(packageJson.scripts["release:check"]).not.toMatch(/ci|install|audit fix/i);
  });

  it("runs Release Candidate commands in the documented validation order", () => {
    const source = readRepoFile("tests/release/release-check.mjs");
    const commandLines = Array.from(source.matchAll(/\[npmCommand, \[([^\]]+)\]\]/g)).map((match) => match[1]);

    expect(commandLines).toEqual([
      '"test"',
      '"run", "typecheck"',
      '"run", "web:typecheck"',
      '"run", "web:build"',
      '"run", "web:bundle:check"',
      '"audit", "--omit=dev"',
      '"run", "web:e2e:rc"',
    ]);
  });

  it("runs RC E2E against production preview instead of the development server", () => {
    const source = readRepoFile("tests/e2e/release-candidate-flow.mjs");

    expect(source).toContain("npm.cmd run preview --workspace @career-navigator/web");
    expect(source).toContain("port: 4178");
    expect(source).not.toContain("npm.cmd run dev");
  });

  it("uses channel-based Playwright launch fallback without custom executable paths", () => {
    const source = readRepoFile("tests/e2e/release-candidate-flow.mjs");
    const browserOptions = readRepoFile("tests/e2e/tailoring-demo-browser-options.mjs");

    expect(source).toContain("launchBrowserWithFallback");
    expect(browserOptions).toContain("channel");
    expect(browserOptions).toContain("headless: !headed");
    expect(source + browserOptions).not.toContain("executablePath");
    expect(source + browserOptions).not.toContain("chromium_headless_shell");
  });

  it("covers Chrome channel selection in local validation documentation", () => {
    const doc = readRepoFile("docs/redesign/LOCAL_INSTALLATION_AND_VALIDATION.md");

    expect(doc).toContain('PLAYWRIGHT_BROWSER_CHANNEL="chrome"');
    expect(doc).toContain("npm.cmd run web:e2e:rc");
    expect(doc).toContain("npm.cmd run release:check");
  });

  it("documents browser support honestly for the release candidate", () => {
    const readiness = readRepoFile("docs/redesign/RELEASE_CANDIDATE_READINESS.md");

    expect(readiness).toContain("Chrome");
    expect(readiness).toContain("Aprobado");
    expect(readiness).toContain("Firefox");
    expect(readiness).toContain("No aprobado");
    expect(readiness).toContain("Safari");
    expect(readiness).toContain("No probado");
  });

  it("documents privacy guarantees and limitations for RC1", () => {
    const releaseNotes = readRepoFile("docs/redesign/RELEASE_NOTES_RC1.md");

    expect(releaseNotes.toLowerCase()).toContain("sin backend");
    expect(releaseNotes.toLowerCase()).toContain("sin almacenamiento");
    expect(releaseNotes.toLowerCase()).toContain("sin llamadas llm");
    expect(releaseNotes).toContain("Limitaciones");
  });

  it("exposes the release validation path from the README", () => {
    const readme = readRepoFile("README.md");

    expect(readme).toContain("Release Candidate");
    expect(readme).toContain("npm.cmd run release:check");
    expect(readme).toContain("docs/redesign/LOCAL_INSTALLATION_AND_VALIDATION.md");
  });

  it("keeps release validation scripts out of domain scoring and matching modules", () => {
    const source = readRepoFile("tests/release/release-check.mjs")
      + readRepoFile("tests/e2e/release-candidate-flow.mjs")
      + readRepoFile("tests/release/web-bundle-budget.mjs");

    expect(source).not.toContain("src/core/scoring");
    expect(source).not.toContain("src/core/matching");
    expect(source).not.toContain("src/core/tailoring/rewrite");
  });

  it("keeps the visible download CTA aligned across UI and E2E coverage", () => {
    const ui = readRepoFile("apps/web/src/components/stages/DownloadStage.tsx");
    const e2e = [
      "tests/e2e/tailoring-demo-flow.mjs",
      "tests/e2e/resume-file-import-flow.mjs",
      "tests/e2e/structured-resume-flow.mjs",
      "tests/e2e/structured-targeting-flow.mjs",
      "tests/e2e/release-candidate-flow.mjs",
    ].map(readRepoFile).join("\n");

    expect(ui).toContain("Descargar currículum adaptado");
    expect(e2e).toContain("Descargar currículum adaptado");
    expect(e2e).not.toContain("Descargar DOCX");
  });

  it("marks DOCX generation failures as alerts without changing the download state contract", () => {
    const ui = readRepoFile("apps/web/src/components/stages/DownloadStage.tsx");

    expect(ui).toContain('role="alert"');
    expect(ui).toContain('state.docx.status === "failed"');
    expect(ui).toContain('state.docx.status === "generating"');
  });
});
