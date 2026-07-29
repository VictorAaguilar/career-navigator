# Implementation 05 - Tailoring Block Targeting

This increment adds deterministic resolution from `TailoringAction` to concrete `ResumeBlock` IDs.

It does not modify the CV, rewrite text, apply actions, read files, render documents, call an LLM, or persist data. It only links a positive tailoring action to the original resume blocks that can support it.

## Purpose

`TailoringPlan` decides what should be highlighted, retained, or prioritized. `resolveTailoringTargets` decides where a positive action can point inside a `ResumeDocument`.

The resolver processes only `TailoringPlan.actions`. `gaps` and `reviewItems` are intentionally ignored because they are not evidence-backed positive actions.

## Public Signature

```ts
export function resolveTailoringTargets(
  input: ResolveTailoringTargetsInput
): TailoringTargetingResult
```

`ResolveTailoringTargetsInput` contains:

- `tailoringPlan: TailoringPlan`
- `resumeDocument: ResumeDocument`

The function is pure and deterministic. It does not use `Date`, `Date.now`, `Math.random`, UUIDs, network calls, LLM calls, mutable counters, global mutable state, or locale-dependent comparison.

## Schemas

The public schemas live in `src/schemas/targeting.ts`:

- `TailoringTargetStatusSchema`
- `TailoringTargetResolutionSchema`
- `TailoringTargetingSummarySchema`
- `TailoringTargetingResultSchema`

All object schemas are strict. Public TypeScript types are inferred from Zod with `z.infer`.

## Result Structure

`TailoringTargetingResult` contains:

- `offerId`
- `profileId`
- `documentId`
- `resolutions`
- `summary`

Each `TailoringTargetResolution` contains:

- `resolutionId`
- `actionId`
- `status`
- `targetSection`
- `requirementIds`
- `evidenceIds`
- `candidateBlockIds`
- `selectedBlockIds`
- `reason`

The output contains no `warnings`, `generatedAt`, `beforeText`, `afterText`, `rewrittenText`, `suggestedText`, or new CV content.

## Resolution States

`TailoringTargetResolutionSchema` is a discriminated contract by `status`.

`resolved`: exactly one block has the best deterministic score. `candidateBlockIds` contains exactly one ID, `selectedBlockIds` contains exactly one ID, and both IDs must be the same.

`ambiguous`: two or more blocks tie for the best deterministic score. `candidateBlockIds` contains the unique tied block IDs and `selectedBlockIds` is empty. A later human review step must choose.

`unresolved`: no block shares any evidence ID with the action. `candidateBlockIds` and `selectedBlockIds` are empty.

For every state, `requirementIds` and `evidenceIds` are non-empty arrays of unique non-empty strings. The schema rejects duplicate IDs and unknown fields.

## Candidate Rule

A block can become a candidate only when it shares at least one `evidenceId` with the action. In the final resolution, `candidateBlockIds` contains only the best-ranked candidate block IDs, not every lower-ranked block that shared evidence.

The resolver never matches by:

- `originalText`
- keywords
- text similarity
- semantic similarity
- section labels
- generated text
- LLM output

This keeps the action-to-block link traceable to explicit evidence references.

## Ranking

Candidates are ranked with this deterministic score:

1. Higher count of shared `evidenceIds` between the action and block.
2. Compatibility between `TailoringAction.targetSection` and `ResumeSection.kind`.

Before ranking, action evidence IDs and block evidence IDs are deduplicated and sorted on internal copies. Shared evidence is counted by exact ID intersection only.

Section compatibility is explicit:

| targetSection | compatible ResumeSection.kind |
| --- | --- |
| `summary` | `summary` |
| `experience` | `experience` |
| `projects` | `projects` |
| `skills` | `skills` |
| `education` | `education` |
| `certifications` | `certifications` |
| `languages` | `languages` |
| `other` | `other` |

