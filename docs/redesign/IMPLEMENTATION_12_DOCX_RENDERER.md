# Implementation 12 - Deterministic DOCX Renderer

This increment adds the final MVP bridge from `ResumeExportModel` to a portable DOCX artifact. It does not implement CV Tailoring Agent orchestration, storage, UI, dashboards, PDF/HTML rendering, external provider calls, or LLM generation.

## Dependencies

The runtime dependencies are fixed exactly:

- `docx` `9.7.1`
- `jszip` `3.10.1`

`package-lock.json` is versioned and records the resolved transitive graph used by npm. Binary reproducibility depends on this fixed dependency graph.

## Scope

The renderer consumes an already-built and already-validated `ResumeExportModel`:

```ts
export async function renderResumeExportModelToDocx(
  input: RenderResumeExportModelToDocxInput
): Promise<DocxRenderResult>
```

```ts
export type RenderResumeExportModelToDocxInput = {
  exportModel: ResumeExportModel;
};
```

It does not recalculate matching, scoring, targeting, proposal generation, validation, reviewer decisions, rewrite application, or export modeling.

## Public Schemas

New public schemas live in `src/schemas/docx-render.ts` and are exported from `src/schemas/index.ts`:

- `DocxRenderScopeSchema`
- `DocxRenderProfileSchema`
- `DocxMimeTypeSchema`
- `DocxContentEncodingSchema`
- `DocxArtifactIdSchema`
- `DocxRenderSummarySchema`
- `DocxRenderResultSchema`

All result objects are strict. `DocxRenderResultSchema` validates:

- deterministic `artifactId` from `exportModelId` and `renderProfile`;
- deterministic `suggestedFilename` from `exportModelId` and `renderProfile`;
- fixed MIME type, extension, content encoding, scope, and profile;
- strict canonical Base64 without spaces, tabs, line breaks, invalid characters, or invalid padding;
- positive `byteLength` matching decoded bytes;
- decoded content beginning with a ZIP local-file signature;
- summary coherence.

## Result Contract

`DocxRenderResult` contains no current timestamp, no filesystem path, and no provider or review metadata:

```ts
export type DocxRenderResult = {
  artifactId: string;
  exportModelId: string;
  applicationId: string;
  offerId: string;
  profileId: string;
  sourceDocumentId: string;
  adaptedDocumentId: string;
  renderScope: "generated_docx_artifact";
  renderProfile: "single_column_cv_v1";
  suggestedFilename: string;
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  fileExtension: ".docx";
  contentEncoding: "base64";
  contentBase64: string;
  byteLength: number;
  summary: DocxRenderSummary;
};
```

The renderer returns a deeply frozen result. Callers decide later whether to persist `contentBase64` to disk, attach it to an application, upload it, or render it in a UI. Production code does not persist files.

## Visual Profile

The only implemented profile is `single_column_cv_v1`.

- Page: A4 portrait.
- Margins: 20 mm on all sides.
- Layout: one Word section, one column.
- Font: Arial.
- Base text: 10.5 pt.
- Section headings: 13 pt, bold, keep-next.
- Spacing: 8 pt before section headings, 4 pt after headings, 4 pt after blocks, 1.08 line spacing.
- Excluded constructs: headers, footers, images, tables, and numbering.

The renderer uses simple section-heading paragraphs followed by block paragraphs. It does not create lists, tables, text boxes, images, comments, tracked changes, hyperlinks, or a DOCX template derived from an original resume.

## Text Rendering And Privacy

Only these fields become visible document text:

- `section.label`
- `block.renderText`

The renderer does not insert visible text from `originalText`, `effectiveText` as fallback, `applicationStatus`, `textSource`, `appliedSelectionId`, `appliedChangeId`, `evidenceIds`, `sourceLocator`, `profileId`, `offerId`, `applicationId`, `exportModelId`, `sourceDocumentId`, `adaptedDocumentId`, rationale, findings, reviewer data, user names, emails, local paths, hostnames, or system usernames.

`renderText` is handled literally:

- ordinary text becomes text runs;
- leading, trailing, and repeated internal spaces are preserved by the DOCX text writer;
- tabs become OOXML tab runs;
- `\n` and `\r` become line breaks;
- `\r\n` becomes one line break;
- XML-sensitive characters are escaped by the DOCX library;
- Markdown-looking content remains literal text and is not interpreted as formatting.

The renderer rejects XML 1.0-incompatible characters before packing:

- `DOCX_RENDER_UNSUPPORTED_TEXT_CHARACTER`

The error is stable and does not include the source text. The renderer does not trim, normalize, clean, or replace invalid characters silently.

## Ordering

Rendering preserves the physical array order from `ResumeExportModel`:

- sections are rendered by iterating `exportModel.sections` as received;
- blocks are rendered by iterating each `section.blocks` array as received;
- the renderer does not sort by `order`, IDs, export IDs, or locale.

