# Implementation 09 - Rewrite Review Decisions

This increment receives explicit external review decisions for validated rewrite candidates and builds structured selections only for approved candidates.

It does not call an LLM, generate text, modify `candidateText`, apply changes to `ResumeDocument`, create DOCX/PDF, persist records, identify a reviewer, authenticate a reviewer, add timestamps, or recalculate candidate validation.

## Purpose

Candidate validation and reviewer decision are separate gates.

`RewriteCandidateValidationBatch` says whether a submitted rewrite candidate passed deterministic surface checks. A source status of `accepted` is not human approval and does not allow automatic application.

The relationship is:

```text
RewriteCandidateValidationBatch
  -> RewriteReviewerDecisionSubmission[]
  -> RewriteReviewDecisionBatch
  -> ApprovedRewriteSelection[]
```

Every final decision must come from an external `RewriteReviewerDecisionSubmission`.

## Public Signature

```ts
export function buildRewriteReviewDecisions(
  input: BuildRewriteReviewDecisionsInput
): RewriteReviewDecisionBatch
```

```ts
export type BuildRewriteReviewDecisionsInput = {
  validationBatch: RewriteCandidateValidationBatch;
  decisions: RewriteReviewerDecisionSubmission[];
};
```

The function is pure and deterministic. It does not use `Date`, `Date.now`, `Math.random`, UUIDs, hashes, counters, network calls, provider SDKs, LLM calls, or locale-dependent comparison.

## Schemas

The public schemas live in `src/schemas/review.ts`:

- `RewriteReviewerDecisionTypeSchema`
- `RewriteReviewerDecisionSubmissionSchema`
- `RewriteReviewerDecisionResultSchema`
- `ApprovedRewriteSelectionSchema`
- `RewriteReviewDecisionSummarySchema`
- `RewriteReviewDecisionBatchSchema`

All object schemas are strict. Public TypeScript types are inferred from Zod with `z.infer`.

## Submission Contract

`RewriteReviewerDecisionSubmission` contains only:

- `validationId`
- `decision`
- `rationale`

`decision` is exactly one of:

- `approved`
- `rejected`
- `changes_requested`

`validationId` and `rationale` must be non-whitespace strings. `rationale` is mandatory for every decision type and is copied literally. `trim` is used only to reject whitespace-only values.

The submission rejects data already present in the validation result, including `candidateId`, `requestId`, `proposalId`, `actionId`, `resolutionId`, `blockId`, `originalText`, `candidateText`, `validationStatus`, `findings`, `findingCodes`, `offerId`, `profileId`, and `documentId`.

It also rejects reviewer identity, timestamps, provider configuration, model metadata, prompts, scores, confidence, and all unknown fields.

## One Decision Per Result

Every `RewriteCandidateValidationResult` must have exactly one external decision submission.

Rules:

- duplicate submission `validationId` values are rejected
- unknown submission `validationId` values are rejected
- missing decisions are rejected
- no submission is ignored
- an empty validation batch with empty decisions is valid
- submission order does not affect output

`RewriteCandidateValidationBatchSchema` is validated before use. The previous validation schema already requires canonical ordering of `results`; this module does not silently reorder an invalid validation batch before validating it.

## Eligibility Matrix

Reviewer decisions do not replace deterministic error barriers.

| Source validation status | approved | rejected | changes_requested |
| --- | --- | --- | --- |
| `accepted` | allowed | allowed | allowed |
| `human_review` | allowed | allowed | allowed |
| `rejected` | prohibited | allowed | allowed |

Approving a rejected source result throws:

```text
REVIEW_DECISION_APPROVAL_NOT_ALLOWED_FOR_REJECTED
```

The module never converts statuses automatically:

- `accepted` is not converted to `approved`
- `human_review` is not converted to `changes_requested`
- `rejected` is not converted to `rejected`

`human_review` may be explicitly approved because a human reviewer can consciously accept review findings. `rejected` cannot be approved here because it contains at least one unresolved deterministic error.

## Review Scope

Every batch has:

```json
{
  "reviewScope": "explicit_reviewer_decisions_only"
}
```

The scope means the module records explicit decisions only. It does not authenticate who made the decision.

## Decision Results

`RewriteReviewerDecisionResult` contains:

