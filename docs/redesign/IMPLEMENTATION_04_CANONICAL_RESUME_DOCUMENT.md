# Implementation 04 - Canonical Resume Document

This increment adds the canonical, immutable representation of an original CV or resume.

It does not implement CV rewriting, template rendering, DOCX/PDF reconstruction, storage, matching, scoring, or tailoring actions linked to resume blocks.

## Purpose

`ResumeDocument` is the source-preserving document model used by later CV Tailoring Agent increments. It represents the original CV as ordered sections and ordered blocks while preserving each block's text exactly as it was received.

The model is deliberately separate from:

- `Profile`: semantic candidate data.
- `Evidence`: structured claims that can support decisions.
- `Offer` and `Requirement`: job-side data.
- `JobMatchResult` and `ScoringResult`: matching and scoring outputs.
- `TailoringPlan`: future edit intent, not applied text.

## Public Signature

```ts
export function buildResumeDocument(input: BuildResumeDocumentInput): ResumeDocument;
```

`BuildResumeDocumentInput` contains only:

- `documentId`
- `profileId`
- `source`
- `sections`
- `evidences`

The function is pure and deterministic. It does not use `Date`, `Date.now`, `Math.random`, UUIDs, network calls, LLM calls, mutable counters, or global mutable state.

## Schemas

The public schemas live in `src/schemas/resume.ts` and are strict:

- `ResumeSourceFormatSchema`
- `ResumeSourceSchema`
- `ResumeSourceLocatorSchema`
- `ResumeSectionKindSchema`
- `ResumeBlockKindSchema`
- `ResumeBlockSchema`
- `ResumeSectionSchema`
- `ResumeDocumentSchema`

Public TypeScript types are inferred from Zod with `z.infer`; they are not duplicated manually.

## Structure

```ts
type ResumeDocument = {
  documentId: string;
  profileId: string;
  source: ResumeSource;
  sections: ResumeSection[];
};
```

`ResumeSource.format` can be:

- `plain_text`
- `markdown`
- `docx`
- `pdf`
- `unknown`

`ResumeSection.kind` can be:

- `header`
- `summary`
- `experience`
- `education`
- `projects`
- `skills`
- `certifications`
- `languages`
- `publications`
- `volunteering`
- `other`

`ResumeBlock.kind` can be:

- `heading`
- `paragraph`
- `bullet`
- `entry`
- `key_value`
- `other`

`sourceLocator` is intentionally simple: `{ kind, value }`. It can identify the source location later, but it does not model PDF coordinates, DOCX styles, layout geometry, or template details.

## Invariants

`ResumeDocumentSchema` validates the document structure:

- A document has at least one section.
- Every section has at least one block.
- `sectionId` is unique per document.
- `blockId` is unique across the whole document.
- Section `order` is unique per document.
- Block `order` is unique within its section.
- `originalText` must be non-empty and cannot be whitespace only.
- Unknown fields are rejected at the document, source, section, block, and source locator levels.

`buildResumeDocument` canonicalizes and validates the relationship with `Evidence[]`:

- `originalText` is preserved exactly; it is not trimmed, normalized, lowercased, rewritten, or reformatted.
- `evidenceIds` may be empty.
- Non-empty `evidenceIds` are deduplicated and sorted stably.
- Every `evidenceId` must exist in the provided `Evidence[]`.
- Unknown evidence IDs throw a stable error.
- Duplicate IDs in `Evidence[]` throw a stable error.
- Returned sections are sorted by `order`.
- Returned blocks are sorted by `order`.
- The result is independent of the input order of sections, blocks, and evidence records.
- Inputs are not mutated.
- The returned document is deeply frozen.

The output contains no temporal metadata and no generated CV text fields. In particular, it does not contain `generatedAt`, `beforeText`, `afterText`, `rewrittenText`, or `suggestedText`.

## Stable Errors

The builder throws these stable error codes for canonical invariants:

- `RESUME_DOCUMENT_DUPLICATE_SECTION_ID`
- `RESUME_DOCUMENT_DUPLICATE_BLOCK_ID`
- `RESUME_DOCUMENT_DUPLICATE_SECTION_ORDER`
- `RESUME_DOCUMENT_DUPLICATE_BLOCK_ORDER`
- `RESUME_DOCUMENT_DUPLICATE_EVIDENCE_ID`
- `RESUME_DOCUMENT_UNKNOWN_EVIDENCE_ID`

Zod validation errors are used for schema-level validation such as empty arrays, invalid IDs, unknown fields, or whitespace-only `originalText`.

## Valid JSON Example

```json
{
  "documentId": "resume-doc",
  "profileId": "profile-a",
  "source": {
    "format": "markdown",
    "fileName": "cv.md"
  },
  "sections": [
    {
      "sectionId": "section-summary",
      "kind": "summary",
      "label": "Summary",
      "order": 0,
      "blocks": [
        {
          "blockId": "block-summary-1",
          "kind": "paragraph",
          "order": 0,
          "originalText": "Applied AI engineer focused on deterministic automation.",
          "evidenceIds": ["evidence-ai-automation"],
          "sourceLocator": {
            "kind": "line",
            "value": "3"
          }
        }
      ]
    }
  ]
}
```

The example validates structurally with `ResumeDocumentSchema`. Use `buildResumeDocument` to verify that `evidence-ai-automation` exists in the provided `Evidence[]` and that the evidence list itself has no duplicate IDs.

## Out Of Scope

This increment does not:

- Parse raw CV files.
- Read DOCX, PDF, or Markdown from disk.
- Reconstruct DOCX/PDF output.
- Preserve visual styles, layout, PDF coordinates, DOCX runs, fonts, or template formatting.
- Generate rewritten CV content.
- Add `beforeText`, `afterText`, or suggestions.
- Link `TailoringAction` to `ResumeBlock`.
- Recalculate matching or scoring.
- Persist documents.
- Add UI or dashboard behavior.

Future increments can use this document model as the immutable original input for template-aware reconstruction and human-reviewed tailoring workflows.
