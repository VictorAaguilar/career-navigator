# Implementation 08 - Rewrite Candidate Validation

This increment receives one externally produced rewrite candidate for each generation request and validates it with deterministic surface checks.

It does not call an LLM, generate `candidateText`, apply text to a resume, modify the CV, validate semantic equivalence, create DOCX/PDF, or approve changes on behalf of a human.

## Purpose

`RewriteGenerationRequest` defines the safe input contract for a future generator. `RewriteCandidateSubmission` is the external response payload for that request. `validateRewriteCandidates` checks the submitted text for deterministic, traceable issues.

The relationship is:

```text
RewriteGenerationRequest -> RewriteCandidateSubmission -> accepted | rejected | human_review
```

`accepted` means only that the candidate passed the deterministic checks implemented here. It does not mean full semantic validation, absence of every possible invention, human approval, or authorization to modify the CV.

## Public Signature

```ts
export function validateRewriteCandidates(
  input: ValidateRewriteCandidatesInput
): RewriteCandidateValidationBatch
```

```ts
export type ValidateRewriteCandidatesInput = {
  generationBatch: RewriteGenerationBatch;
  candidates: RewriteCandidateSubmission[];
};
```

The function is pure and deterministic. It does not use `Date`, `Date.now`, `Math.random`, UUIDs, hashes, counters, network calls, LLM calls, provider SDKs, or locale-dependent comparison.

## Schemas

The public schemas live in `src/schemas/candidate.ts`:

- `RewriteCandidateSubmissionSchema`
- `RewriteCandidateFindingSeveritySchema`
- `RewriteCandidateFindingCodeSchema`
- `RewriteCandidateFindingSchema`
- `RewriteCandidateValidationStatusSchema`
- `RewriteCandidateValidationResultSchema`
- `RewriteCandidateValidationSummarySchema`
- `RewriteCandidateValidationBatchSchema`

All object schemas are strict. Public TypeScript types are inferred from Zod with `z.infer`.

## Submission Contract

`RewriteCandidateSubmission` contains only:

- `requestId`
- `candidateText`

It rejects IDs and data already present in `RewriteGenerationRequest`, including `proposalId`, `actionId`, `resolutionId`, `blockId`, `originalText`, `evidenceIds`, and `evidenceContexts`.

It also rejects provider and generation metadata such as `provider`, `model`, `confidence`, `score`, `prompt`, `systemPrompt`, `temperature`, `topP`, `maxTokens`, `usage`, `generatedAt`, and all unknown fields.

`candidateText` must be a non-whitespace string and is copied literally after validation. `trim` is used only to reject whitespace-only submissions.

## One Candidate Per Request

`GenerationResponseContract` currently fixes `candidateCount: 1`.

Therefore:

- every `RewriteGenerationRequest` must have exactly one submission
- duplicate submission `requestId` values are rejected
- unknown submission `requestId` values are rejected
- missing candidates are rejected
- an empty generation batch with empty candidates is valid

Skipped items from previous increments do not participate in this module.

## Validation Scope

Every batch has:

```json
{
  "validationScope": "deterministic_surface_checks_only"
}
```

This is intentionally narrow. The module checks only deterministic surface signals.

## Status Rules

`RewriteCandidateValidationStatusSchema` supports:

- `accepted`
- `rejected`
- `human_review`

The result schema validates:

Precedence is:

1. any finding with severity `error`: `rejected`
2. no errors and at least one `review` finding: `human_review`
3. no findings: `accepted`

The schema enforces the same contract:

- `rejected`: at least one finding with severity `error`
- `human_review`: no `error` findings and at least one `review` finding
- `accepted`: no findings

## Findings

Finding severities:

- `error`
- `review`

Error codes:

- `candidate_contains_markdown`
- `candidate_added_unsupported_date`
- `candidate_removed_original_date`
- `candidate_added_unsupported_metric`
- `candidate_removed_original_metric`

Human-review codes:

- `candidate_added_unverified_proper_noun`
- `candidate_removed_original_proper_noun`
- `candidate_unchanged`

Each finding contains:

- `findingId`
- `code`
- `severity`
- `values`

Findings are strict. Each result can contain at most one finding per code. Findings are sorted by code with stable `<`/`>` comparison. `values` are deduplicated and sorted with the same comparison. `candidate_unchanged` must have empty `values`; all other findings require at least one value.

