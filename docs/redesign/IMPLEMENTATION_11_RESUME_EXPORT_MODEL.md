# Implementation 11 - Resume Export Model

This increment builds a deterministic structured content model for a future DOCX renderer.

It does not create DOCX, PDF, or HTML files. It does not use templates, visual styles, storage, timestamps, provider SDKs, network calls, LLM calls, or UI state. It does not generate, correct, translate, normalize, or rewrite text.

## Purpose

`ResumeExportModel` is the bridge between the approved adapted resume domain model and a future renderer.

The relationship is:

```text
ApprovedRewriteApplicationResult
  -> AdaptedResumeDocument
  -> ResumeExportModel
  -> future DOCX renderer
```

`AdaptedResumeDocument` remains the domain document that records approved effective text. `ResumeExportModel` is a renderer-ready content representation. It is not a file, not a template application, and not a styled document.

## Public Signature

```ts
export function buildResumeExportModel(
  input: BuildResumeExportModelInput
): ResumeExportModel
```

```ts
export type BuildResumeExportModelInput = {
  applicationResult: ApprovedRewriteApplicationResult;
};
```

The function is pure and deterministic. It validates `applicationResult` with `ApprovedRewriteApplicationResultSchema` and throws the stable error `RESUME_EXPORT_INPUT_INVALID_APPLICATION_RESULT` when the input is invalid.

## Input Source

The only content source is:

```ts
applicationResult.adaptedDocument
```

The builder also reads minimal traceability from:

- `applicationResult.applicationId`
- `applicationResult.offerId`
- `applicationResult.profileId`
- `applicationResult.sourceDocumentId`
- `applicationResult.changes`

It does not read the original `ResumeDocument`, review batches, candidate submissions, generation requests, global `Evidence[]`, matching, scoring, tailoring, targeting, proposals, external data, or network resources.

## Schemas

The public schemas live in `src/schemas/export.ts`:

- `ResumeExportScopeSchema`
- `ResumeExportTextSourceSchema`
- `ResumeExportModelIdSchema`
- `ResumeExportSectionIdSchema`
- `ResumeExportBlockIdSchema`
- `ResumeExportBlockSchema`
- `ResumeExportSectionSchema`
- `ResumeExportSummarySchema`
- `ResumeExportModelSchema`

All object schemas are strict. Public TypeScript types are inferred from Zod with `z.infer`.

`evidenceIds` in export blocks reuses the exact `ResumeBlockSchema` field contract: an ordered array of `IdSchema` values. The export model does not deduplicate, sort, normalize, or reinterpret evidence references.

## Model Structure

`ResumeExportModel` contains:

- `exportModelId`
- `applicationId`
- `offerId`
- `profileId`
- `sourceDocumentId`
- `adaptedDocumentId`
- `exportScope`
- `source`
- `sections`
- `summary`

`exportScope` is exactly:

```text
structured_content_for_future_docx_rendering
```

Each `ResumeExportSection` contains:

- `exportSectionId`
- `sectionId`
- `kind`
- `label`
- `order`
- `blocks`

Each `ResumeExportBlock` contains:

- `exportBlockId`
- `sectionId`
- `blockId`
- `kind`
- `order`
- `originalText`
- `effectiveText`
- `renderText`
- `applicationStatus`
- `textSource`
- `evidenceIds`
- optional `sourceLocator`
- optional `appliedSelectionId`
- optional `appliedChangeId`

The export model excludes approval rationale, review rationale, findings, candidate IDs, validation IDs, request IDs, proposal IDs, action IDs, resolution IDs, reviewer identity, provider/model/prompt data, files, templates, styles, and timestamps. It contains only content and minimal render traceability.

## Text Contract

`originalText` is preserved for traceability.

`effectiveText` is the applied content from the adapted document.

`renderText` is the only text a future renderer should consume.

The invariant is:

```text
renderText === effectiveText
```

The builder copies `renderText` from `effectiveText`; it never reconstructs it from `originalText`, `approvedText`, or changes.

All text is preserved literally, including leading/trailing spaces, repeated spaces, tabs, line breaks, Unicode, accents, case, and punctuation.

The `renderText === effectiveText` check is exact string equality. Differences in spaces, tabs, line breaks, Unicode, accents, case, or punctuation are not equivalent.

