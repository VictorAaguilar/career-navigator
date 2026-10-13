import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const shellCommand = process.env.ComSpec ?? "cmd.exe";
const repoRoot = resolve(process.cwd());
const distDir = resolve(repoRoot, "apps", "web", "dist");

const commands = Object.freeze([
  [npmCommand, ["test"]],
  [npmCommand, ["run", "typecheck"]],
  [npmCommand, ["run", "web:typecheck"]],
  [npmCommand, ["run", "web:build"]],
  [npmCommand, ["run", "web:bundle:check"]],
  [npmCommand, ["audit", "--omit=dev"]],
  [npmCommand, ["run", "web:e2e:rc"]],
  [npmCommand, ["run", "web:e2e:pages"]],
  [npmCommand, ["run", "web:pages:artifact-check"]],
]);

let exitCode = 0;

try {
  for (const [command, args] of commands) {
    console.log(`\n> ${[command, ...args].join(" ")}`);
    const result = spawnReleaseCommand(command, args);
    if (result.error !== undefined) {
      console.error(result.error instanceof Error ? result.error.message : String(result.error));
      exitCode = 1;
      break;
    }
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  cleanupDist();
}

process.exit(exitCode);

function spawnReleaseCommand(command, args) {
  if (process.platform === "win32") {
    return spawnSync(shellCommand, ["/d", "/s", "/c", [command, ...args].join(" ")], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
      windowsHide: true,
    });
  }

  return spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  });
}

function cleanupDist() {
  const normalizedRoot = repoRoot.endsWith(sep) ? repoRoot : `${repoRoot}${sep}`;
  if (!distDir.startsWith(normalizedRoot)) {
    throw new Error(`Refusing to clean path outside repository: ${distDir}`);
  }
  rmSync(distDir, { recursive: true, force: true });
}
