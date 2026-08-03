import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const shellCommand = process.env.ComSpec ?? "cmd.exe";

const commands = Object.freeze([
  [npmCommand, ["test"]],
  [npmCommand, ["run", "typecheck"]],
  [npmCommand, ["run", "web:typecheck"]],
  [npmCommand, ["run", "web:build"]],
  [npmCommand, ["run", "web:bundle:check"]],
  [npmCommand, ["audit", "--omit=dev"]],
  [npmCommand, ["run", "web:e2e:rc"]],
]);

for (const [command, args] of commands) {
  console.log(`\n> ${[command, ...args].join(" ")}`);
  const result = spawnReleaseCommand(command, args);
  if (result.error !== undefined) {
    console.error(result.error instanceof Error ? result.error.message : String(result.error));
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

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
