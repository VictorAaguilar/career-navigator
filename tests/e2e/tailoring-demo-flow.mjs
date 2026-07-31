import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import JSZip from "jszip";

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
  await assertChromiumInstalled();
  const browser = await chromium.launch({ headless: !headed });
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

  try {
    await waitForServer();
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await expectText(page, "Tus datos no se almacenan en esta versión.");
    await page.getByRole("button", { name: "Comenzar" }).click();
    await page.getByLabel("Currículum").fill(cvText);
    await expectText(page, `${cvText.length} caracteres`);
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.getByLabel("Oferta laboral").fill(offerText);
    await expectText(page, `${offerText.length} caracteres`);
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.getByRole("button", { name: "Ejecutar análisis determinista" }).click();
    await expectText(page, "Docker");
    await expectText(page, "No cubiertos");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expectText(page, "No hay evidencia en el currículum.");
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
      await page.getByLabel("Aceptar").first().check();
      await page.getByRole("button", { name: "Aplicar decisiones aprobadas" }).click();
    }

    await page.getByRole("button", { name: "Continuar" }).click();
    await expectText(page, "Desarrollador de software");
    await page.getByRole("button", { name: "Anterior" }).click();
    await expectText(page, "Desarrollador de software");
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
    await browser.close();
    await rm(downloadDir, { recursive: true, force: true });
  }
}

async function assertChromiumInstalled() {
  try {
    await access(chromium.executablePath());
  } catch {
    throw new Error("PLAYWRIGHT_CHROMIUM_NOT_INSTALLED: run npx playwright install chromium");
  }
}

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 10_000 });
}

try {
  await run();
} finally {
  server.kill();
}