Section order, block order, and block IDs may be used to sort output arrays. They are never used to select a winner when candidates still tie on the ranking score.

## Deterministic Order

The resolver sorts copies of input arrays and does not mutate inputs.

- Resolutions are ordered by `actionId`.
- `requirementIds` and `evidenceIds` in each resolution are deduplicated and sorted.
- Tied `candidateBlockIds` are sorted by stable string comparison.
- `selectedBlockIds` is either empty or contains the single selected block.

Semantically equivalent inputs with actions, sections, blocks, or evidence references in a different order produce `deepEqual` results.

## IDs

`resolutionId` is derived from stable input data with canonical tagged components and `encodeURIComponent`:

```text
resolution|offer=<offerId>|profile=<profileId>|document=<documentId>|action=<actionId>
```

No hashes, UUIDs, counters, timestamps, random values, network calls, or model calls are used.

## Input Errors

The resolver validates runtime inputs with `TailoringPlanSchema` and `ResumeDocumentSchema` and throws stable errors for invalid input coherence:

- `TARGETING_INPUT_INVALID_TAILORING_PLAN`
- `TARGETING_INPUT_INVALID_RESUME_DOCUMENT`
- `TARGETING_INPUT_PROFILE_ID_MISMATCH`
- `TARGETING_INPUT_DUPLICATE_ACTION_ID`
- `TARGETING_INPUT_DUPLICATE_BLOCK_ID`
- `TARGETING_INPUT_EMPTY_ACTION_EVIDENCE_ID`

`TailoringPlan.profileId` must match `ResumeDocument.profileId`. `actionId` must be unique. `blockId` must be unique across the resume document, even when callers pass data that was not schema-validated first. Every action evidence ID must be non-empty. Invalid plan or document shape is reported through the stable errors above instead of exposing a raw `ZodError` as the resolver contract.

## Summary

`TailoringTargetingSummarySchema` uses non-negative integers. `TailoringTargetingResultSchema` verifies:

- `summary.totalActions === resolutions.length`
- `summary.resolvedCount` equals the number of `resolved` resolutions
- `summary.ambiguousCount` equals the number of `ambiguous` resolutions
- `summary.unresolvedCount` equals the number of `unresolved` resolutions
- the three status counts add up to `totalActions`

## Valid JSON Example

```json
{
  "offerId": "offer-1",
  "profileId": "profile-1",
  "documentId": "resume-doc",
  "resolutions": [
    {
      "resolutionId": "resolution|offer=offer-1|profile=profile-1|document=resume-doc|action=action-a",
      "actionId": "action-a",
      "status": "resolved",
      "targetSection": "experience",
      "requirementIds": ["req-a"],
      "evidenceIds": ["evidence-a"],
      "candidateBlockIds": ["block-a"],
      "selectedBlockIds": ["block-a"],
      "reason": "Action \"action-a\" resolves to one resume block by shared evidence and deterministic section compatibility."
    }
  ],
  "summary": {
    "totalActions": 1,
    "resolvedCount": 1,
    "ambiguousCount": 0,
    "unresolvedCount": 0
  }
}
```

This example validates with `TailoringTargetingResultSchema`.

## Limitations

This increment does not preserve visual styles or layout. `ResumeDocument` keeps original text and source locators, but style reconstruction belongs to a later template or document-processing layer.

Ambiguous results are not resolved automatically. The resolver deliberately refuses to choose when the evidence-based ranking cannot distinguish candidates.

There is no `warnings` field in this increment because the resolver does not currently produce warnings. A future version can add one when there is a concrete functional case.

## Out Of Scope

- Rewriting `originalText`.
- Applying changes to the CV.
- Reading DOCX, PDF, Markdown, or plain text files.
- Preserving styles, layout, fonts, PDF coordinates, or DOCX runs.
- LLM or semantic matching.
- Exporting CVs.
- UI.
- Persistence.
- Human selection of ambiguous candidates.