`ResumeExportModelSchema` validates structural coherence and uniqueness of order fields. The renderer does not reinterpret that structure.

## Metadata

The DOCX is created with fixed document metadata:

- title: `Adapted Resume`
- subject: `Career Navigator DOCX Export`
- creator: `Career Navigator`
- lastModifiedBy: `Career Navigator`
- revision: `1`
- created: `2000-01-01T00:00:00Z`
- modified: `2000-01-01T00:00:00Z`

Metadata must not include profile IDs, offer IDs, application IDs, export model IDs, source/adapted document IDs, names, emails, local paths, hostnames, system usernames, or current timestamps.

## Determinism

For the same `ResumeExportModel` input, the same supported runtime, and the dependency graph fixed by `package-lock.json`, the renderer is designed to return deep-equal `DocxRenderResult` objects with identical DOCX bytes.

The renderer does not use:

- `Date.now`;
- `Math.random`;
- UUID generation;
- filesystem state;
- global counters;
- locale-sensitive sorting.

The DOCX library creates package metadata during packing, so the renderer normalizes the package after packing:

- ZIP entries are written in stable path order using `<` and `>`;
- ZIP entry timestamps are fixed to `1980-01-01`;
- generated `docProps/core.xml` created/modified timestamps are fixed to `2000-01-01T00:00:00Z`;
- generated non-directory package parts are preserved;
- implicit directory entries are not emitted by the normalized ZIP;
- ZIP output uses fixed DEFLATE options and DOS platform metadata.

This does not claim binary identity across arbitrary Node versions, operating systems, future dependency versions, or runtimes that have not been tested.

## OOXML Validation

The renderer verifies that the normalized package contains these parts:

- `[Content_Types].xml`
- `_rels/.rels`
- `docProps/app.xml`
- `docProps/core.xml`
- `word/_rels/document.xml.rels`
- `word/document.xml`
- `word/styles.xml`

If packing fails, the package is empty, the bytes are not a ZIP, the package is unreadable, or a required part is absent, a stable renderer error is thrown.

## Errors

Implemented error codes:

- `DOCX_RENDER_INPUT_INVALID_EXPORT_MODEL`
- `DOCX_RENDER_UNSUPPORTED_TEXT_CHARACTER`
- `DOCX_RENDER_PACKING_FAILED`
- `DOCX_RENDER_EMPTY_OUTPUT`
- `DOCX_RENDER_INVALID_PACKAGE`
- `DOCX_RENDER_OUTPUT_INVALID`

The renderer does not expose `ZodError`, internal `docx` errors, internal JSZip errors, stack traces, local paths, or complete CV text through these public errors.

## Smoke Test

The test suite includes a smoke test that materializes a `.docx` under `os.tmpdir()`, reads the file back from disk, verifies size, byte length, ZIP signature, and required OOXML parts, then removes the temporary file and directory. It does not require Word or LibreOffice and does not write inside the repository.

## Example

This JSON example validates structurally with `DocxRenderResultSchema`. Its `contentBase64` is a minimal ZIP payload used only to demonstrate the schema contract. Real renderer output also contains the required DOCX OOXML parts listed above.

```json
{
  "artifactId": "docx-artifact|export-model=resume-export-model%7Capplication%3Da%7Cadapted-document%3Db|profile=single_column_cv_v1",
  "exportModelId": "resume-export-model|application=a|adapted-document=b",
  "applicationId": "a",
  "offerId": "offer-1",
  "profileId": "profile-1",
  "sourceDocumentId": "resume-doc",
  "adaptedDocumentId": "b",
  "renderScope": "generated_docx_artifact",
  "renderProfile": "single_column_cv_v1",
  "suggestedFilename": "cv-tailored-resume-export-model%7Capplication%3Da%7Cadapted-document%3Db-single_column_cv_v1.docx",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "fileExtension": ".docx",
  "contentEncoding": "base64",
  "contentBase64": "UEsDBAoAAAAIAAAAIQDHHBc8CgAAAAgAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLMJqSxILda3AwBQSwECFAAKAAAACAAAACEAxxwXPAoAAAAIAAAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLBQYAAAAAAQABAEEAAAA7AAAAAAA=",
  "byteLength": 146,
  "summary": {
    "totalSections": 1,
    "totalBlocks": 1,
    "totalSectionHeadings": 1,
    "totalBlockParagraphs": 1,
    "totalParagraphs": 2
  }
}
```

## Out Of Scope

This increment intentionally does not include:

- CV Tailoring Agent orchestration;
- DOCX template selection;
- user-editable styling;
- PDF rendering;
- HTML rendering;
- storage;
- dashboard integration;
- UI download flows;
- external provider calls;
- semantic rewriting or LLM content generation.
