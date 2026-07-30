# Implementation 07 - Evidence-Grounded Generation Requests

This increment adds deterministic construction of structured generation requests from rewrite proposals and authorized evidence.

It does not call an LLM, create rewritten text, create candidates, modify the CV, build provider-specific prompts, write files, persist records, or depend on a provider API.

## Purpose

`RewriteProposal` identifies a concrete CV block that may be rewritten. `RewriteGenerationRequest` prepares the safe, provider-agnostic input a future text generator will receive.

The relationship is:

```text
RewriteProposal -> Evidence[] -> RewriteGenerationRequest
```

Skipped rewrite items never produce generation requests.

## Public Signature

```ts
export function buildRewriteGenerationRequests(
  input: BuildRewriteGenerationRequestsInput
): RewriteGenerationBatch
```

```ts
export type BuildRewriteGenerationRequestsInput = {
  rewriteProposalResult: RewriteProposalResult;
  evidences: Evidence[];
};
```

The function is pure and deterministic. It does not use `Date`, `Date.now`, `Math.random`, UUIDs, hashes, counters, network calls, LLM calls, or locale-dependent comparison.

## Schemas

The public schemas live in `src/schemas/generation.ts`:

- `GenerationEvidenceReferenceSchema`
- `GenerationEvidenceContextSchema`
- `GenerationResponseContractSchema`
- `RewriteGenerationRequestSchema`
- `RewriteGenerationSummarySchema`
- `RewriteGenerationBatchSchema`

All object schemas are strict. Public TypeScript types are inferred from Zod with `z.infer`.

## Evidence Fields Used

`EvidenceSchema` currently contains:

- `id`
- `type`
- `title`
- `description`
- `associatedCompetency`
- `source`
- `declaredLevel`
- `date`
- `verified`
- `confidence`
- `tags`
- `reference`

`GenerationEvidenceContextSchema` includes only the minimum literal context needed by a future generator:

- `evidenceId`, copied from `Evidence.id`
- `title`
- `description`
- `associatedCompetency`, when present
- `date`, when present and valid under the same date schema used by `EvidenceSchema`
- `tags`, when present and in the original Evidence order
- `reference`, when present and using its known locator fields

It intentionally does not copy the complete `Evidence` object. `confidence`, `verified`, `source`, `declaredLevel`, and passthrough fields are not needed to generate grounded wording and could leak scoring, trust, or unrelated metadata into a future generator.

No evidence value is summarized, translated, corrected, normalized, concatenated into invented prose, or reformulated.

Evidence content is considered usable only when both `title` and `description` contain non-whitespace text. `trim` is used only for this validation check; the original strings are returned unchanged.

## Authorized Evidence

For every request:

- `evidenceIds` is the stable sorted set of `RewriteProposal.evidenceIds`.
- Every `evidenceId` must exist exactly once in `Evidence[]`.
- `evidenceContexts` is sorted by `evidenceId`.
- Each `evidenceIds[index]` must match `evidenceContexts[index].evidenceId`.
- Duplicate contexts are rejected.
- Missing or additional contexts are rejected.
- Evidence not referenced by the proposal is excluded.

`RewriteGenerationRequestSchema` enforces the same canonical order and index alignment. It rejects the same IDs in a different order, contexts in a different order, missing contexts, additional contexts, and duplicates.

If a required evidence is missing, the builder throws `GENERATION_INPUT_UNKNOWN_EVIDENCE_ID`.

If `Evidence[]` contains duplicate IDs, the builder throws `GENERATION_INPUT_DUPLICATE_EVIDENCE_ID`.

If a referenced evidence has no usable title or description content after whitespace validation, the builder throws `GENERATION_INPUT_EMPTY_EVIDENCE_CONTENT`.

When the same `Evidence` is authorized by multiple proposals, each request receives an independent context object, including independent `tags` and `reference` objects.

## Response Contract

Each request includes this exact response contract:

```json
{
  "outputType": "plain_text",
  "languagePolicy": "preserve_original_language",
  "candidateCount": 1,
  "allowMarkdown": false,
  "allowAdditionalClaims": false,
  "requireEvidenceGrounding": true
}
```

`GenerationResponseContractSchema` rejects arbitrary configuration. Provider, model, prompt, system prompt, messages, tools, temperature, `topP`, `maxTokens`, generated text, confidence, and timestamps are not part of this increment and are rejected by strict schemas at the request, response contract, and evidence context levels.

## Original Text

`RewriteGenerationRequest.originalText` is copied exactly from `RewriteProposal.originalText`.

The builder does not trim, replace, normalize, split/join, spell-correct, translate, or reformulate it. Leading/trailing spaces, multiple spaces, tabs, newlines, Unicode, accents, case, and punctuation are preserved.

`trim` is used only for validation of whitespace-only strings.

## Constraints

Each request preserves the constraints received from the `RewriteProposal`.

Because `RewriteProposalSchema` already requires the canonical rewrite constraint sequence, requests also preserve:

1. `preserve_factual_meaning`
2. `use_only_linked_evidence`
3. `do_not_add_claims`
4. `preserve_dates`
5. `preserve_metrics`
6. `preserve_proper_nouns`

`RewriteGenerationRequestSchema` also verifies that constraints still match this exact ordered sequence.

