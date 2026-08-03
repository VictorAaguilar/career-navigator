import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const modulePath = "../../apps/web/src/app/structured-resume-parsing";

describe("structured resume parsing", () => {
  let mod: any;

  beforeAll(async () => {
    mod = await import(modulePath);
  });

  const structuredResume = [
    "Ada Ejemplo",
    "ada@example.test",
    "",
    "PERFIL PROFESIONAL",
    "Profesional con experiencia en desarrollo web.",
    "",
    "EXPERIENCIA",
    "Senior Frontend Developer",
    "- Desarrollo de aplicaciones con TypeScript y React.",
    "- Creación de pruebas automatizadas con Vitest.",
    "",
    "FORMACIÓN",
    "Grado sintético en Ingeniería Informática.",
    "",
    "HABILIDADES",
    "TypeScript",
    "React",
    "Vitest",
    "",
    "IDIOMAS",
    "Español",
    "Inglés",
    "",
    "CERTIFICACIONES",
    "Certificación sintética segura.",
    "",
    "PROYECTOS",
    "Proyecto interno con Git.",
  ].join("\n");

  it("defines exact immutable kinds, labels, confidence values, modes and warning codes", () => {
    expect(mod.StructuredResumeSectionKind).toEqual([
      "contact",
      "summary",
      "experience",
      "education",
      "skills",
      "languages",
      "certifications",
      "projects",
      "other",
    ]);
    expect(mod.STRUCTURED_RESUME_SECTION_LABELS).toMatchObject({
      contact: "Contacto",
      summary: "Perfil profesional",
      education: "Formación",
    });
    expect(mod.STRUCTURED_RESUME_CONFIDENCE_LABELS.high).toBe("Confianza alta");
    expect(mod.StructuredResumeParseMode).toEqual(["structured", "plain"]);
    expect(Object.isFrozen(mod.STRUCTURED_RESUME_ALIASES.contact)).toBe(true);
    expect(Object.values(mod.StructuredResumeWarningCode)).toContain("STRUCTURED_RESUME_NO_HEADINGS");
  });

  it("normalizes comparison keys without changing visible headings", () => {
    expect(mod.normalizeHeadingForComparison("  Formación   Académica: ")).toBe("formacion academica");
    const result = mod.parseStructuredResumeText("Formación Académica:\nTexto literal con acento.");
    expect(result.draft.sections[0].originalHeading).toBe("Formación Académica:");
    expect(result.draft.sections[0].lines[1].text).toBe("Texto literal con acento.");
  });

  it("recognizes Spanish and English aliases with deterministic confidence", () => {
    const text = [
      "Contact information",
      "ada@example.test",
      "Professional Experience",
      "- TypeScript",
      "Academic Background",
      "Synthetic degree",
      "Technical Skills",
      "React",
      "Languages",
      "English",
      "Courses and Certifications",
      "Course",
      "Selected Projects",
      "Project",
    ].join("\n");

    const kinds = mod.parseStructuredResumeText(text).draft.sections.map((section: any) => section.kind);
    expect(kinds).toEqual(["contact", "experience", "education", "skills", "languages", "certifications", "projects"]);
    expect(mod.parseStructuredResumeText("Experiencia relevante\nTexto").draft.sections[0].confidence).toBe("medium");
    expect(mod.parseStructuredResumeText("EXPERIENCIA\nTexto").draft.sections[0].confidence).toBe("high");
  });

  it("does not use fuzzy matching or classify body-like lines as headings", () => {
    const text = [
      "EXPERIENCIA",
      "Senior Frontend Developer",
      "- React, TypeScript, Vitest, Git",
      "ada@example.test",
      "https://example.test",
      "2024",
      "Esta es una frase larga que termina como una oración.",
    ].join("\n");
    const section = mod.parseStructuredResumeText(text).draft.sections[0];

    expect(section.kind).toBe("experience");
    expect(section.lines.map((line: any) => line.text)).toContain("Senior Frontend Developer");
    expect(section.lines.filter((line: any) => line.role === "heading")).toHaveLength(1);
    expect(() => mod.parseStructuredResumeText("Experienzia\nTexto")).not.toThrow();
    expect(mod.parseStructuredResumeText("Experienzia\nTexto").draft.sections[0].kind).toBe("other");
  });

  it("preserves order, CRLF/LF/tabs/Unicode/emoji/Markdown and stable IDs", () => {
    const text = "PERFIL PROFESIONAL\r\n\tTexto con acento, emoji 🙂 y **Markdown**.\r\nEXPERIENCIA\r\n- Línea final";
    const first = mod.parseStructuredResumeText(text);
    const second = mod.parseStructuredResumeText(text);

    expect(second).toEqual(first);
    expect(first.draft.sections.map((section: any) => section.id)).toEqual(["section-000", "section-001"]);
    expect(first.draft.sections[0].lines[1].text).toBe("\tTexto con acento, emoji 🙂 y **Markdown**.");
    expect(first.draft.sections[1].lines[1].text).toBe("- Línea final");
  });

  it("returns a single other section with stable warning when no safe headings exist", () => {
    const result = mod.parseStructuredResumeText("Línea uno\nLínea dos con React\n1899");

    expect(result.draft.sections).toHaveLength(1);
    expect(result.draft.sections[0].kind).toBe("other");
    expect(result.warnings).toEqual(["STRUCTURED_RESUME_NO_HEADINGS"]);
    expect(result.draft.sections[0].lines.map((line: any) => line.text)).toEqual([
      "Línea uno",
      "Línea dos con React",
      "1899",
    ]);
  });

  it("keeps initial contact blocks as text and ambiguous initial blocks as other", () => {
    const contact = mod.parseStructuredResumeText("Ada Ejemplo\nada@example.test\nEXPERIENCIA\n- React");
    expect(contact.draft.sections[0].kind).toBe("contact");
    expect(contact.draft.sections[0].lines.map((line: any) => line.text)).toEqual(["Ada Ejemplo", "ada@example.test"]);
    expect(contact.draft.sections[0].warningCodes).toContain("STRUCTURED_RESUME_INITIAL_BLOCK_CLASSIFIED_AS_CONTACT");

    const ambiguous = mod.parseStructuredResumeText("DESARROLLADOR DE SOFTWARE\nPERFIL\nTexto");
    expect(ambiguous.draft.sections[0].kind).toBe("other");
    expect(ambiguous.draft.sections[0].lines[0].text).toBe("DESARROLLADOR DE SOFTWARE");
  });

  it("keeps unknown and repeated sections separate in source order", () => {
    const result = mod.parseStructuredResumeText("PUBLICACIONES\nTexto A\nEXPERIENCIA\nTexto B\nEXPERIENCIA\nTexto C");

    expect(result.draft.sections.map((section: any) => section.kind)).toEqual(["other", "experience", "experience"]);
    expect(result.draft.sections[0].warningCodes).toContain("STRUCTURED_RESUME_REVIEW_OTHER_SECTION");
    expect(result.draft.sections.map((section: any) => section.lines.at(-1).text)).toEqual(["Texto A", "Texto B", "Texto C"]);
  });

  it("changes section kind without mutating the previous draft and requires valid kinds", () => {
    const result = mod.parseStructuredResumeText("PUBLICACIONES\nTexto");
    const previous = result.draft;
    const updated = mod.updateStructuredResumeSectionKind(previous, "section-000", "projects");

    expect(previous.sections[0].kind).toBe("other");
    expect(updated.sections[0].kind).toBe("projects");
    expect(updated.sections[0].wasManuallyReviewed).toBe(true);
    expect(updated.sections[0].lines[1].text).toBe("Texto");
    expect(Object.isFrozen(updated)).toBe(true);
    expect(() => mod.updateStructuredResumeSectionKind(previous, "section-000", "invalid")).toThrow(
      "STRUCTURED_RESUME_SECTION_INVALID",
    );
  });

  it("validates runtime contracts and rejects additional properties", () => {
    const result = mod.parseStructuredResumeText("EXPERIENCIA\nTexto");
    expect(() => mod.assertStructuredResumeDraft(result.draft)).not.toThrow();
    expect(() => mod.assertStructuredResumeDraft({ ...result.draft, extra: true })).toThrow(
      "STRUCTURED_RESUME_DRAFT_INVALID",
    );
    expect(() => mod.assertStructuredResumeDraft({
      ...result.draft,
      sections: [{ ...result.draft.sections[0], extra: true }],
    })).toThrow("STRUCTURED_RESUME_SECTION_INVALID");
  });

  it("builds a valid ResumeDocument from the confirmed draft without inventing evidence for headings", () => {
    const draft = mod.parseStructuredResumeText(structuredResume).draft;
    const parsed = mod.buildParsedResumeFromStructuredDraft(draft);

    expect(parsed.resumeDocument.sections.map((section: any) => section.kind)).toEqual([
      "header",
      "summary",
      "experience",
      "education",
      "skills",
      "languages",
      "certifications",
      "projects",
    ]);
    expect(parsed.resumeDocument.sections[2].blocks[0]).toMatchObject({
      kind: "heading",
      originalText: "EXPERIENCIA",
      evidenceIds: [],
    });
    expect(parsed.resumeDocument.sections[2].blocks[2].originalText).toBe("- Desarrollo de aplicaciones con TypeScript y React.");
    expect(parsed.evidences.map((evidence: any) => evidence.id)).toEqual(parsed.resumeDocument.sections
      .flatMap((section: any) => section.blocks)
      .flatMap((block: any) => block.evidenceIds));
    expect(Object.isFrozen(parsed.resumeDocument.sections[0].blocks[0].sourceLocator)).toBe(true);
  });

  it("keeps structured parsing deterministic and independent from Date, random, UUID, storage, network and logs", () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    const randomSpy = vi.spyOn(Math, "random");
    const randomUuidSpy = vi.spyOn(crypto, "randomUUID");

    const first = mod.buildParsedResumeFromStructuredDraft(mod.parseStructuredResumeText(structuredResume).draft);
    const second = mod.buildParsedResumeFromStructuredDraft(mod.parseStructuredResumeText(structuredResume).draft);

    expect(second).toEqual(first);
    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(randomUuidSpy).not.toHaveBeenCalled();

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
    randomUuidSpy.mockRestore();

    const source = readFileSync(join(process.cwd(), "apps/web/src/app/structured-resume-parsing.ts"), "utf8");
    expect(source).not.toMatch(/Date\.now|Math\.random|randomUUID|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|sendBeacon/);
    expect(source).not.toMatch(/OpenAI|Anthropic|Gemini|console\.log|C:[\\/]|AppData/);
  });
});
