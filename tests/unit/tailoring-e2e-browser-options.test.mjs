import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYWRIGHT_BROWSER_CHANNEL_ENV,
  PLAYWRIGHT_BROWSER_CHANNEL_INVALID,
  PLAYWRIGHT_BROWSER_NOT_AVAILABLE,
  buildBrowserLaunchOptions,
  launchBrowserWithFallback,
  resolveBrowserChannelCandidates,
} from "../e2e/tailoring-demo-browser-options.mjs";

describe("Tailoring E2E browser launch options", () => {
  it("uses chromium when the override selects chromium", () => {
    expect(resolveBrowserChannelCandidates({ env: { [PLAYWRIGHT_BROWSER_CHANNEL_ENV]: "chromium" } })).toEqual([
      "chromium",
    ]);
  });

  it("uses chrome when the override selects chrome", () => {
    expect(resolveBrowserChannelCandidates({ env: { [PLAYWRIGHT_BROWSER_CHANNEL_ENV]: "chrome" } })).toEqual([
      "chrome",
    ]);
  });

  it("uses msedge when the override selects msedge", () => {
    expect(resolveBrowserChannelCandidates({ env: { [PLAYWRIGHT_BROWSER_CHANNEL_ENV]: "msedge" } })).toEqual([
      "msedge",
    ]);
  });

  it("rejects invalid override values with a stable error", () => {
    expect(() =>
      resolveBrowserChannelCandidates({ env: { [PLAYWRIGHT_BROWSER_CHANNEL_ENV]: "firefox" } }),
    ).toThrow(PLAYWRIGHT_BROWSER_CHANNEL_INVALID);
  });

  it("tries chromium first when there is no override", () => {
    expect(resolveBrowserChannelCandidates({ env: {} })).toEqual(["chromium", "chrome", "msedge"]);
  });

  it("falls back from missing chromium to chrome", async () => {
    const attempts = [];
    const launcher = createLauncher({
      attempts,
      failures: {
        chromium: missingBrowserError("chromium"),
      },
    });

    const result = await launchBrowserWithFallback({ launcher, env: {}, logger: () => undefined });

    expect(attempts).toEqual([
      { channel: "chromium", headless: true },
      { channel: "chrome", headless: true },
    ]);
    expect(result.channel).toBe("chrome");
  });

  it("falls back from missing chrome to msedge", async () => {
    const attempts = [];
    const launcher = createLauncher({
      attempts,
      failures: {
        chromium: missingBrowserError("chromium"),
        chrome: missingBrowserError("chrome"),
      },
    });

    const result = await launchBrowserWithFallback({ launcher, env: {}, logger: () => undefined });

    expect(attempts.map((attempt) => attempt.channel)).toEqual(["chromium", "chrome", "msedge"]);
    expect(result.channel).toBe("msedge");
  });

  it("stops fallback for launch errors unrelated to browser installation", async () => {
    const attempts = [];
    const permissionError = new Error("browserType.launch: access denied by policy");
    const launcher = createLauncher({
      attempts,
      failures: {
        chromium: permissionError,
      },
    });

    await expect(launchBrowserWithFallback({ launcher, env: {}, logger: () => undefined })).rejects.toBe(
      permissionError,
    );
    expect(attempts).toEqual([{ channel: "chromium", headless: true }]);
  });

  it("reports a stable error when every channel is unavailable", async () => {
    const launcher = createLauncher({
      attempts: [],
      failures: {
        chromium: missingBrowserError("chromium"),
        chrome: missingBrowserError("chrome"),
        msedge: missingBrowserError("msedge"),
      },
    });

    await expect(launchBrowserWithFallback({ launcher, env: {}, logger: () => undefined })).rejects.toThrow(
      PLAYWRIGHT_BROWSER_NOT_AVAILABLE,
    );
  });

  it("keeps normal web:e2e headless", () => {
    expect(buildBrowserLaunchOptions({ channel: "chrome", headed: false })).toEqual({
      channel: "chrome",
      headless: true,
    });
  });

  it("uses visible browser mode for --headed", () => {
    expect(buildBrowserLaunchOptions({ channel: "chrome", headed: true })).toEqual({
      channel: "chrome",
      headless: false,
    });
  });

  it("returns and logs the browser channel that actually launched", async () => {
    const logs = [];
    const result = await launchBrowserWithFallback({
      launcher: createLauncher({ attempts: [], failures: {} }),
      env: { [PLAYWRIGHT_BROWSER_CHANNEL_ENV]: "chrome" },
      logger: (message) => logs.push(message),
    });

    expect(result.channel).toBe("chrome");
    expect(result.launchOptions).toEqual({ channel: "chrome", headless: true });
    expect(logs).toEqual(["E2E_BROWSER_CHANNEL=chrome"]);
  });

  it("does not inspect chromium.executablePath or require chromium_headless_shell", () => {
    const source = [
      "tests/e2e/tailoring-demo-flow.mjs",
      "tests/e2e/tailoring-demo-browser-options.mjs",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");

    expect(source).not.toContain("executablePath");
    expect(source).not.toContain("chromium_headless_shell");
    expect(source).toContain("launchBrowserWithFallback");
  });

  it("does not hardcode local machine browser paths", () => {
    const source = [
      "tests/e2e/tailoring-demo-flow.mjs",
      "tests/e2e/tailoring-demo-browser-options.mjs",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");

    expect(source).not.toMatch(/C:[\\/]/);
    expect(source).not.toContain("AppData");
    expect(source).not.toContain("chrome.exe");
  });
});

function createLauncher({ attempts, failures }) {
  return {
    async launch(options) {
      attempts.push({ channel: options.channel, headless: options.headless });
      const failure = failures[options.channel];
      if (failure) {
        throw failure;
      }
      return { close: async () => undefined };
    },
  };
}

function missingBrowserError(channel) {
  return new Error(
    [
      `browserType.launch: ${channel} executable doesn't exist`,
      `The ${channel} browser is not found.`,
      "Run Playwright install for the selected browser.",
    ].join("\n"),
  );
}
