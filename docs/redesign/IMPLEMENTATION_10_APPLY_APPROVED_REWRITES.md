# Implementation 10 - Apply Approved Rewrites

This increment applies explicitly approved rewrite selections to a new adapted resume domain representation.

It does not modify the original `ResumeDocument`, overwrite `ResumeBlock.originalText`, apply rejected or changes-requested decisions, generate text, call an LLM, export DOCX/PDF, persist versions, add timestamps, authenticate a reviewer, or modify UI.

## Purpose

Review approval and application are separate phases.

`RewriteReviewDecisionBatch` records explicit reviewer decisions and exposes `ApprovedRewriteSelection[]`. This increment consumes only those approved selections and materializes their text as `effectiveText` in a new `AdaptedResumeDocument`.

The relationship is:

```text
ResumeDocument
  + RewriteReviewDecisionBatch
  -> AdaptedResumeDocument
  + AppliedRewriteChange[]
```

`accepted` and `human_review` source validation statuses are not enough by themselves. A decision marked `approved` is also not applied directly unless it appears as an `ApprovedRewriteSelection`, which the review batch schema guarantees.

## Public Signature

```ts
export function applyApprovedRewrites(
  input: ApplyApprovedRewritesInput
): ApprovedRewriteApplicationResult
```

```ts
export type ApplyApprovedRewritesInput = {
  resumeDocument: ResumeDocument;
  reviewDecisionBatch: RewriteReviewDecisionBatch;
};
```

The function is pure and deterministic. It does not use `Date`, `Date.now`, `Math.random`, UUIDs, hashes, counters, network calls, provider SDKs, LLM calls, or locale-dependent comparison.

## Schemas

The public schemas live in `src/schemas/application.ts`:

- `ApplicationBlockStatusSchema`
- `AdaptedResumeDocumentIdSchema`
- `AdaptedResumeBlockSchema`
- `AdaptedResumeSectionSchema`
- `AdaptedResumeDocumentSchema`
- `AppliedRewriteChangeSchema`
- `ApprovedRewriteApplicationSummarySchema`
- `ApprovedRewriteApplicationResultSchema`

The module also exports canonical pure ID builders:

- `buildRewriteApplicationId`
- `buildAdaptedResumeDocumentId`
- `buildAppliedRewriteChangeId`

The builder and Zod refinements use these same helpers so the implementation and public contract cannot drift.

All object schemas are strict. Public TypeScript types are inferred from Zod with `z.infer`.

## Inputs

The builder validates:

- `resumeDocument` with `ResumeDocumentSchema`
- `reviewDecisionBatch` with `RewriteReviewDecisionBatchSchema`

Then it requires:

- `resumeDocument.profileId === reviewDecisionBatch.profileId`
- `resumeDocument.documentId === reviewDecisionBatch.documentId`
- every `approvedSelection.blockId` exists in exactly one resume block
- every `approvedSelection.originalText` exactly matches that block's `originalText`

Blocks are located only by `blockId`. Text content is never used to locate a block.

## Source Resume Structure

The source `ResumeDocument` currently contains:

- `documentId`
- `profileId`
- `source`
- `sections`

Each section contains:

- `sectionId`
- `kind`
- `label`
- `order`
- `blocks`

Each block contains:

- `blockId`
- `kind`
- `order`
- `originalText`
- `evidenceIds`
- optional `sourceLocator`

The adapted document preserves this structure and metadata.

## AdaptedResumeDocument

`AdaptedResumeDocument` contains:

- `documentId`
- `sourceDocumentId`
- `profileId`
- `source`
- `sections`

It preserves the exact section and block order from the source document. It does not add, remove, or reorder sections or blocks.

`documentId` is deterministic and distinct from `sourceDocumentId`:

```text
adapted-resume|application=<encoded applicationId>
```

`AdaptedResumeDocument.documentId` uses `AdaptedResumeDocumentIdSchema`, a lineage-specific schema that requires:

- a non-empty, non-whitespace string
- exact prefix `adapted-resume|application=`
- a non-empty encoded application component

The full relationship to `ApprovedRewriteApplicationResult.applicationId` is validated by `ApprovedRewriteApplicationResultSchema`.

IDs inherited from the source resume keep the source ID contract:

- `sourceDocumentId`: `IdSchema`
- `profileId`: `IdSchema`
- `sectionId`: `IdSchema`
- `blockId`: inherited from `ResumeBlockSchema`

The adapted document is a domain representation, not a DOCX, PDF, HTML export, or final styled resume file.

## originalText And effectiveText

`originalText` always remains the literal source block text.

`effectiveText` is the working text in the adapted representation:

- unchanged blocks: `effectiveText === originalText`
- rewritten blocks: `effectiveText === approvedText`
- approved unchanged blocks: `effectiveText === approvedText === originalText`