- `decisionId`
- `validationId`
- `candidateId`
- `requestId`
- `proposalId`
- `actionId`
- `resolutionId`
- `blockId`
- `originalText`
- `candidateText`
- `sourceValidationStatus`
- `sourceFindingCodes`
- `decision`
- `rationale`

Only `validationId`, `decision`, and `rationale` come from the external submission. All other fields are copied from the matching `RewriteCandidateValidationResult`.

`sourceFindingCodes` is copied from the source result's `findings`, deduplicated, and sorted with stable `<` / `>` comparison. Findings are not recalculated.

## Source Status And Finding Codes

The public schemas enforce:

- `accepted`: `sourceFindingCodes` must be exactly empty
- `human_review`: `sourceFindingCodes` must be non-empty and contain only review finding codes
- `rejected`: `sourceFindingCodes` must contain at least one error finding code and may also contain review codes

`sourceFindingCodes` must be unique and sorted canonically with `<` / `>`. The module does not use `localeCompare`.

## Approved Selections

Only `decision === "approved"` creates an `ApprovedRewriteSelection`.

`rejected` and `changes_requested` never create selections.

`ApprovedRewriteSelection` contains:

- `selectionId`
- `decisionId`
- `validationId`
- `candidateId`
- `requestId`
- `proposalId`
- `actionId`
- `resolutionId`
- `blockId`
- `originalText`
- `approvedText`
- `sourceValidationStatus`
- `sourceFindingCodes`
- `approvalRationale`
- `approvalScope`

`approvedText` is copied exactly from `candidateText`. `approvalRationale` is copied exactly from `rationale`.

`approvalScope` is exactly:

```text
approved_for_future_application_only
```

An approved selection means only:

- an explicit external `approved` decision exists
- the source validation status was not `rejected`
- the text is available for a future application phase

It does not mean `ResumeDocument` has been modified.

## Block Conflicts

Two approved selections for the same `blockId` are prohibited within one batch.

If more than one approved decision would select the same block, the builder throws:

```text
REVIEW_DECISION_MULTIPLE_APPROVALS_FOR_BLOCK
```

Valid combinations for the same `blockId`:

- one `approved` and one `rejected`
- one `approved` and one `changes_requested`
- two non-approved decisions

The module never selects a winner by order, index, priority, or any arbitrary rule.

## Decision-Selection Correspondence

`RewriteReviewDecisionBatchSchema` enforces the full relationship:

- each approved decision has exactly one selection
- rejected and changes_requested decisions have no selection
- each selection references an existing approved decision
- no extra selections exist
- IDs match between decision and selection
- selection `originalText` matches decision `originalText`
- selection `approvedText` matches decision `candidateText`
- selection `approvalRationale` matches decision `rationale`
- source status and finding codes match
- approved selections have no duplicate `blockId`
- approved selections are sorted canonically

The schema checks more than counts; it validates field-by-field correspondence.

## Deterministic IDs

`decisionId`:

```text
review-decision|offer=<...>|profile=<...>|document=<...>|validation=<...>|decision=<...>
```

`selectionId`:

```text
approved-rewrite|offer=<...>|profile=<...>|document=<...>|decision=<...>|block=<...>
```

The `decision` component inside `selectionId` is the full `decisionId` encoded with `encodeURIComponent`.

All variable ID components are encoded with `encodeURIComponent`. IDs do not include `rationale`, `originalText`, or `candidateText`.

Changing the decision for the same `validationId` changes `decisionId`. Changing rationale or candidate text does not.

## Deterministic Order

Output order is canonical:

- `decisions` sorted by `decisionId`
- `approvedSelections` sorted by `selectionId`
- `sourceFindingCodes` sorted by stable string comparison

Input arrays are copied before sorting. The function does not sort input arrays in place.

## Runtime Validation

Validation order:

1. validate `validationBatch` with `RewriteCandidateValidationBatchSchema`
2. validate every decision submission with `RewriteReviewerDecisionSubmissionSchema`
3. reject duplicate submission `validationId`
4. reject unknown submission `validationId`
5. reject missing decisions
6. reject approval of rejected source results
7. reject multiple approvals for the same `blockId`
8. build decision results and approved selections
9. validate the output with `RewriteReviewDecisionBatchSchema`

Stable input errors:

