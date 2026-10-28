import assert from "node:assert/strict";

// The supported RC browser channels are Chromium based; CDP exposes computed AX descriptions.
async function accessibleNode(session, selector) {
  const { root } = await session.send("DOM.getDocument");
  const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  assert.ok(nodeId, `ACCESSIBILITY_NODE_MISSING ${selector}`);
  const { nodes } = await session.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
  assert.ok(nodes[0] && !nodes[0].ignored, `ACCESSIBILITY_NODE_IGNORED ${selector}`);
  return nodes[0];
}

function property(node, name) {
  return node.properties?.find((item) => item.name === name)?.value.value;
}

async function assertImportError(page, session, kind) {
  const field = page.locator(`#${kind}-file-input`);
  const error = page.locator(`#${kind}-import-error`);
  await error.waitFor();
  assert.equal(await field.getAttribute("aria-invalid"), "true");
  const node = await accessibleNode(session, `#${kind}-file-input`);
  assert.equal(property(node, "invalid"), "true");
  const message = (await error.textContent()).trim();
  assert.ok(message.length > 0);
  assert.ok(node.description?.value.includes(message), "ACCESSIBILITY_IMPORT_ERROR_NOT_DESCRIBED");
}

export async function runAccessibleReviewScenario(page, baseUrl) {
  const session = await page.context().newCDPSession(page);
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Comenzar", exact: true }).click();
    await page.getByLabel("Seleccionar archivo DOCX o PDF").setInputFiles({
      name: "synthetic-invalid.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF"),
    });
    await assertImportError(page, session, "resume");
    await page.getByRole("button", { name: "Limpiar currículum importado o pegado", exact: true }).click();
    assert.equal(await page.locator("#resume-file-input").getAttribute("aria-invalid"), "false");
    assert.equal(await page.locator("#resume-import-error").count(), 0);

    await page.getByRole("textbox", { name: "Currículum", exact: true }).fill(
      "EXPERIENCIA\nDesarrollo con React y TypeScript.\nHABILIDADES\nReact\nTypeScript\nGit",
    );
    await page.getByRole("button", { name: "Detectar estructura", exact: true }).click();
    for (const [index, title] of ["EXPERIENCIA", "HABILIDADES"].entries()) {
      assert.equal(await page.getByRole("combobox", { name: `Tipo de sección ${index + 1}: ${title}`, exact: true }).count(), 1);
    }
    await page.getByRole("button", { name: "Confirmar estructura", exact: true }).click();
    const next = () => page.getByRole("button", { name: "Continuar", exact: true }).click();
    await next();
    await page.getByLabel("Seleccionar archivo TXT o MD").setInputFiles({
      name: "synthetic-empty.md", mimeType: "text/markdown", buffer: Buffer.from("   "),
    });
    await assertImportError(page, session, "job");
    await page.getByRole("button", { name: "Limpiar oferta importada o pegada", exact: true }).click();
    assert.equal(await page.locator("#job-file-input").getAttribute("aria-invalid"), "false");
    assert.equal(await page.locator("#job-import-error").count(), 0);
    await page.getByRole("textbox", { name: "Oferta laboral", exact: true }).fill("- React\n- TypeScript\n- Git");
    await next();
    await page.getByRole("button", { name: "Ejecutar análisis determinista", exact: true }).click();
    await next(); await next(); await next();

    const groups = page.getByRole("group", { name: /^Decisión humana para propuesta / });
    const count = await groups.count();
    assert.ok(count >= 2, "ACCESSIBILITY_EXPECTED_MULTIPLE_PROPOSALS");
    const names = [];
    for (let index = 0; index < count; index += 1) {
      const group = groups.nth(index);
      const prefix = new RegExp(`^Editar propuesta ${index + 1}: `);
      assert.equal(await page.getByRole("textbox", { name: prefix }).count(), 1);
      assert.equal(await page.getByRole("button", { name: new RegExp(`^Restaurar propuesta ${index + 1}: `) }).count(), 1);
      const groupNames = await group.getByRole("radio").evaluateAll((inputs) => inputs.map((input) => input.name));
      assert.equal(groupNames.length, 3);
      assert.ok(groupNames[0]);
      assert.ok(groupNames.every((name) => name === groupNames[0]));
      names.push(groupNames[0]);
    }
    assert.equal(new Set(names).size, count);
    await groups.first().getByRole("radio", { name: "Aceptar", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.ok(await groups.first().getByRole("radio", { name: "Rechazar", exact: true }).isChecked());
    assert.equal(await groups.nth(1).locator("input:checked").count(), 0);
    await groups.nth(1).getByRole("radio", { name: "Aceptar", exact: true }).check();
    assert.ok(await groups.first().getByRole("radio", { name: "Rechazar", exact: true }).isChecked());

    const editor = page.getByRole("textbox", { name: /^Editar propuesta 1: / });
    const original = await editor.inputValue();
    await editor.fill(`${original}\n# Markdown`);
    const status = page.locator('.validation-summary[role="status"]').first();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label^="Editar propuesta 1:"]')?.getAttribute("aria-invalid") === "true");
    assert.ok((await status.textContent()).includes("rechazada"));
    assert.ok(await groups.first().getByRole("radio", { name: "Aceptar", exact: true }).isDisabled());
    const axStatus = await accessibleNode(session, '.validation-summary[role="status"]');
    assert.equal(axStatus.role.value, "status");
    assert.equal(property(axStatus, "live"), "polite");
    assert.equal(property(axStatus, "atomic"), true);
    const axEditor = await accessibleNode(session, 'textarea[aria-label^="Editar propuesta 1:"]');
    assert.ok(axEditor.description?.value.includes("rechazada"));
    await page.getByRole("button", { name: /^Restaurar propuesta 1: / }).click();
    assert.equal(await editor.inputValue(), original);
    assert.equal(await editor.getAttribute("aria-invalid"), "false");
    assert.ok(await groups.first().getByRole("radio", { name: "Aceptar", exact: true }).isEnabled());
  } finally {
    await session.detach();
  }
}