## Text Source

`ResumeExportTextSourceSchema` is exactly:

- `source_original`
- `approved_selection`

Rules:

- `unchanged`: `textSource === source_original`, `originalText === effectiveText === renderText`, no applied IDs.
- `rewritten`: `textSource === approved_selection`, `originalText !== effectiveText`, `renderText === effectiveText`, both applied IDs present.
- `approved_unchanged`: `textSource === approved_selection`, `originalText === effectiveText === renderText`, both applied IDs present.

`approved_unchanged` uses `approved_selection` because textual identity does not remove explicit approval traceability.

## Structure Preservation

The builder preserves exactly:

- section count
- section order
- block count
- block order inside each section
- section IDs, kind, label, and order
- block IDs, kind, and order
- `source`
- `sourceLocator`
- `evidenceIds`

Sections and blocks are traversed in `applicationResult.adaptedDocument.sections` order. They are not sorted by ID and are not added or removed.

`evidenceIds` is preserved as an array, not treated as a set. If a valid adapted block contains repeated evidence IDs, the repeated IDs and their order are preserved literally. The export phase is a faithful projection and does not silently strengthen the adapted document contract.

## Minimal Traceability

For selected blocks, the export model keeps only:

- `appliedSelectionId`
- `appliedChangeId`

`appliedChangeId` is copied from the corresponding `AppliedRewriteChange.changeId`. The builder looks up changes by `blockId`, never by text.

Detailed audit data remains in `ApprovedRewriteApplicationResult`.

## Deterministic IDs

The module exports pure canonical helpers:

- `buildResumeExportModelId`
- `buildResumeExportSectionId`
- `buildResumeExportBlockId`

Formulas:

```text
resume-export-model|application=<encoded applicationId>|adapted-document=<encoded adaptedDocumentId>
resume-export-section|export-model=<encoded exportModelId>|section=<encoded sectionId>
resume-export-block|export-model=<encoded exportModelId>|section=<encoded sectionId>|block=<encoded blockId>
```

All variable components use `encodeURIComponent`.

IDs do not include text, rationale, source, sourceLocator, evidenceIds, timestamps, hashes, counters, UUIDs, or indexes.

The schema recalculates lineage:

- `applicationId` with `buildRewriteApplicationId`
- `adaptedDocumentId` with `buildAdaptedResumeDocumentId`
- `exportModelId` with `buildResumeExportModelId`
- `exportSectionId` with `buildResumeExportSectionId`
- `exportBlockId` with `buildResumeExportBlockId`
- `appliedChangeId` with `buildAppliedRewriteChangeId`

The zero-selection case uses the canonical serialized selection list `[]`.

IDs and summary counts are validated directly by Zod refinements in `ResumeExportModelSchema`.

## ID Contracts

Source IDs reuse the source contract:

- `profileId`: `IdSchema`
- `sourceDocumentId`: `IdSchema`
- `sectionId`: `IdSchema`
- `blockId`: `IdSchema`

Lineage IDs use dedicated schemas:

- `ResumeExportModelIdSchema`
- `ResumeExportSectionIdSchema`
- `ResumeExportBlockIdSchema`

Each lineage ID schema requires a non-empty, non-whitespace string, the exact prefix, and non-empty required components. Full data correspondence is checked by `ResumeExportModelSchema`.

## Summary

`ResumeExportSummary` contains:

- `totalSections`
- `totalBlocks`
- `renderedFromOriginal`
- `renderedFromApprovedSelection`
- `rewrittenBlocks`
- `approvedUnchangedBlocks`
- `totalAppliedChangeReferences`

All counts are non-negative integers. `ResumeExportModelSchema` rejects incoherent summaries.

## No Approvals

When the application result has no approved selections:

- the export model is valid
- all sections and blocks are copied
- all blocks are `unchanged`
- all `renderText` values match `originalText` and `effectiveText`
- all `textSource` values are `source_original`
- no applied IDs are present
- approved-selection counts are zero
- an export model ID is still deterministic

## Immutability

The output is deeply frozen:

- root model
- source
- sections
- each section
- blocks
- each block
- evidenceIds
- sourceLocator
- summary