No text is trimmed, normalized, translated, corrected, reformulated, split, joined, or generated.

## Block Status

`ApplicationBlockStatusSchema` is exactly:

- `unchanged`
- `rewritten`
- `approved_unchanged`

Rules:

- `unchanged`: no approved selection, `effectiveText === originalText`, no `appliedSelectionId`
- `rewritten`: approved selection exists, `effectiveText === approvedText`, `effectiveText !== originalText`, `appliedSelectionId === selectionId`
- `approved_unchanged`: approved selection exists, `effectiveText === approvedText === originalText`, `appliedSelectionId === selectionId`

The comparison is exact string equality. `approved_unchanged` is not collapsed to `unchanged` because the explicit approval must remain traceable.

## AppliedRewriteChange

Each `ApprovedRewriteSelection` produces exactly one `AppliedRewriteChange`, even when the approved text equals the original text.

Fields:

- `changeId`
- `applicationId`
- `selectionId`
- `decisionId`
- `validationId`
- `candidateId`
- `requestId`
- `proposalId`
- `actionId`
- `resolutionId`
- `sectionId`
- `blockId`
- `beforeText`
- `afterText`
- `applicationStatus`
- `sourceValidationStatus`
- `sourceFindingCodes`
- `approvalRationale`

`sectionId` comes from the real section that contains the block. `beforeText` is the block `originalText`; `afterText` is the selection `approvedText`. `applicationStatus` is `rewritten` or `approved_unchanged`; it is never `unchanged`.

`sourceFindingCodes` is copied from `ApprovedRewriteSelection` and is not recalculated from candidate text or findings.

## Result Correspondence

`ApprovedRewriteApplicationResultSchema` validates:

- `applicationId` equals the canonical ID derived from `offerId`, `profileId`, `sourceDocumentId`, and all `change.selectionId` values
- `applicationId` for zero changes uses the canonical serialized selection set `[]`
- `adaptedDocument.documentId` equals the canonical adapted document ID derived from `applicationId`
- adapted document source/profile IDs match the result
- every `change.applicationId` matches result `applicationId`
- every `change.changeId` equals the canonical ID derived from result `applicationId`, `change.selectionId`, and `change.blockId`
- each selected block has exactly one change
- unchanged blocks have no change
- every change references an existing block
- change `sectionId` matches the section containing the block
- change `selectionId` matches block `appliedSelectionId`
- change `beforeText` matches block `originalText`
- change `afterText` matches block `effectiveText`
- change `applicationStatus` matches block `applicationStatus`
- rewritten changes have different before/after text
- approved_unchanged changes have identical before/after text
- no duplicate `changeId`, `selectionId`, or `blockId`
- changes are sorted by `changeId`
- no missing or extra changes exist

The schema checks relationships field by field, not only counts.

## IDs

`applicationId`:

```text
rewrite-application|offer=<...>|profile=<...>|source-document=<...>|selections=<...>
```

The `selections` component is:

```ts
encodeURIComponent(JSON.stringify(sortedSelectionIds))
```

`offer`, `profile`, and `source-document` are encoded with `encodeURIComponent`. `selectionIds` are copied, sorted with `<` / `>`, serialized with `JSON.stringify`, and then the full JSON string is encoded with `encodeURIComponent`. The input array is never sorted in place.

`AdaptedResumeDocument.documentId`:

```text
adapted-resume|application=<encoded applicationId>
```

`changeId`:

```text
applied-rewrite|application=<...>|selection=<...>|block=<...>
```

The final `changeId` prefix is `applied-rewrite`. All variable components use `encodeURIComponent`. IDs do not include `originalText`, `approvedText`, `effectiveText`, `beforeText`, `afterText`, `rationale`, or `approvalRationale`.

Changing the set of selection IDs changes `applicationId`. Reordering the same selection ID set does not change `applicationId`. The same input produces the same IDs.

## Ordering

- sections: exact source document order
- blocks: exact source document order
- changes: canonical order by `changeId`
- selection IDs used for `applicationId`: copied and sorted with `<` / `>`
- `sourceFindingCodes`: retained in the contractual order received

The module does not sort input arrays in place and does not use `localeCompare`.

## No Approvals

A valid review batch may contain zero `approvedSelections`.

In that case:

- the function succeeds
- the adapted document preserves the full source structure
- every block is `unchanged`
- every `effectiveText` equals `originalText`
- `changes` is empty
- approved-selection and rewrite counts are zero
- untouched block count equals total block count

The function still creates new adapted objects; it never returns the original `ResumeDocument` by reference.

## Runtime Errors

Stable errors:

- `REWRITE_APPLICATION_INPUT_INVALID_RESUME_DOCUMENT`
- `REWRITE_APPLICATION_INPUT_INVALID_REVIEW_BATCH`
- `REWRITE_APPLICATION_PROFILE_ID_MISMATCH`
- `REWRITE_APPLICATION_DOCUMENT_ID_MISMATCH`
- `REWRITE_APPLICATION_BLOCK_NOT_FOUND`
- `REWRITE_APPLICATION_SOURCE_TEXT_MISMATCH`

