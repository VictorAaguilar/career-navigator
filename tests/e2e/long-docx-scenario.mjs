import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";

export const longResumeOriginal = "Desarrollo con React y TypeScript. Pruebas con Vitest.";
export const longResumeEdited = "Pruebas con Vitest. Desarrollo con React y TypeScript.";
export const longResumeParagraphs = Object.freeze(Array.from({ length: 72 }, (_, index) =>
  `Proyecto sintético ${String(index + 1).padStart(3, "0")}. Coordinación de documentación técnica, revisión de entregables y seguimiento de acuerdos del equipo.`,
));
export const longResumeText = [
  "PERFIL PROFESIONAL", "Profesional de desarrollo web con experiencia de prueba.",
  "EXPERIENCIA", longResumeOriginal, ...longResumeParagraphs,
  "FORMACIÓN", "Formación sintética en desarrollo de software.",
].join("\n");
export const longResumeOffer = "- React\n- TypeScript";

export async function runLongDocxScenario(page, { baseUrl, downloadDir }) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Comenzar", exact: true }).click();
  await page.getByRole("textbox", { name: "Currículum", exact: true }).fill(longResumeText);
  await page.getByRole("button", { name: "Detectar estructura", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar estructura", exact: true }).click();
  const next = () => page.getByRole("button", { name: "Continuar", exact: true }).click();
  await next();
  await page.getByRole("textbox", { name: "Oferta laboral", exact: true }).fill(longResumeOffer);
  await next();
  await page.getByRole("button", { name: "Ejecutar análisis determinista", exact: true }).click();
  await next(); await next(); await next();

  const editor = page.locator("textarea").first();
  assert.equal(await editor.inputValue(), longResumeOriginal, "LONG_DOCX_UNEXPECTED_TARGET");
  await editor.fill(longResumeEdited);
  const approvals = page.getByLabel("Aceptar", { exact: true });
  const rejections = page.getByLabel("Rechazar", { exact: true });
  const count = await approvals.count();
  assert.ok(count > 0, "LONG_DOCX_NO_PROPOSALS");
  await approvals.first().check();
  for (let index = 1; index < count; index += 1) await rejections.nth(index).check();
  await page.getByRole("button", { name: "Aplicar decisiones aprobadas", exact: true }).click();
  await next();
  await page.getByText("Decisión: Editada y aceptada", { exact: true }).first().waitFor();
  const preview = page.locator(".resume-preview");
  const texts = await preview.locator("h3, p").allTextContents();
  const expected = [
    "PERFIL PROFESIONAL", "Profesional de desarrollo web con experiencia de prueba.",
    "EXPERIENCIA", longResumeEdited, ...longResumeParagraphs,
    "FORMACIÓN", "Formación sintética en desarrollo de software.",
  ];
  assert.deepEqual(texts, expected, "LONG_DOCX_PREVIEW_CONTENT_MISMATCH");
  await next();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar currículum adaptado", exact: true }).click();
  const download = await event;
  assert.equal(download.suggestedFilename(), "curriculum-adaptado.docx");
  const downloadPath = join(downloadDir, "long-edited-curriculum.docx");
  await download.saveAs(downloadPath);
  const zip = await JSZip.loadAsync(await readFile(downloadPath));
  const xml = await zip.file("word/document.xml")?.async("string");
  assert.ok(xml, "LONG_DOCX_MISSING_DOCUMENT");
  // This fixture has no XML metacharacters or inline controls, so each paragraph is one run.
  const rendered = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]);
  assert.deepEqual(rendered, expected, "LONG_DOCX_EXPORT_CONTENT_MISMATCH");
  assert.ok(!xml.includes(longResumeOriginal), "LONG_DOCX_ORIGINAL_EDIT_LEAKED");
  return { downloadPath, paragraphs: expected.length, bodyParagraphs: longResumeParagraphs.length };
}
