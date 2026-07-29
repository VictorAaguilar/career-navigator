# Implementation 06 - Rewrite Proposals

This increment adds deterministic construction of structured rewrite proposals for concrete CV blocks.

It does not rewrite the CV. It does not produce `afterText`, generated text, prompts, LLM output, files, exports, UI state, or persisted records.

## Purpose

`resolveTailoringTargets` links a `TailoringAction` to a concrete `ResumeBlock` or marks the target as ambiguous/unresolved. `buildRewriteProposals` consumes that resolved targeting result and prepares safe instructions for a future generator.

The relationship is:

```text
TailoringAction -> TailoringTargetResolution -> ResumeBlock -> RewriteProposal
```

## Public Signature

```ts
export function buildRewriteProposals(
  input: BuildRewriteProposalsInput
): RewriteProposalResult
```

```ts
export type BuildRewriteProposalsInput = {
  tailoringPlan: TailoringPlan;
  targetingResult: TailoringTargetingResult;
  resumeDocument: ResumeDocument;
};
```

The function is pure and deterministic. It does not use `Date`, `Date.now`, `Math.random`, UUIDs, hashes, counters, network calls, LLM calls, or locale-dependent comparison.

## Schemas

The public schemas live in `src/schemas/rewrite.ts`:

- `RewriteGoalSchema`
- `RewriteConstraintSchema`
- `RewriteSkippedReasonSchema`
- `RewriteProposalSchema`
- `RewriteSkippedItemSchema`
- `RewriteProposalSummarySchema`
- `RewriteProposalResultSchema`

All object schemas are strict. Public TypeScript types are inferred from Zod with `z.infer`.

## Actions

Only `highlight_evidence` can appear as `RewriteProposal.actionType`.

`highlight_evidence` with a `resolved` target produces one `RewriteProposal`.

`retain_content` with a `resolved` target produces one `RewriteSkippedItem` with reason `no_rewrite_required`.

`prioritize_section` with a `resolved` target produces one `RewriteSkippedItem` with reason `structural_change_required`.

An `ambiguous` target produces one `RewriteSkippedItem` with reason `ambiguous_target`.

An `unresolved` target produces one `RewriteSkippedItem` with reason `unresolved_target`.

Target status is evaluated before action type. Therefore an ambiguous `prioritize_section` action is skipped as `ambiguous_target`, and an unresolved `retain_content` action is skipped as `unresolved_target`.

`TailoringPlan.gaps` and `TailoringPlan.reviewItems` never produce proposals.

## Rewrite Goal

The only current rewrite goal is:

- `emphasize_supported_evidence`

It is used only for `highlight_evidence`. No other goal is exposed until there is real behavior for it.

## Constraints

Every `RewriteProposal` includes all constraints in this canonical order:

1. `preserve_factual_meaning`
2. `use_only_linked_evidence`
3. `do_not_add_claims`
4. `preserve_dates`
5. `preserve_metrics`
6. `preserve_proper_nouns`

These constraints are instructions for a future generator. They are not executed in this increment.

The canonical list is exported as `CANONICAL_REWRITE_CONSTRAINTS` from `src/schemas/rewrite.ts`. `RewriteProposalSchema` requires exactly this sequence. It rejects omitted constraints, additional constraints, duplicates, reordered constraints, empty arrays, and partial arrays.

## Original Text

`RewriteProposal.originalText` is copied exactly from the selected `ResumeBlock.originalText`.

The builder does not trim, replace, normalize, split/join, spell-correct, translate, or reformulate it. Leading/trailing spaces, multiple spaces, tabs, newlines, Unicode, accents, case, and punctuation are preserved as the original string.

The block is located only by `blockId`, never by text matching.

Generated text fields are intentionally absent and rejected by `RewriteProposalSchema`, including `generatedAt`, `beforeText`, `afterText`, `rewrittenText`, `suggestedText`, `finalText`, `warnings`, and `confidence`.

## Evidence Intersection

`RewriteProposal.evidenceIds` is the exact intersection of:

- `TailoringAction.evidenceIds`
- `TailoringTargetResolution.evidenceIds`
- selected `ResumeBlock.evidenceIds`

The IDs are deduplicated, sorted with stable `<`/`>` comparison, and copied before use. Empty strings are excluded. No evidence is added from other blocks.

If a resolved `highlight_evidence` action has no shared evidence with the selected block, the builder throws:

- `REWRITE_PROPOSAL_NO_SHARED_EVIDENCE`

## Runtime Validation

The builder validates:

- `TailoringPlan` with `TailoringPlanSchema`
- `TailoringTargetingResult` with `TailoringTargetingResultSchema`
- `ResumeDocument` with `ResumeDocumentSchema`

It throws stable errors instead of exposing raw `ZodError` as the primary resolver contract.

It also verifies:

- `profileId` matches across all inputs.
- `offerId` matches between plan and targeting result.
- `documentId` matches between targeting result and resume document.
- `actionId` is unique in the plan.
- `resolutionId` is unique in the targeting result.
- every action has exactly one resolution.
- every resolution references a real action.
- `targetSection`, `requirementIds`, and `evidenceIds` match between action and resolution.
- resolved selected blocks exist in the resume document.

