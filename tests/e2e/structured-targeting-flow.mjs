import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import JSZip from "jszip";
import { launchBrowserWithFallback } from "./tailoring-demo-browser-options.mjs";

const headed = process.argv.includes("--headed");
const port = 5177;
const baseUrl = `http://127.0.0.1:${port}/`;

const structuredCv = [
  "DESARROLLADOR DE SOFTWARE",
  "",
  "PERFIL PROFESIONAL",
  "Profesional con experiencia en desarrollo de aplicaciones web.",
  "",
  "EXPERIENCIA",
  "- Desarrollo de aplicaciones con TypeScript y React.",
  "- Creación de pruebas automatizadas con Vitest.",
  "- Revisión de código con Git.",
  "",
  "FORMACIÓN",
  "Grado sintético en Ingeniería Informática.",
  "",
  "HABILIDADES",
  "TypeScript",
  "React",
  "Vitest",
  "Git",
  "",
  "IDIOMAS",
  "Español",
  "Inglés",
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
  const downloadDir = await mkdtemp(join(tmpdir(), "career-navigator-targeting-download-"));
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
    const externalRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith(baseUrl) && !url.startsWith("blob:") && !url.startsWith("data:")) {
        externalRequests.push(url);
      }
    });
    await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));

    await waitForServer();
    await runTargetingScenario(page, downloadDir);

    const ariaCurrentCount = await page.locator('[aria-current="step"]').count();
    if (ariaCurrentCount !== 1) {
      throw new Error(`EXPECTED_ONE_ARIA_CURRENT_STEP got ${ariaCurrentCount}`);
    }
    if (externalRequests.length > 0) {
      throw new Error(`EXTERNAL_REQUESTS\n${externalRequests.join("\n")}`);
    }
    if (consoleErrors.length > 0) {
      throw new Error(`CONSOLE_ERRORS\n${consoleErrors.join("\n")}`);
    }
  } finally {
    await browser?.close();
    await rm(downloadDir, { recursive: true, force: true });
  }
}

async function runTargetingScenario(page, downloadDir) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Comenzar" }).click();
  await page.getByRole("textbox", { name: "Currículum" }).fill(structuredCv);
  await page.getByRole("button", { name: "Detectar estructura" }).click();
  await expectText(page, "secciones detectadas");
  await expectText(page, "EXPERIENCIA");
  await page.getByRole("button", { name: "Confirmar estructura" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("textbox", { name: "Oferta laboral" }).fill(offerText);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ejecutar análisis determinista" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expectText(page, "Ubicación de la evidencia");
  await expectText(page, "Experiencia · bloque 2");
  await expectText(page, "Experiencia · bloque 4");
  await expectText(page, "Docker");
  await expectText(page, "No se encontró evidencia en el currículum.");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expectText(page, "Ubicación objetivo");
  await expectText(page, "Por qué se propone aquí");
  await expectText(page, "Este bloque contiene la evidencia relacionada con el requisito.");
  await assertNoVisibleTechnicalIds(page);

  await page.getByRole("button", { name: "Continuar" }).click();
  await expectText(page, "Ubicación objetivo");
  const acceptOptions = page.getByLabel("Aceptar");
  const rejectOptions = page.getByLabel("Rechazar");
  const optionCount = await acceptOptions.count();
  if (optionCount === 0) {
    throw new Error("EXPECTED_TARGETING_PROPOSALS");
  }
  await acceptOptions.first().check();
  for (let index = 1; index < optionCount; index += 1) {
    await rejectOptions.nth(index).check();
  }
  await page.getByRole("button", { name: "Aplicar decisiones aprobadas" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expectText(page, "Cambios aplicados");
  await expectText(page, "Aceptada");
  if (optionCount > 1) {
    await expectText(page, "Cambios no aplicados");
    await expectText(page, "Rechazada");
  }
  await assertNoVisibleTechnicalIds(page);
  await page.getByRole("button", { name: "Continuar" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar currículum adaptado" }).click();
  const download = await downloadPromise;
  if (download.suggestedFilename() !== "curriculum-adaptado.docx") {
    throw new Error(`UNEXPECTED_FILENAME ${download.suggestedFilename()}`);
  }
  const downloadPath = join(downloadDir, download.suggestedFilename());
  await download.saveAs(downloadPath);
  const content = await readFile(downloadPath);
  const zip = await JSZip.loadAsync(content);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (
    !documentXml?.includes("TypeScript") ||
    documentXml.includes("Ubicación") ||
    documentXml.includes("targetLocation") ||
    documentXml.includes("proposalId")
  ) {
    throw new Error("DOCX_TARGETING_METADATA_ASSERTION_FAILED");
  }
}

async function assertNoVisibleTechnicalIds(page) {
  const text = await page.locator("body").innerText();
  if (/section-\d|block-\d|proposal\||requirement_\d|evidence_\d/u.test(text)) {
    throw new Error("VISIBLE_TECHNICAL_ID_FOUND");
  }
}

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15_000 });
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
