import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import JSZip from "jszip";
import { launchBrowserWithFallback } from "./tailoring-demo-browser-options.mjs";

const headed = process.argv.includes("--headed");
const port = 5174;
const baseUrl = `http://127.0.0.1:${port}/`;
const offerText = [
  "Buscamos desarrollador frontend con experiencia en:",
  "- React",
  "- TypeScript",
  "- Pruebas automatizadas",
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
  const tempDir = await mkdtemp(join(tmpdir(), "career-navigator-import-e2e-"));
  const downloadDir = await mkdtemp(join(tmpdir(), "career-navigator-import-download-"));
  const docxPath = join(tempDir, "synthetic-resume.docx");
  const pdfPath = join(tempDir, "synthetic-resume.pdf");
  const emptyPdfPath = join(tempDir, "synthetic-empty.pdf");
  const fakePdfPath = join(tempDir, "renamed.pdf");
  await writeFile(docxPath, await buildSyntheticDocx());
  await writeFile(pdfPath, buildSyntheticPdf(["PDF React TypeScript", "Pruebas automatizadas"]));
  await writeFile(emptyPdfPath, buildSyntheticPdf([]));
  await writeFile(fakePdfPath, "not a pdf");

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
    await runDocxFlow(page, docxPath, downloadDir);
    await runPdfFlow(page, pdfPath);
    await runPdfNoTextFlow(page, emptyPdfPath);
    await runInvalidFileFlow(page, fakePdfPath);

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
    await rm(tempDir, { recursive: true, force: true });
    await rm(downloadDir, { recursive: true, force: true });
  }
}

async function runDocxFlow(page, docxPath, downloadDir) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Comenzar" }).click();
  await page.getByLabel("Seleccionar archivo DOCX o PDF").setInputFiles(docxPath);
  await expectText(page, "Texto extraído desde DOCX");
  await expectText(page, "El formato visual");
  await expectText(page, "Paso 2 de 9");

  const resumeBox = page.getByRole("textbox", { name: "Currículum" });
  await expectInputValue(resumeBox, "DOCX React TypeScript");
  await resumeBox.fill(`${await resumeBox.inputValue()}\nEdición local importada`);
  await page.getByRole("button", { name: "Detectar estructura" }).click();
  await expectText(page, "secciones detectadas");
  await page.getByRole("button", { name: "Confirmar estructura" }).click();
  await expectText(page, "Modo estructurado seleccionado");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("textbox", { name: "Oferta laboral" }).fill(offerText);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ejecutar análisis determinista" }).click();
  await expectText(page, "Cubiertos");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expectText(page, "React");
  await page.getByRole("button", { name: "Continuar" }).click();

  const bodyAfterProposals = await page.locator("body").innerText();
  if (bodyAfterProposals.includes("No hay propuestas aplicables")) {
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Generar vista previa sin cambios" }).click();
  } else {
    await page.getByRole("button", { name: "Continuar" }).click();
    const rejectOptions = page.getByLabel("Rechazar");
    const rejectCount = await rejectOptions.count();
    for (let index = 0; index < rejectCount; index += 1) {
      await rejectOptions.nth(index).check();
    }
    await page.getByRole("button", { name: "Aplicar decisiones aprobadas" }).click();
  }

  await page.getByRole("button", { name: "Continuar" }).click();
  await expectText(page, "Edición local importada");
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
  if (content.byteLength === 0) {
    throw new Error("EMPTY_DOCX_DOWNLOAD");
  }
  const zip = await JSZip.loadAsync(content);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml?.includes("Edici") || documentXml.includes("proposalId")) {
    throw new Error("DOCX_IMPORT_CONTENT_ASSERTION_FAILED");
  }
}

async function runPdfFlow(page, pdfPath) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Comenzar" }).click();
  await page.getByLabel("Seleccionar archivo DOCX o PDF").setInputFiles(pdfPath);
  await expectText(page, "Texto extraído desde PDF");
  await expectText(page, "orden del texto puede variar");
  const resumeBox = page.getByRole("textbox", { name: "Currículum" });
  await expectInputValue(resumeBox, "PDF React TypeScript");
  await resumeBox.fill(`${await resumeBox.inputValue()}\nCorrección PDF`);
  await expectInputValue(resumeBox, "Corrección PDF");
  await expectText(page, "Paso 2 de 9");
}

async function runPdfNoTextFlow(page, emptyPdfPath) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Comenzar" }).click();
  await page.getByLabel("Seleccionar archivo DOCX o PDF").setInputFiles(emptyPdfPath);
  await expectText(page, "no incluye OCR");
  await page.getByRole("textbox", { name: "Currículum" }).fill("Texto pegado manualmente");
  await expectInputValue(page.getByRole("textbox", { name: "Currículum" }), "Texto pegado manualmente");
}

async function runInvalidFileFlow(page, fakePdfPath) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Comenzar" }).click();
  await page.getByLabel("Seleccionar archivo DOCX o PDF").setInputFiles(fakePdfPath);
  await expectText(page, "no coincide con un DOCX o PDF válido");
}

async function expectText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15_000 });
}

async function expectInputValue(locator, text) {
  await locator.evaluate((element, expected) => {
    if (!(element instanceof HTMLTextAreaElement) || !element.value.includes(expected)) {
      throw new Error(`EXPECTED_TEXTAREA_VALUE ${expected}`);
    }
  }, text);
}

async function buildSyntheticDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file(
    "word/document.xml",
    [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:r><w:t>DOCX React TypeScript</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Pruebas automatizadas</w:t></w:r></w:p>',
      "</w:body></w:document>",
    ].join(""),
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

function buildSyntheticPdf(lines) {
  const textCommands = lines
    .map((line, index) => `72 ${720 - index * 24} Td (${escapePdfText(line)}) Tj`)
    .join("\n");
  const stream = lines.length === 0 ? "" : `BT /F1 18 Tf ${textCommands} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

function escapePdfText(value) {
  return value.replace(/\\/gu, "\\\\").replace(/\(/gu, "\\(").replace(/\)/gu, "\\)");
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