The schema rejects code/severity mismatches.

## Markdown Detection

Because requests require `allowMarkdown: false`, candidates are rejected when conservative Markdown indicators are detected:

- code fences with ``` or ~~~
- headings
- unordered lists with `-`, `*`, or `+` at line start
- numbered lists
- blockquotes
- Markdown links and images

An internal hyphen inside a normal sentence is not treated as Markdown.

## Dates

Date extraction is deterministic and preserves surface text. It recognizes:

- `YYYY-MM-DD`
- `D/M/YYYY`
- `DD/MM/YYYY`
- `DD/M/YYYY`
- `D/MM/YYYY`
- `D-M-YYYY`
- `DD-MM-YYYY`
- `DD-M-YYYY`
- `D-MM-YYYY`
- `M/YYYY`
- `MM/YYYY`
- `M-YYYY`
- `MM-YYYY`
- years from 1900 to 2099

Longer formats are processed before standalone years so a full date is not also counted as its year.

Required dates are detected in `originalText`.

Allowed dates are detected in:

- `originalText`
- the request's own `evidenceContexts`

Rules:

- original date missing from `candidateText`: `candidate_removed_original_date`, error
- new candidate date absent from allowed dates: `candidate_added_unsupported_date`, error
- date present in authorized evidence can be added without finding

This is superficial format detection, not calendar validation. It does not use `Date`, `Date.parse`, or any real-date parser. Calendar-impossible strings that match the supported surface format, such as `99-99-2024`, `13/99/2024`, or `00/2024`, can be detected as date tokens.

Dates are not normalized or converted. Authorization is by exact token match only. Two representations of the same possible calendar date are not considered equivalent automatically. For example, `01/05/2024`, `1-5-2024`, and `2024` remain distinct surface tokens.

## Metrics

Metric extraction is deterministic and preserves surface text. It recognizes:

- integers
- decimals with dot or comma
- percentages
- currencies
- numbers with common units
- independent numbers

Spans already classified as dates are not counted again as metrics.

Required metrics are detected in `originalText`.

Allowed metrics are detected in:

- `originalText`
- the request's own `evidenceContexts`

Rules:

- original metric missing from `candidateText`: `candidate_removed_original_metric`, error
- new candidate metric absent from allowed metrics: `candidate_added_unsupported_metric`, error
- metric present in authorized evidence can be added without finding

Metrics are not normalized, rounded, converted, or reconciled across formats.

## Proper Nouns

Proper-noun validation is a conservative heuristic. It does not perform entity recognition.

It detects:

- sequences of two or more words starting with uppercase letters
- all-uppercase tokens with at least two letters

A single capitalized word at the beginning of a sentence is not enough by itself.

Required proper-noun tokens are detected in `originalText`.

Allowed proper-noun tokens are detected in:

- `originalText`
- the request's own `evidenceContexts`

Rules:

- original term missing from `candidateText`: `candidate_removed_original_proper_noun`, review
- new candidate term absent from allowed terms: `candidate_added_unverified_proper_noun`, review

Proper-noun findings never cause rejection in this increment.

## Candidate Unchanged

When `candidateText === originalText` using exact string equality:

- code: `candidate_unchanged`
- severity: `review`
- values: `[]`

No trimming, normalization, or case conversion is used for this comparison.

`candidate_unchanged` is not exclusive. The other deterministic detectors still run. If the original text already contains a rejected surface pattern and the candidate is exactly unchanged, the result contains both `candidate_unchanged` and the error finding; the final status is `rejected` because error findings take precedence.

## Authorized Context

The validator uses only the `evidenceContexts` already present in the matching `RewriteGenerationRequest`.

It does not consult:

- global `Evidence[]`
- another request
- another proposal
- `ResumeDocument`
- external knowledge
- network
- model knowledge

It may internally inspect the string fields already present in `GenerationEvidenceContext`, including known `reference` fields, but it never exposes a new synthesized evidence description.

## Literal Preservation

`originalText` is copied from `RewriteGenerationRequest.originalText`.

`candidateText` is copied from `RewriteCandidateSubmission.candidateText`.

Both preserve leading/trailing spaces, multiple spaces, tabs, newlines, Unicode, accents, uppercase/lowercase, and punctuation.

The builder does not trim, replace, normalize, split/join to build output, spell-correct, translate, reformulate, or change case.

## IDs

`candidateId` uses:

```text
rewrite-candidate|offer=<offerId>|profile=<profileId>|document=<documentId>|request=<requestId>
```

`validationId` uses:

```text
rewrite-validation|offer=<offerId>|profile=<profileId>|document=<documentId>|request=<requestId>
```

`findingId` uses:

```text
rewrite-finding|validation=<validationId>|code=<code>
```

All variable components are encoded with `encodeURIComponent`.

IDs never include `candidateText` and never depend on time, random values, hashes, counters, array indexes, or locale comparison.

## Deterministic Order

The validator sorts copies and never sorts inputs in place.

- `results`: by `validationId`
- `findings`: by `code`
- `values`: stable sorted unique

Requests and submissions in different orders produce `deepEqual` results when they describe the same request/candidate pairs.

## Runtime Validation

The validator checks:

- `generationBatch` with `RewriteGenerationBatchSchema`
- each submission with `RewriteCandidateSubmissionSchema`
- duplicate submission `requestId`
- unknown submission `requestId`
- missing candidate for a request
- final batch with `RewriteCandidateValidationBatchSchema`

It throws stable errors instead of exposing raw `ZodError`.

It does not recalculate matching, scoring, tailoring, targeting, rewrite proposals, or generation requests.

## Errors

Stable errors:

- `CANDIDATE_VALIDATION_INPUT_INVALID_GENERATION_BATCH`
- `CANDIDATE_VALIDATION_INPUT_INVALID_CANDIDATE`
- `CANDIDATE_VALIDATION_INPUT_DUPLICATE_REQUEST_ID`
- `CANDIDATE_VALIDATION_INPUT_UNKNOWN_REQUEST_ID`
- `CANDIDATE_VALIDATION_INPUT_MISSING_CANDIDATE`

## Summary

`RewriteCandidateValidationSummarySchema` uses non-negative integers. `RewriteCandidateValidationBatchSchema` verifies:

- `summary.totalRequests === results.length`
- `summary.totalCandidates === results.length`
- `summary.accepted` matches accepted results
- `summary.rejected` matches rejected results
- `summary.humanReview` matches `human_review` results
- `summary.totalFindings` matches the sum of result findings

## Immutability

The returned batch is deeply frozen:

- root object
- `results`
- each result
- `findings`
- each finding
- `values`
- `summary`

Inputs are not modified or frozen:

- `generationBatch`
- requests
- evidence contexts
- candidates
- candidate text
- original arrays or objects

Deeply frozen inputs are accepted.

## Valid JSON Example

```json
{
  "offerId": "offer-1",
  "profileId": "profile-1",
  "documentId": "resume-doc",
  "validationScope": "deterministic_surface_checks_only",
  "results": [
    {
      "validationId": "rewrite-validation|offer=offer-1|profile=profile-1|document=resume-doc|request=request-a",
      "candidateId": "rewrite-candidate|offer=offer-1|profile=profile-1|document=resume-doc|request=request-a",
      "requestId": "request-a",
      "proposalId": "proposal-a",
      "actionId": "action-a",
      "resolutionId": "resolution-a",
      "blockId": "block-a",
      "originalText": "built reliable pipelines",
      "candidateText": "built reliable automation pipelines",
      "status": "accepted",
      "findings": []
    }
  ],
  "summary": {
    "totalRequests": 1,
    "totalCandidates": 1,
    "accepted": 1,
    "rejected": 0,
    "humanReview": 0,
    "totalFindings": 0
  }
}
```

This example validates with `RewriteCandidateValidationBatchSchema`.

## Limitations

The checks are superficial and deterministic. They do not detect all possible invented claims.

For example, a candidate can add a new unsupported claim without adding a number, date, Markdown marker, or proper noun. This module intentionally does not try to solve that with arbitrary word lists, semantic similarity, Levenshtein distance, embeddings, network calls, LLM calls, or broad linguistic rules.

This increment does not:

- call a generator
- validate semantic equivalence
- guarantee absence of hallucinations
- detect language automatically
- approve text for publication
- modify the CV
- apply the candidate to `ResumeDocument`
- create DOCX or PDF
- provide human approval