Inputs are not frozen or modified. The output does not share mutable `source`, `sections`, `blocks`, `evidenceIds`, or `sourceLocator` references with the input.

## Valid JSON Example

```json
{
  "exportModelId": "resume-export-model|application=rewrite-application%7Coffer%3Doffer-1%7Cprofile%3Dprofile-1%7Csource-document%3Dresume-doc%7Cselections%3D%255B%2522selection-a%2522%255D|adapted-document=adapted-resume%7Capplication%3Drewrite-application%257Coffer%253Doffer-1%257Cprofile%253Dprofile-1%257Csource-document%253Dresume-doc%257Cselections%253D%25255B%252522selection-a%252522%25255D",
  "applicationId": "rewrite-application|offer=offer-1|profile=profile-1|source-document=resume-doc|selections=%5B%22selection-a%22%5D",
  "offerId": "offer-1",
  "profileId": "profile-1",
  "sourceDocumentId": "resume-doc",
  "adaptedDocumentId": "adapted-resume|application=rewrite-application%7Coffer%3Doffer-1%7Cprofile%3Dprofile-1%7Csource-document%3Dresume-doc%7Cselections%3D%255B%2522selection-a%2522%255D",
  "exportScope": "structured_content_for_future_docx_rendering",
  "source": {
    "format": "markdown",
    "fileName": "cv.md"
  },
  "sections": [
    {
      "exportSectionId": "resume-export-section|export-model=resume-export-model%7Capplication%3Drewrite-application%257Coffer%253Doffer-1%257Cprofile%253Dprofile-1%257Csource-document%253Dresume-doc%257Cselections%253D%25255B%252522selection-a%252522%25255D%7Cadapted-document%3Dadapted-resume%257Capplication%253Drewrite-application%25257Coffer%25253Doffer-1%25257Cprofile%25253Dprofile-1%25257Csource-document%25253Dresume-doc%25257Cselections%25253D%2525255B%25252522selection-a%25252522%2525255D|section=section-a",
      "sectionId": "section-a",
      "kind": "experience",
      "label": "Experience",
      "order": 0,
      "blocks": [
        {
          "exportBlockId": "resume-export-block|export-model=resume-export-model%7Capplication%3Drewrite-application%257Coffer%253Doffer-1%257Cprofile%253Dprofile-1%257Csource-document%253Dresume-doc%257Cselections%253D%25255B%252522selection-a%252522%25255D%7Cadapted-document%3Dadapted-resume%257Capplication%253Drewrite-application%25257Coffer%25253Doffer-1%25257Cprofile%25253Dprofile-1%25257Csource-document%25253Dresume-doc%25257Cselections%25253D%2525255B%25252522selection-a%25252522%2525255D|section=section-a|block=block-a",
          "sectionId": "section-a",
          "blockId": "block-a",
          "kind": "bullet",
          "order": 0,
          "originalText": "Built deterministic automation.",
          "effectiveText": "Built deterministic automation for review workflows.",
          "renderText": "Built deterministic automation for review workflows.",
          "applicationStatus": "rewritten",
          "textSource": "approved_selection",
          "evidenceIds": ["evidence-a"],
          "appliedSelectionId": "selection-a",
          "appliedChangeId": "applied-rewrite|application=rewrite-application%7Coffer%3Doffer-1%7Cprofile%3Dprofile-1%7Csource-document%3Dresume-doc%7Cselections%3D%255B%2522selection-a%2522%255D|selection=selection-a|block=block-a"
        }
      ]
    }
  ],
  "summary": {
    "totalSections": 1,
    "totalBlocks": 1,
    "renderedFromOriginal": 0,
    "renderedFromApprovedSelection": 1,
    "rewrittenBlocks": 1,
    "approvedUnchangedBlocks": 0,
    "totalAppliedChangeReferences": 1
  }
}
```

The example validates with `ResumeExportModelSchema`.

## Limitations

This increment does not:

- create DOCX, PDF, or HTML files
- preserve visual styles
- use a template
- write output paths or buffers
- persist versions
- add timestamps
- call providers or LLMs
- modify the adapted document
- recalculate previous phases
- generate, correct, or rewrite text
- modify UI or dashboard state

A future renderer should consume `renderText` and can layer file generation, visual styling, and template behavior outside this deterministic core model.
