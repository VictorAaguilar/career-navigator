import { describe, expect, it, vi } from "vitest";
import {
  ResumeBlockSchema,
  ResumeDocumentSchema,
  ResumeSectionSchema,
  ResumeSourceSchema,
  ResumeSourceLocatorSchema,
  type Evidence,
  type ResumeBlock,
  type ResumeSection,
} from "../../src/schemas";
import { ResumeDocumentErrorCode, buildResumeDocument, type BuildResumeDocumentInput } from "../../src/core/resume";

const evidenceA: Evidence = {
  id: "evidence-a",
  type: "experience",
  title: "Platform automation",
  description: "Built deterministic automation for operational workflows.",
  source: "cv",
  declaredLevel: "advanced",
  verified: true,
  confidence: 0.9,
};

const evidenceB: Evidence = {
  id: "evidence-b",
  type: "project",
  title: "AI matching project",
  description: "Implemented explainable matching for role requirements.",
  source: "project",
  declaredLevel: "expert",
  verified: true,
  confidence: 0.95,
};

const makeBlock = (overrides: Partial<ResumeBlock> = {}): ResumeBlock => ({
  blockId: overrides.blockId ?? "block-a",
  kind: overrides.kind ?? "bullet",
  order: overrides.order ?? 0,
  originalText: overrides.originalText ?? "Built deterministic automation.",
  evidenceIds: overrides.evidenceIds ?? ["evidence-a"],
  ...(overrides.sourceLocator === undefined ? {} : { sourceLocator: overrides.sourceLocator }),
});

const makeSection = (overrides: Partial<ResumeSection> = {}): ResumeSection => ({
  sectionId: overrides.sectionId ?? "section-a",
  kind: overrides.kind ?? "experience",
  label: overrides.label ?? "Experience",
  order: overrides.order ?? 0,
  blocks: overrides.blocks ?? [makeBlock()],
});

const makeInput = (overrides: Partial<BuildResumeDocumentInput> = {}): BuildResumeDocumentInput => ({
  documentId: overrides.documentId ?? "resume-doc",
  profileId: overrides.profileId ?? "profile-a",
  source: overrides.source ?? { format: "markdown", fileName: "cv.md" },
  sections: overrides.sections ?? [makeSection()],
  evidences: overrides.evidences ?? [evidenceA, evidenceB],
});

const issueMessages = (result: ReturnType<typeof ResumeDocumentSchema.safeParse>): string[] =>
  result.success ? [] : result.error.issues.map((issue) => issue.message);

const issuePaths = (result: ReturnType<typeof ResumeDocumentSchema.safeParse>): string[] =>
  result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));