Validation order:

1. validate `ResumeDocument`
2. validate `RewriteReviewDecisionBatch`
3. compare `profileId`
4. compare `documentId`
5. index blocks by `blockId`
6. verify selected block existence
7. verify exact source text
8. build adapted document and changes
9. validate output with `ApprovedRewriteApplicationResultSchema`

Invalid duplicate block IDs in a runtime resume document are handled by the source `ResumeDocumentSchema` and become `REWRITE_APPLICATION_INPUT_INVALID_RESUME_DOCUMENT`.

## Summary

`ApprovedRewriteApplicationSummary` contains:

- `totalSections`
- `totalBlocks`
- `totalApprovedSelections`
- `rewrittenBlocks`
- `approvedUnchangedBlocks`
- `untouchedBlocks`
- `totalChanges`

All fields are non-negative integers. The result schema rejects incoherent summaries.

## Immutability

The output is deeply frozen:

- result
- adapted document
- adapted document `source`
- sections
- blocks
- inherited block arrays and objects
- block `sourceLocator`
- block `evidenceIds`
- changes
- change `sourceFindingCodes`
- summary

Inputs are not frozen or modified. Mutable structures from `ResumeDocument`, `ApprovedRewriteSelection`, adapted blocks, and changes are copied rather than shared.

## Valid JSON Example

```json
{
  "applicationId": "rewrite-application|offer=offer-1|profile=profile-1|source-document=resume-doc|selections=%5B%22selection-a%22%5D",
  "offerId": "offer-1",
  "profileId": "profile-1",
  "sourceDocumentId": "resume-doc",
  "applicationScope": "approved_rewrites_only",
  "adaptedDocument": {
    "documentId": "adapted-resume|application=rewrite-application%7Coffer%3Doffer-1%7Cprofile%3Dprofile-1%7Csource-document%3Dresume-doc%7Cselections%3D%255B%2522selection-a%2522%255D",
    "sourceDocumentId": "resume-doc",
    "profileId": "profile-1",
    "source": {
      "format": "markdown",
      "fileName": "cv.md"
    },
    "sections": [
      {
        "sectionId": "section-a",
        "kind": "experience",
        "label": "Experience",
        "order": 0,
        "blocks": [
          {
            "blockId": "block-a",
            "kind": "bullet",
            "order": 0,
            "originalText": "Built deterministic automation.",
            "evidenceIds": ["evidence-a"],
            "effectiveText": "Built deterministic automation for review workflows.",
            "applicationStatus": "rewritten",
            "appliedSelectionId": "selection-a"
          }
        ]
      }
    ]
  },
  "changes": [
    {
      "changeId": "applied-rewrite|application=rewrite-application%7Coffer%3Doffer-1%7Cprofile%3Dprofile-1%7Csource-document%3Dresume-doc%7Cselections%3D%255B%2522selection-a%2522%255D|selection=selection-a|block=block-a",
      "applicationId": "rewrite-application|offer=offer-1|profile=profile-1|source-document=resume-doc|selections=%5B%22selection-a%22%5D",
      "selectionId": "selection-a",
      "decisionId": "decision-a",
      "validationId": "validation-a",
      "candidateId": "candidate-a",
      "requestId": "request-a",
      "proposalId": "proposal-a",
      "actionId": "action-a",
      "resolutionId": "resolution-a",
      "sectionId": "section-a",
      "blockId": "block-a",
      "beforeText": "Built deterministic automation.",
      "afterText": "Built deterministic automation for review workflows.",
      "applicationStatus": "rewritten",
      "sourceValidationStatus": "accepted",
      "sourceFindingCodes": [],
      "approvalRationale": "Reviewer approved this rewrite."
    }
  ],
  "summary": {
    "totalSections": 1,
    "totalBlocks": 1,
    "totalApprovedSelections": 1,
    "rewrittenBlocks": 1,
    "approvedUnchangedBlocks": 0,
    "untouchedBlocks": 0,
    "totalChanges": 1
  }
}
```

The example validates with `ApprovedRewriteApplicationResultSchema`. Production IDs are generated by `applyApprovedRewrites` using the same canonical helpers that the schema uses for validation.

## Limitations

This module does not:

- generate or correct text
- authenticate a reviewer
- persist application versions
- add timestamps
- export DOCX, PDF, HTML, or styled documents
- preserve visual styles from files
- call providers or LLMs
- modify UI or dashboard state
- recalculate matching, scoring, tailoring plans, targeting, proposals, generation requests, candidate validation, reviewer decisions, findings, or source status

`AdaptedResumeDocument` is a deterministic domain representation for later phases, not a final document file.