- `REVIEW_DECISION_INPUT_INVALID_VALIDATION_BATCH`
- `REVIEW_DECISION_INPUT_INVALID_DECISION`
- `REVIEW_DECISION_INPUT_DUPLICATE_VALIDATION_ID`
- `REVIEW_DECISION_INPUT_UNKNOWN_VALIDATION_ID`
- `REVIEW_DECISION_INPUT_MISSING_DECISION`
- `REVIEW_DECISION_APPROVAL_NOT_ALLOWED_FOR_REJECTED`
- `REVIEW_DECISION_MULTIPLE_APPROVALS_FOR_BLOCK`

## Summary

`RewriteReviewDecisionSummary` contains non-negative integers:

- `totalValidationResults`
- `totalDecisions`
- `approved`
- `rejected`
- `changesRequested`
- `approvedSelections`
- `approvalsFromAccepted`
- `approvalsFromHumanReview`

The batch schema rejects incoherent summaries.

## Literal Preservation

The module preserves exactly:

- `originalText`
- `candidateText`
- `approvedText`
- `rationale`
- `approvalRationale`

This includes leading and trailing spaces, repeated spaces, tabs, line breaks, Unicode, accents, uppercase/lowercase, and punctuation.

No `trim`, `replace`, `normalize`, translation, correction, or rewrite is used to construct output text.

## Immutability

The returned batch is deeply frozen:

- root batch
- `decisions`
- each decision
- decision `sourceFindingCodes`
- `approvedSelections`
- each selection
- selection `sourceFindingCodes`
- `summary`

Inputs are not frozen or modified. Deeply frozen inputs are accepted.

Decision and selection `sourceFindingCodes` are independent arrays before the output is frozen.

## Valid JSON Example

```json
{
  "offerId": "offer-1",
  "profileId": "profile-1",
  "documentId": "resume-doc",
  "reviewScope": "explicit_reviewer_decisions_only",
  "decisions": [
    {
      "decisionId": "review-decision|offer=offer-1|profile=profile-1|document=resume-doc|validation=validation-a|decision=approved",
      "validationId": "validation-a",
      "candidateId": "candidate-a",
      "requestId": "request-a",
      "proposalId": "proposal-a",
      "actionId": "action-a",
      "resolutionId": "resolution-a",
      "blockId": "block-a",
      "originalText": "original text",
      "candidateText": "candidate text",
      "sourceValidationStatus": "accepted",
      "sourceFindingCodes": [],
      "decision": "approved",
      "rationale": "Reviewer explicitly approved this candidate."
    }
  ],
  "approvedSelections": [
    {
      "selectionId": "approved-rewrite|offer=offer-1|profile=profile-1|document=resume-doc|decision=review-decision%7Coffer%3Doffer-1%7Cprofile%3Dprofile-1%7Cdocument%3Dresume-doc%7Cvalidation%3Dvalidation-a%7Cdecision%3Dapproved|block=block-a",
      "decisionId": "review-decision|offer=offer-1|profile=profile-1|document=resume-doc|validation=validation-a|decision=approved",
      "validationId": "validation-a",
      "candidateId": "candidate-a",
      "requestId": "request-a",
      "proposalId": "proposal-a",
      "actionId": "action-a",
      "resolutionId": "resolution-a",
      "blockId": "block-a",
      "originalText": "original text",
      "approvedText": "candidate text",
      "sourceValidationStatus": "accepted",
      "sourceFindingCodes": [],
      "approvalRationale": "Reviewer explicitly approved this candidate.",
      "approvalScope": "approved_for_future_application_only"
    }
  ],
  "summary": {
    "totalValidationResults": 1,
    "totalDecisions": 1,
    "approved": 1,
    "rejected": 0,
    "changesRequested": 0,
    "approvedSelections": 1,
    "approvalsFromAccepted": 1,
    "approvalsFromHumanReview": 0
  }
}
```

The example validates with `RewriteReviewDecisionBatchSchema`.

## Limitations

This module does not:

- generate or correct rewrite text
- resolve semantic findings
- authenticate or identify a reviewer
- persist decisions
- add timestamps
- call an LLM or provider
- apply approved text to a resume
- modify `ResumeDocument`
- generate DOCX or PDF
- recalculate matching, scoring, proposals, generation requests, candidate findings, or validation status

Approved selections are only structured permission for a later application phase.
