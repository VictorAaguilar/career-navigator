import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const shellCommand = process.env.ComSpec ?? "cmd.exe";
const pagesEnv = {
  ...process.env,
  CAREER_NAVIGATOR_BASE_PATH: "/career-navigator/",
};

run(["run", "web:build"], pagesEnv);
run(["run", "web:e2e:rc", "--", "--base-path=/career-navigator/", "--port=4179", "--include-imports"], pagesEnv);

function run(args, env) {
  const result = spawnNpm(args, env);
  if (result.error !== undefined) {
    console.error(result.error instanceof Error ? result.error.message : String(result.error));
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

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