`REWRITE_INPUT_ACTION_RESOLUTION_MISMATCH` is used when more than one resolution references the same action, or when an action and its resolution disagree on `targetSection`.

## IDs

`proposalId` uses canonical tagged components:

```text
proposal|offer=<offerId>|profile=<profileId>|document=<documentId>|action=<actionId>|resolution=<resolutionId>|block=<blockId>
```

`skippedItemId` uses:

```text
skip|offer=<offerId>|profile=<profileId>|document=<documentId>|action=<actionId>|resolution=<resolutionId>|reason=<reason>
```

All variable components are encoded with `encodeURIComponent`.

## Deterministic Order

The builder sorts copies and never sorts input arrays in place.

- `proposals`: by `proposalId`
- `skippedItems`: by `skippedItemId`
- `requirementIds`: stable sorted unique
- `evidenceIds`: stable sorted unique
- `constraints`: canonical schema order

Semantically equivalent inputs with arrays in different orders produce `deepEqual` results.

## Summary

`RewriteProposalSummarySchema` uses non-negative integers. `RewriteProposalResultSchema` verifies:

- `summary.totalResolutions === proposals.length + skippedItems.length`
- `summary.readyProposals === proposals.length`
- `summary.ambiguousTargets` equals skipped items with `ambiguous_target`
- `summary.unresolvedTargets` equals skipped items with `unresolved_target`
- `summary.noRewriteRequired` equals skipped items with `no_rewrite_required` plus `structural_change_required`

## Errors

Stable errors:

- `REWRITE_INPUT_INVALID_TAILORING_PLAN`
- `REWRITE_INPUT_INVALID_TARGETING_RESULT`
- `REWRITE_INPUT_INVALID_RESUME_DOCUMENT`
- `REWRITE_INPUT_PROFILE_ID_MISMATCH`
- `REWRITE_INPUT_OFFER_ID_MISMATCH`
- `REWRITE_INPUT_DOCUMENT_ID_MISMATCH`
- `REWRITE_INPUT_DUPLICATE_ACTION_ID`
- `REWRITE_INPUT_DUPLICATE_RESOLUTION_ID`
- `REWRITE_INPUT_ACTION_NOT_FOUND`
- `REWRITE_INPUT_RESOLUTION_NOT_FOUND`
- `REWRITE_INPUT_BLOCK_NOT_FOUND`
- `REWRITE_INPUT_ACTION_RESOLUTION_MISMATCH`
- `REWRITE_INPUT_REQUIREMENT_SET_MISMATCH`
- `REWRITE_INPUT_EVIDENCE_SET_MISMATCH`
- `REWRITE_PROPOSAL_NO_SHARED_EVIDENCE`

`REWRITE_INPUT_ACTION_RESOLUTION_MISMATCH` covers:

- more than one resolution for the same `actionId`
- `targetSection` mismatch between action and resolution

## Immutability

The returned result is deeply frozen:

- root object
- `proposals`
- each proposal
- `requirementIds`
- `evidenceIds`
- `constraints`
- `skippedItems`
- `candidateBlockIds`
- `summary`

Inputs are not modified or frozen. A deeply frozen `ResumeDocument` is accepted.

## Valid JSON Example

```json
{
  "offerId": "offer-1",
  "profileId": "profile-1",
  "documentId": "resume-doc",
  "proposals": [
    {
      "proposalId": "proposal|offer=offer-1|profile=profile-1|document=resume-doc|action=action-a|resolution=resolution-a|block=block-a",
      "actionId": "action-a",
      "resolutionId": "resolution-a",
      "sectionId": "section-a",
      "blockId": "block-a",
      "actionType": "highlight_evidence",
      "targetSection": "experience",
      "requirementIds": ["req-a"],
      "evidenceIds": ["evidence-a"],
      "originalText": "Built deterministic automation pipelines.",
      "rewriteGoal": "emphasize_supported_evidence",
      "constraints": [
        "preserve_factual_meaning",
        "use_only_linked_evidence",
        "do_not_add_claims",
        "preserve_dates",
        "preserve_metrics",
        "preserve_proper_nouns"
      ]
    }
  ],
  "skippedItems": [],
  "summary": {
    "totalResolutions": 1,
    "readyProposals": 1,
    "ambiguousTargets": 0,
    "unresolvedTargets": 0,
    "noRewriteRequired": 0
  }
}
```

This example validates with `RewriteProposalResultSchema`.

## Limitations

A `RewriteProposal` is not the rewritten CV. It is a safe, structured contract for a later generation step.

This increment does not:

- allow `prioritize_section` or `retain_content` as `RewriteProposal.actionType`
- create `beforeText`
- create `afterText`
- create `rewrittenText`
- create `suggestedText`
- create `finalText`
- create `generatedAt`
- create proposal-level `warnings` or `confidence`
- generate final text
- call an LLM
- build prompts
- translate content
- apply changes
- read or write DOCX/PDF
- preserve visual styles
- export files
- persist data
- provide UI
- approve changes on behalf of a human
