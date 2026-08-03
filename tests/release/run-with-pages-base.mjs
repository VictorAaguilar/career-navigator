import { spawnSync } from "node:child_process";

export const PAGES_BASE_PATH = "/career-navigator/";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const shellCommand = process.env.ComSpec ?? "cmd.exe";
const [scriptName, separator, ...scriptArgs] = process.argv.slice(2);

if (scriptName === undefined || scriptName === "") {
  console.error("PAGES_BASE_SCRIPT_REQUIRED");
  process.exit(1);
}

const args = separator === "--"
  ? ["run", scriptName, "--", ...scriptArgs]
  : ["run", scriptName, ...(separator === undefined ? [] : [separator, ...scriptArgs])];

const env = {
  ...process.env,
  CAREER_NAVIGATOR_BASE_PATH: PAGES_BASE_PATH,
};

const result = spawnNpm(args, env);
if (result.error !== undefined) {
  console.error(result.error instanceof Error ? result.error.message : String(result.error));
  process.exit(1);
}
process.exit(result.status ?? 1);

function spawnNpm(args, env) {
  if (process.platform === "win32") {
    return spawnSync(shellCommand, ["/d", "/s", "/c", [npmCommand, ...args].join(" ")], {
      cwd: process.cwd(),
      stdio: "inherit",
      env,
      windowsHide: true,
    });
  }

  return spawnSync(npmCommand, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env,
    windowsHide: true,
  });
}