## Runtime Validation

The builder validates:

- `rewriteProposalResult` with `RewriteProposalResultSchema`
- every item in `evidences` with `EvidenceSchema`

It throws stable errors instead of exposing raw `ZodError` as the primary builder contract.

It also verifies:

- `proposalId` is unique.
- `requestId` is unique.
- `evidenceId` is unique in `Evidence[]`.
- every proposal evidence reference exists.
- every request contains exactly the contexts for its evidence IDs in the same canonical order.
- skipped items are ignored.

It does not recalculate matching, scoring, tailoring, targeting, or rewrite proposals.

## IDs

`requestId` uses canonical tagged components:

```text
generation-request|offer=<offerId>|profile=<profileId>|document=<documentId>|proposal=<proposalId>
```

All variable components are encoded with `encodeURIComponent`.

IDs depend only on stable input data. They do not use positions, counters, time, random values, UUIDs, hashes, or locale comparison.

## Deterministic Order

The builder sorts copies and never sorts input arrays in place.

- `requests`: by `requestId`
- `requirementIds`: stable sorted unique
- `evidenceIds`: stable sorted unique
- `evidenceContexts`: by `evidenceId`, aligned index-by-index with `evidenceIds`
- `constraints`: preserved canonical order

Semantically equivalent inputs with proposals, evidences, requirement IDs, or evidence IDs in different orders produce `deepEqual` results. The public request schema also rejects non-canonical `requirementIds`, `evidenceIds`, and `evidenceContexts` order.

## Summary

`RewriteGenerationSummarySchema` uses non-negative integers. `RewriteGenerationBatchSchema` verifies:

- `summary.totalProposals === requests.length`
- `summary.generationReady === requests.length`
- `summary.totalEvidenceContexts` equals the sum of all request `evidenceContexts`

## Errors

Stable errors:

- `GENERATION_INPUT_INVALID_REWRITE_RESULT`
- `GENERATION_INPUT_INVALID_EVIDENCE`
- `GENERATION_INPUT_DUPLICATE_PROPOSAL_ID`
- `GENERATION_INPUT_DUPLICATE_EVIDENCE_ID`
- `GENERATION_INPUT_UNKNOWN_EVIDENCE_ID`
- `GENERATION_INPUT_EMPTY_EVIDENCE_CONTENT`

No separate evidence-set mismatch error is exposed. The builder constructs contexts internally from `evidenceIds`; missing evidence is reported as `GENERATION_INPUT_UNKNOWN_EVIDENCE_ID`, and the output schema verifies evidence ID/context correspondence.

## Immutability

The returned batch is deeply frozen:

- root object
- `requests`
- each request
- `constraints`
- `requirementIds`
- `evidenceIds`
- `evidenceContexts`
- each evidence context
- `tags`
- `reference`
- `responseContract`
- `summary`

Inputs are not modified or frozen:

- `RewriteProposalResult`
- `proposals`
- `Evidence[]`
- each `Evidence` object

Deeply frozen inputs are accepted.

## Valid JSON Example

```json
{
  "offerId": "offer-1",
  "profileId": "profile-1",
  "documentId": "resume-doc",
  "requests": [
    {
      "requestId": "generation-request|offer=offer-1|profile=profile-1|document=resume-doc|proposal=proposal-a",
      "proposalId": "proposal-a",
      "actionId": "action-a",
      "resolutionId": "resolution-a",
      "blockId": "block-a",
      "originalText": "Built deterministic automation pipelines.",
      "rewriteGoal": "emphasize_supported_evidence",
      "constraints": [
        "preserve_factual_meaning",
        "use_only_linked_evidence",
        "do_not_add_claims",
        "preserve_dates",
        "preserve_metrics",
        "preserve_proper_nouns"
      ],
      "requirementIds": ["req-a"],
      "evidenceIds": ["evidence-a"],
      "evidenceContexts": [
        {
          "evidenceId": "evidence-a",
          "title": "Automation Lead",
          "description": "Delivered 42% faster reporting with audited workflows.",
          "associatedCompetency": "AI automation",
          "date": "2024-04-20",
          "tags": ["automation"],
          "reference": {
            "profileSection": "experience",
            "experienceId": "exp-a"
          }
        }
      ],
      "responseContract": {
        "outputType": "plain_text",
        "languagePolicy": "preserve_original_language",
        "candidateCount": 1,
        "allowMarkdown": false,
        "allowAdditionalClaims": false,
        "requireEvidenceGrounding": true
      }
    }
  ],
  "summary": {
    "totalProposals": 1,
    "generationReady": 1,
    "totalEvidenceContexts": 1
  }
}
```

This example validates with `RewriteGenerationBatchSchema`.

## Limitations

A `RewriteGenerationRequest` is not a rewrite candidate. It is only a safe, structured input contract for a later generation step.

This increment does not:

- call Gemini, OpenAI, or any other LLM
- choose a provider
- include provider, model, prompt, system prompt, or temperature
- include `topP`, `maxTokens`, messages, or tools
- create `candidateText`
- create `rewrittenText`
- create `afterText`
- create `finalText`
- validate a generated response
- modify the CV
- apply or persist changes
- read or write DOCX/PDF
- provide UI
- approve changes on behalf of a human
