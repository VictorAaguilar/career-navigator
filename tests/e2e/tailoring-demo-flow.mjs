import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import JSZip from "jszip";
import {
  launchBrowserWithFallback,
} from "./tailoring-demo-browser-options.mjs";

const headed = process.argv.includes("--headed");
const port = 5174;
const baseUrl = `http://127.0.0.1:${port}/`;
const cvText = [
  "Desarrollador de software",
  "Experiencia",
  "- Desarrollo de aplicaciones web con TypeScript y React.",
  "- Creación de pruebas automatizadas con Vitest.",
  "- Trabajo con Git y revisión de código.",
  "- Documentación técnica de funcionalidades.",
].join("\n");
const offerText = [
  "Buscamos desarrollador frontend con experiencia en:",
  "- TypeScript",
  "- React",
  "- Pruebas automatizadas",
  "- Git",
  "- Docker",
].join("\n");

const serverCommand = process.platform === "win32" ? "cmd.exe" : "npm";
const serverArgs = process.platform === "win32" ? [
  "/d",
  "/s",
  "/c",
  `npm.cmd run dev --workspace @career-navigator/web -- --host 127.0.0.1 --port ${port}`,
] : [
  "run",
  "dev",
  "--workspace",
  "@career-navigator/web",
  "--",
  "--host",
  "127.0.0.1",
  "--port",
  String(port),
];
const server = spawn(serverCommand, serverArgs, {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`E2E_SERVER_NOT_READY\n${serverOutput}`);
}

async function run() {
  const downloadDir = await mkdtemp(join(tmpdir(), "career-navigator-e2e-"));
  let browser;

  try {
    ({ browser } = await launchBrowserWithFallback({
      launcher: chromium,
      headed,
      env: process.env,
      logger: console.log,
    }));

    const page = await browser.newPage({ acceptDownloads: true });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));
    await waitForServer();
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await expectText(page, "Tus datos no se almacenan en esta versión.");
    await page.getByRole("button", { name: "Comenzar" }).click();
    await page.getByRole("textbox", { name: "Currículum" }).fill(cvText);
    await expectText(page, `${cvText.length} caracteres`);
    await page.getByRole("button", { name: "Usar análisis de texto plano" }).click();
    await expectText(page, "Modo de texto plano seleccionado");
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.getByRole("textbox", { name: "Oferta laboral" }).fill(offerText);
    await expectText(page, `${offerText.length} caracteres`);
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.getByRole("button", { name: "Ejecutar análisis determinista" }).click();
    await expectText(page, "No cubiertos");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expectText(page, "Docker");
    await expectText(page, "No se encontró evidencia en el currículum.");
    await page.getByRole("button", { name: "Continuar" }).click();

    const bodyAfterProposals = await page.locator("body").innerText();
    if (bodyAfterProposals.includes("No hay propuestas aplicables")) {
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByRole("button", { name: "Generar vista previa sin cambios" }).click();
    } else {
      await page.getByRole("button", { name: "Continuar" }).click();
      const firstTextarea = page.locator("textarea").first();
      const originalProposal = await firstTextarea.inputValue();
      await firstTextarea.fill(`${originalProposal}\n# Markdown`);
      await expectText(page, "rechazada");
      await page.getByRole("button", { name: "Restaurar propuesta" }).first().click();
      const rejectOptions = page.getByLabel("Rechazar");
      const rejectCount = await rejectOptions.count();
      for (let index = 0; index < rejectCount; index += 1) {
        await rejectOptions.nth(index).check();
      }
      await page.getByRole("button", { name: "Aplicar decisiones aprobadas" }).click();
    }

    await page.getByRole("button", { name: "Continuar" }).click();
    await expectText(page, "Rechazadas");
    await page.getByRole("button", { name: "Anterior" }).click();
    await expectText(page, "Decisión humana");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    const ariaCurrentCount = await page.locator('[aria-current="step"]').count();
    if (ariaCurrentCount !== 1) {
      throw new Error(`EXPECTED_ONE_ARIA_CURRENT_STEP got ${ariaCurrentCount}`);
    }

    await page.keyboard.press("Tab");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar DOCX" }).click();
    const download = await downloadPromise;
    if (download.suggestedFilename() !== "curriculum-adaptado.docx") {
      throw new Error(`UNEXPECTED_FILENAME ${download.suggestedFilename()}`);
    }

    const downloadPath = join(downloadDir, download.suggestedFilename());
    await download.saveAs(downloadPath);
    const content = await readFile(downloadPath);
    if (content.length === 0) {
      throw new Error("EMPTY_DOCX_DOWNLOAD");
    }
    const zip = await JSZip.loadAsync(content);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    if (!documentXml?.includes("TypeScript") || documentXml.includes("proposalId")) {
      throw new Error("DOCX_CONTENT_ASSERTION_FAILED");
    }

    if (consoleErrors.length > 0) {
      throw new Error(`CONSOLE_ERRORS\n${consoleErrors.join("\n")}`);
    }
  } finally {
    await browser?.close();
    await rm(downloadDir, { recursive: true, force: true });
  }
}

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10_000 });
}

try {
  await run();
} finally {
  stopServer();
}

function stopServer() {
  if (server.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  server.kill("SIGTERM");
}
