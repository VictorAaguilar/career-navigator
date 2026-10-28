import assert from "node:assert/strict";

export async function runTextResizingScenario(page, baseUrl) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("checkbox").check();
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const button = document.activeElement;
    const style = getComputedStyle(button);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    const pixel = (color) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    };
    const luminance = (rgba) => rgba.slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const outline = pixel(style.outlineColor);
    const surface = pixel(getComputedStyle(button.closest(".intro-band")).backgroundColor);
    const a = luminance(outline);
    const b = luminance(surface);
    return {
      label: button.textContent.trim(),
      visible: button.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      width: parseFloat(style.outlineWidth),
      opaque: outline[3] === 255 && surface[3] === 255,
      contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      fontSize: parseFloat(style.fontSize),
    };
  });
  assert.equal(focus.label, "Comenzar");
  assert.equal(focus.visible, true);
  assert.equal(focus.outlineStyle, "solid");
  assert.ok(focus.width >= 3 && focus.opaque && focus.contrast >= 3, "START_FOCUS_CONTRAST");

  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const enlarged = await page.getByRole("button", { name: "Comenzar", exact: true })
    .evaluate((button) => parseFloat(getComputedStyle(button).fontSize));
  assert.equal(enlarged, focus.fontSize * 2, "TEXT_NOT_DOUBLED");
  const checkLayout = async (stage) => {
    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      clipped: [...document.querySelectorAll("h1, h2, h3, p, button")]
        .filter((element) => element.getClientRects().length && element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.textContent.trim()),
    }));
    assert.ok(layout.scroll <= layout.width + 1, `TEXT_RESIZING_OVERFLOW ${stage}`);
    assert.deepEqual(layout.clipped, [], `TEXT_RESIZING_CLIPPED ${stage}`);
  };
  await checkLayout("start");
  await page.getByRole("button", { name: "Comenzar", exact: true }).click();
  await checkLayout("resume");
  const resume = page.getByRole("textbox", { name: "Currículum", exact: true });
  await resume.fill("EXPERIENCIA\nDesarrollo con React.");
  assert.equal(await resume.inputValue(), "EXPERIENCIA\nDesarrollo con React.");
  await page.getByRole("button", { name: "Detectar estructura", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar estructura", exact: true }).click();
  await checkLayout("confirmed-resume");
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  console.log("RC_TEXT_RESIZING_OK focus>=3:1 text=200% viewport=320");
}
