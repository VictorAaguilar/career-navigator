import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import JSZip from "jszip";
import { launchBrowserWithFallback } from "./tailoring-demo-browser-options.mjs";

const headed = process.argv.includes("--headed");
const port = 4178;
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

const viewports = Object.freeze([
  { width: 320, height: 640 },
  { width: 375, height: 667 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]);

const serverCommand = process.platform === "win32" ? "cmd.exe" : "npm";
const serverArgs = process.platform === "win32" ? [
  "/d",
  "/s",
  "/c",
  `npm.cmd run preview --workspace @career-navigator/web -- --host 127.0.0.1 --port ${port}`,
] : [
  "run",
  "preview",
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
      // Vite preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`RC_PREVIEW_SERVER_NOT_READY\n${serverOutput}`);
}

async function run() {
  const downloadDir = await mkdtemp(join(tmpdir(), "career-navigator-rc-download-"));
  let browser;
  try {
    ({ browser } = await launchBrowserWithFallback({
      launcher: chromium,
      headed,
      env: process.env,
      logger: console.log,
    }));
    await waitForServer();

    const page = await browser.newPage({ acceptDownloads: true });
    const telemetry = installPageGuards(page);
    await runReleaseCandidateScenario(page, downloadDir);
    await runResponsiveScenario(page);
    await runKeyboardScenario(page);
    assertNoTelemetryFailures(telemetry);
  } finally {
    await browser?.close();
    await rm(downloadDir, { recursive: true, force: true });
  }
}

async function runReleaseCandidateScenario(page, downloadDir) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await expectText(page, "Career Navigator");
  await expectText(page, "Adaptación de currículum asistida y revisable");
  await assertNoHorizontalOverflow(page, "start");
  await assertSingleCurrentStep(page);

  await page.getByRole("button", { name: "Comenzar" }).click();
  await expectText(page, "Currículum");
  await page.getByRole("textbox", { name: "Currículum" }).fill(structuredCv);
  await page.getByRole("button", { name: "Detectar estructura" }).click();
  await expectText(page, "secciones detectadas");
  await expectText(page, "PERFIL PROFESIONAL");
  await expectText(page, "EXPERIENCIA");
  await expectText(page, "FORMACIÓN");
  await page.getByRole("button", { name: "Confirmar estructura" }).click();
  await expectText(page, "Modo estructurado seleccionado");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("textbox", { name: "Oferta laboral" }).fill(offerText);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ejecutar análisis determinista" }).click();
  await expectText(page, "Puntuación");
  await expectText(page, "No cubiertos");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expectText(page, "TypeScript");
  await expectText(page, "Ubicación de la evidencia");
  await expectText(page, "Docker");
  await expectText(page, "No se encontró evidencia en el currículum.");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expectText(page, "Ubicación objetivo");
  await expectText(page, "Por qué se propone aquí");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expectText(page, "Decisión humana");

  const textareas = page.locator("textarea");
  const firstCandidate = await textareas.first().inputValue();
  await textareas.first().fill(`${firstCandidate} React TypeScript.`);
  await expectText(page, "Validación:");

  const acceptOptions = page.getByLabel("Aceptar");
  const rejectOptions = page.getByLabel("Rechazar");
  const proposalCount = await acceptOptions.count();
  if (proposalCount === 0) {
    throw new Error("RC_EXPECTED_PROPOSALS");
  }
  await acceptOptions.first().check();
  for (let index = 1; index < proposalCount; index += 1) {
    await rejectOptions.nth(index).check();
  }
  await page.getByRole("button", { name: "Aplicar decisiones aprobadas" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expectText(page, "Cambios aplicados");
  await expectText(page, "Editada y aceptada");
  if (proposalCount > 1) {
    await expectText(page, "Cambios no aplicados");
    await expectText(page, "Rechazada");
  }
  await page.getByRole("button", { name: "Continuar" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar currículum adaptado" }).click();
  const download = await downloadPromise;
  if (download.suggestedFilename() !== "curriculum-adaptado.docx") {
    throw new Error(`RC_UNEXPECTED_FILENAME ${download.suggestedFilename()}`);
  }
  const downloadPath = join(downloadDir, download.suggestedFilename());
  await download.saveAs(downloadPath);
  await assertDownloadedDocx(downloadPath);
  await assertNoVisibleTechnicalIds(page);
  await assertSingleCurrentStep(page);
}

async function runResponsiveScenario(page) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await assertNoHorizontalOverflow(page, `viewport-${viewport.width}-start`);
    await page.getByRole("button", { name: "Comenzar" }).click();
    await page.getByRole("textbox", { name: "Currículum" }).fill(structuredCv);
    await page.getByRole("button", { name: "Detectar estructura" }).click();
    await expectText(page, "secciones detectadas");
    await assertNoHorizontalOverflow(page, `viewport-${viewport.width}-structure`);
    await page.getByRole("button", { name: "Confirmar estructura" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("textbox", { name: "Oferta laboral" }).fill(offerText);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Ejecutar análisis determinista" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await assertNoHorizontalOverflow(page, `viewport-${viewport.width}-requirements`);
    await page.getByRole("button", { name: "Continuar" }).click();
    await assertNoHorizontalOverflow(page, `viewport-${viewport.width}-proposals`);
  }
}

async function runKeyboardScenario(page) {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await focusByKeyboard(page, "Comenzar");
  await page.keyboard.press("Enter");
  await expectText(page, "Currículum");
  await focusByKeyboard(page, "Currículum");
  await page.keyboard.insertText("EXPERIENCIA\nReact TypeScript");
  await focusByKeyboard(page, "Detectar estructura");
  await page.keyboard.press("Enter");
  await expectText(page, "secciones detectadas");
  await focusByKeyboard(page, "Tipo de sección");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await focusByKeyboard(page, "Confirmar estructura");
  await page.keyboard.press("Enter");
  await expectText(page, "Modo estructurado seleccionado");
}

async function focusByKeyboard(page, accessibleName) {
  for (let index = 0; index < 80; index += 1) {
    const activeName = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) {
        return "";
      }
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
        const label = active.labels?.[0]?.textContent ?? "";
        return `${label} ${active.getAttribute("aria-label") ?? ""}`.trim();
      }
      return active.textContent ?? "";
    });
    if (activeName.includes(accessibleName)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error(`RC_KEYBOARD_FOCUS_NOT_FOUND ${accessibleName}`);
}

function installPageGuards(page) {
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
  return { consoleErrors, externalRequests };
}

function assertNoTelemetryFailures({ consoleErrors, externalRequests }) {
  if (externalRequests.length > 0) {
    throw new Error(`RC_EXTERNAL_REQUESTS\n${externalRequests.join("\n")}`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(`RC_CONSOLE_ERRORS\n${consoleErrors.join("\n")}`);
  }
}

async function assertNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    windowWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  const effectiveViewportWidth = Math.max(result.viewportWidth, result.windowWidth);
  if (result.documentWidth > effectiveViewportWidth || result.bodyWidth > effectiveViewportWidth) {
    throw new Error(`RC_HORIZONTAL_OVERFLOW ${label} ${JSON.stringify(result)}`);
  }
}

async function assertSingleCurrentStep(page) {
  const ariaCurrentCount = await page.locator('[aria-current="step"]').count();
  if (ariaCurrentCount !== 1) {
    throw new Error(`RC_EXPECTED_ONE_ARIA_CURRENT_STEP got ${ariaCurrentCount}`);
  }
}

async function assertNoVisibleTechnicalIds(page) {
  const text = await page.locator("body").innerText();
  if (/section-\d|block-\d|proposal\||requirement_\d|evidence_\d/u.test(text)) {
    throw new Error("RC_VISIBLE_TECHNICAL_ID_FOUND");
  }
}

async function assertDownloadedDocx(downloadPath) {
  const content = await readFile(downloadPath);
  if (content.byteLength === 0 || content[0] !== 0x50 || content[1] !== 0x4b) {
    throw new Error("RC_INVALID_DOCX_ZIP_SIGNATURE");
  }
  const zip = await JSZip.loadAsync(content);
  const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (contentTypes === undefined || documentXml === undefined) {
    throw new Error("RC_DOCX_REQUIRED_PART_MISSING");
  }
  if (
    !documentXml.includes("TypeScript") ||
    !documentXml.includes("React") ||
    documentXml.includes("Docker") ||
    documentXml.includes("Ubicación") ||
    documentXml.includes("targetLocation") ||
    documentXml.includes("proposalId") ||
    documentXml.includes("requirement_") ||
    documentXml.includes("evidence_")
  ) {
    throw new Error("RC_DOCX_CONTENT_ASSERTION_FAILED");
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