describe("Canonical resume document model", () => {
  it("builds a schema-valid resume document", () => {
    const document = buildResumeDocument(makeInput());

    expect(ResumeDocumentSchema.safeParse(document).success).toBe(true);
    expect(document.documentId).toBe("resume-doc");
    expect(document.profileId).toBe("profile-a");
  });

  it("rejects unknown document fields, including generatedAt", () => {
    const document = buildResumeDocument(makeInput());

    const result = ResumeDocumentSchema.safeParse({
      ...document,
      generatedAt: "2026-07-29T10:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects beforeText, afterText, rewrittenText and suggestedText in blocks", () => {
    const result = ResumeBlockSchema.safeParse({
      ...makeBlock(),
      beforeText: "before",
      afterText: "after",
      rewrittenText: "rewrite",
      suggestedText: "suggestion",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown source locator fields", () => {
    const result = ResumeSourceLocatorSchema.safeParse({
      kind: "line",
      value: "12",
      pageCoordinates: { x: 1, y: 2 },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown source fields", () => {
    const result = ResumeSourceSchema.safeParse({
      format: "markdown",
      parserVersion: "1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown section fields", () => {
    const result = ResumeSectionSchema.safeParse({
      ...makeSection(),
      layoutHint: "two-column",
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty documentId and profileId", () => {
    const emptyDocumentId = ResumeDocumentSchema.safeParse({
      documentId: "",
      profileId: "profile-a",
      source: { format: "markdown" },
      sections: [makeSection()],
    });
    const emptyProfileId = ResumeDocumentSchema.safeParse({
      documentId: "resume-doc",
      profileId: "",
      source: { format: "markdown" },
      sections: [makeSection()],
    });

    expect(emptyDocumentId.success).toBe(false);
    expect(emptyProfileId.success).toBe(false);
  });

  it("requires at least one section and at least one block per section", () => {
    const withoutSections = ResumeDocumentSchema.safeParse({
      documentId: "resume-doc",
      profileId: "profile-a",
      source: { format: "markdown" },
      sections: [],
    });
    const withoutBlocks = ResumeDocumentSchema.safeParse({
      documentId: "resume-doc",
      profileId: "profile-a",
      source: { format: "markdown" },
      sections: [{ sectionId: "section-a", kind: "experience", label: "Experience", order: 0, blocks: [] }],
    });

    expect(withoutSections.success).toBe(false);
    expect(withoutBlocks.success).toBe(false);
  });

  it("preserves originalText exactly, including spaces, tabs, newlines, Unicode, case and punctuation", () => {
    const originalText = "  Built  AI\tpipelines\nSIN cambiar café, résumé, Ñandú, punctuation?!  ";
    const document = buildResumeDocument(
      makeInput({
        sections: [makeSection({ blocks: [makeBlock({ originalText })] })],
      }),
    );

    expect(document.sections[0].blocks[0].originalText).toBe(originalText);
  });

  it("rejects empty or whitespace-only originalText", () => {
    expect(() =>
      buildResumeDocument(
        makeInput({
          sections: [makeSection({ blocks: [makeBlock({ originalText: "   \n\t" })] })],
        }),
      ),
    ).toThrow("RESUME_DOCUMENT_EMPTY_OR_WHITESPACE_ORIGINAL_TEXT");
  });

  it("sorts sections by order", () => {
    const document = buildResumeDocument(
      makeInput({
        sections: [
          makeSection({ sectionId: "section-b", order: 2, blocks: [makeBlock({ blockId: "block-b" })] }),
          makeSection({ sectionId: "section-a", order: 1, blocks: [makeBlock({ blockId: "block-a" })] }),
        ],
      }),
    );

    expect(document.sections.map((section) => section.sectionId)).toEqual(["section-a", "section-b"]);
  });

  it("sorts blocks by order within each section", () => {
    const document = buildResumeDocument(
      makeInput({
        sections: [
          makeSection({
            blocks: [
              makeBlock({ blockId: "block-b", order: 2 }),
              makeBlock({ blockId: "block-a", order: 1 }),
            ],
          }),
        ],
      }),
    );

    expect(document.sections[0].blocks.map((block) => block.blockId)).toEqual(["block-a", "block-b"]);
  });

  it("deduplicates and stably sorts evidenceIds", () => {
    const document = buildResumeDocument(
      makeInput({
        sections: [
          makeSection({
            blocks: [makeBlock({ evidenceIds: ["evidence-b", "evidence-a", "evidence-b"] })],
          }),
        ],
      }),
    );

    expect(document.sections[0].blocks[0].evidenceIds).toEqual(["evidence-a", "evidence-b"]);
  });

  it("rejects duplicate Evidence ids with an exact stable error code and does not mutate input", () => {
    const input = makeInput({
      evidences: [
        evidenceA,
        {
          ...evidenceB,
          id: "evidence-a",
          title: "Duplicate evidence id",
        },
      ],
    });
    const before = JSON.stringify(input);

    expect(() => buildResumeDocument(input)).toThrow(ResumeDocumentErrorCode.DuplicateEvidenceId);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("allows blocks without evidenceIds", () => {
    const document = buildResumeDocument(
      makeInput({
        sections: [makeSection({ blocks: [makeBlock({ evidenceIds: [] })] })],
      }),
    );

    expect(document.sections[0].blocks[0].evidenceIds).toEqual([]);
  });

  it("rejects unknown evidenceIds with a stable error code", () => {
    expect(() =>
      buildResumeDocument(
        makeInput({
          sections: [makeSection({ blocks: [makeBlock({ evidenceIds: ["missing-evidence"] })] })],
        }),
      ),
    ).toThrow(ResumeDocumentErrorCode.UnknownEvidenceId);
  });

  it("rejects duplicate sectionId with a stable error code", () => {
    expect(() =>
      buildResumeDocument(
        makeInput({
          sections: [
            makeSection({ sectionId: "section-a", order: 0 }),
            makeSection({ sectionId: "section-a", order: 1, blocks: [makeBlock({ blockId: "block-b" })] }),
          ],
        }),
      ),
    ).toThrow(ResumeDocumentErrorCode.DuplicateSectionId);
  });

  it("rejects duplicate blockId across the document with a stable error code", () => {
    expect(() =>
      buildResumeDocument(
        makeInput({
          sections: [
            makeSection({ sectionId: "section-a", order: 0, blocks: [makeBlock({ blockId: "block-a" })] }),
            makeSection({ sectionId: "section-b", order: 1, blocks: [makeBlock({ blockId: "block-a" })] }),
          ],
        }),
      ),
    ).toThrow(ResumeDocumentErrorCode.DuplicateBlockId);
  });

  it("rejects duplicate section order with a stable error code", () => {
    expect(() =>
      buildResumeDocument(
        makeInput({
          sections: [
            makeSection({ sectionId: "section-a", order: 0 }),
            makeSection({ sectionId: "section-b", order: 0, blocks: [makeBlock({ blockId: "block-b" })] }),
          ],
        }),
      ),
    ).toThrow(ResumeDocumentErrorCode.DuplicateSectionOrder);
  });

  it("rejects duplicate block order within a section with a stable error code", () => {
    expect(() =>
      buildResumeDocument(
        makeInput({
          sections: [
            makeSection({
              blocks: [
                makeBlock({ blockId: "block-a", order: 0 }),
                makeBlock({ blockId: "block-b", order: 0 }),
              ],
            }),
          ],
        }),
      ),
    ).toThrow(ResumeDocumentErrorCode.DuplicateBlockOrder);
  });

  it("ResumeDocumentSchema rejects duplicate sectionId directly", () => {
    const result = ResumeDocumentSchema.safeParse({
      documentId: "resume-doc",
      profileId: "profile-a",
      source: { format: "markdown" },
      sections: [
        makeSection({ sectionId: "section-a", order: 0 }),
        makeSection({ sectionId: "section-a", order: 1, blocks: [makeBlock({ blockId: "block-b" })] }),
      ],
    });

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(ResumeDocumentErrorCode.DuplicateSectionId);
    expect(issuePaths(result)).toContain("sections.1.sectionId");
  });

  it("ResumeDocumentSchema rejects duplicate blockId across sections directly", () => {
    const result = ResumeDocumentSchema.safeParse({
      documentId: "resume-doc",
      profileId: "profile-a",
      source: { format: "markdown" },
      sections: [
        makeSection({ sectionId: "section-a", order: 0, blocks: [makeBlock({ blockId: "block-a" })] }),
        makeSection({ sectionId: "section-b", order: 1, blocks: [makeBlock({ blockId: "block-a" })] }),
      ],
    });

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(ResumeDocumentErrorCode.DuplicateBlockId);
    expect(issuePaths(result)).toContain("sections.1.blocks.0.blockId");
  });

  it("ResumeDocumentSchema rejects duplicate section order directly", () => {
    const result = ResumeDocumentSchema.safeParse({
      documentId: "resume-doc",
      profileId: "profile-a",
      source: { format: "markdown" },
      sections: [
        makeSection({ sectionId: "section-a", order: 0 }),
        makeSection({ sectionId: "section-b", order: 0, blocks: [makeBlock({ blockId: "block-b" })] }),
      ],
    });

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(ResumeDocumentErrorCode.DuplicateSectionOrder);
    expect(issuePaths(result)).toContain("sections.1.order");
  });

  it("ResumeDocumentSchema rejects duplicate block order directly", () => {
    const result = ResumeDocumentSchema.safeParse({
      documentId: "resume-doc",
      profileId: "profile-a",
      source: { format: "markdown" },
      sections: [
        makeSection({
          blocks: [
            makeBlock({ blockId: "block-a", order: 0 }),
            makeBlock({ blockId: "block-b", order: 0 }),
          ],
        }),
      ],
    });

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(ResumeDocumentErrorCode.DuplicateBlockOrder);
    expect(issuePaths(result)).toContain("sections.0.blocks.1.order");
  });

  it("returns deepEqual results for identical inputs", () => {
    const input = makeInput();

    expect(buildResumeDocument(input)).toEqual(buildResumeDocument(input));
  });

  it("returns deepEqual results for semantically equivalent unordered inputs", () => {
    const first = makeInput({
      sections: [
        makeSection({
          sectionId: "section-b",
          order: 1,
          blocks: [makeBlock({ blockId: "block-b", order: 1, evidenceIds: ["evidence-b", "evidence-a"] })],
        }),
        makeSection({
          sectionId: "section-a",
          order: 0,
          blocks: [makeBlock({ blockId: "block-a", order: 0, evidenceIds: ["evidence-a"] })],
        }),
      ],
      evidences: [evidenceA, evidenceB],
    });
    const second = makeInput({
      sections: [
        makeSection({
          sectionId: "section-a",
          order: 0,
          blocks: [makeBlock({ blockId: "block-a", order: 0, evidenceIds: ["evidence-a"] })],
        }),
        makeSection({
          sectionId: "section-b",
          order: 1,
          blocks: [makeBlock({ blockId: "block-b", order: 1, evidenceIds: ["evidence-a", "evidence-b"] })],
        }),
      ],
      evidences: [evidenceB, evidenceA],
    });

    expect(buildResumeDocument(first)).toEqual(buildResumeDocument(second));
  });

  it("does not mutate nested input objects or arrays", () => {
    const input = makeInput({
      sections: [
        makeSection({
          blocks: [makeBlock({ evidenceIds: ["evidence-b", "evidence-a", "evidence-b"] })],
        }),
      ],
    });
    const before = JSON.stringify(input);

    buildResumeDocument(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(input.sections[0].blocks[0].evidenceIds).toEqual(["evidence-b", "evidence-a", "evidence-b"]);
  });

  it("returns a deeply frozen document", () => {
    const document = buildResumeDocument(makeInput());

    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.source)).toBe(true);
    expect(Object.isFrozen(document.sections)).toBe(true);
    expect(Object.isFrozen(document.sections[0])).toBe(true);
    expect(Object.isFrozen(document.sections[0].blocks)).toBe(true);
    expect(Object.isFrozen(document.sections[0].blocks[0])).toBe(true);
    expect(Object.isFrozen(document.sections[0].blocks[0].evidenceIds)).toBe(true);
  });

  it("deep freezes output sourceLocator without freezing or mutating the input sourceLocator", () => {
    const sourceLocator = { kind: "line", value: "12-14" };
    const input = makeInput({
      sections: [makeSection({ blocks: [makeBlock({ sourceLocator })] })],
    });

    const document = buildResumeDocument(input);
    const outputSourceLocator = document.sections[0].blocks[0].sourceLocator;

    expect(outputSourceLocator).toEqual(sourceLocator);
    expect(Object.isFrozen(outputSourceLocator)).toBe(true);

    expect(() => {
      Object.assign(outputSourceLocator as { kind: string; value: string }, { kind: "paragraph", value: "99" });
    }).toThrow();
    expect(document.sections[0].blocks[0].sourceLocator).toEqual({ kind: "line", value: "12-14" });
    expect(input.sections[0].blocks[0].sourceLocator).toEqual(sourceLocator);
    expect(Object.isFrozen(input.sections[0].blocks[0].sourceLocator)).toBe(false);
  });

  it("does not use Date, Date.now, Math.random, timestamps, or generated text fields", () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    const randomSpy = vi.spyOn(Math, "random");

    const document = buildResumeDocument(makeInput());
    const serialized = JSON.stringify(document);

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(serialized).not.toContain("generatedAt");
    expect(serialized).not.toContain("beforeText");
    expect(serialized).not.toContain("afterText");
    expect(serialized).not.toContain("rewrittenText");
    expect(serialized).not.toContain("suggestedText");

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it("keeps sourceLocator as simple source identification metadata", () => {
    const document = buildResumeDocument(
      makeInput({
        sections: [
          makeSection({
            blocks: [
              makeBlock({
                sourceLocator: { kind: "line", value: "12-14" },
              }),
            ],
          }),
        ],
      }),
    );

    expect(document.sections[0].blocks[0].sourceLocator).toEqual({ kind: "line", value: "12-14" });
  });
});
