import { describe, expect, it } from "vitest";
import {
  longResumeText, longResumeOffer, longResumeOriginal, longResumeEdited, longResumeParagraphs,
} from "../e2e/long-docx-scenario.mjs";
import {
  runTailoringDemoAnalysis, rebuildValidationWithCandidates, applyTailoringDemoReview,
} from "../../apps/web/src/app/tailoring-demo-pipeline";

describe("long resume acceptance fixture", () => {
  it("applies the explicit edit while preserving every other source paragraph and source data", () => {
    expect(longResumeText.length).toBeLessThan(24000);
    const analysis = runTailoringDemoAnalysis(longResumeText, longResumeOffer);
    const snapshot = JSON.stringify(analysis);
    const first = analysis.proposalRows[0];
    expect(first.originalText).toBe(longResumeOriginal);
    const edited = { ...analysis, ...rebuildValidationWithCandidates(analysis,
      analysis.candidateSubmissions.map((candidate) => ({ ...candidate,
        candidateText: candidate.requestId === first.requestId ? longResumeEdited : candidate.candidateText,
      })),
    ) };
    const decisions = Object.fromEntries(edited.proposalRows.map((row, index) => [row.validationId, index === 0 ? "approved" : "rejected"]));
    const applied = applyTailoringDemoReview(edited, decisions);
    const blocks = applied.exportModel.sections.flatMap((section) => section.blocks.map((block) => block.renderText));
    expect(blocks).toContain(longResumeEdited);
    expect(blocks).not.toContain(longResumeOriginal);
    expect(blocks.filter((text) => text.startsWith("Proyecto sintético"))).toEqual(longResumeParagraphs);
    expect(applied.applicationResult.summary.rewrittenBlocks).toBe(1);
    expect(JSON.stringify(analysis)).toBe(snapshot);
    expect(applyTailoringDemoReview(edited, decisions)).toEqual(applied);
  });

  it("keeps the original text when the edited proposal is rejected", () => {
    const analysis = runTailoringDemoAnalysis(longResumeText, longResumeOffer);
    const first = analysis.proposalRows[0];
    const edited = { ...analysis, ...rebuildValidationWithCandidates(analysis,
      analysis.candidateSubmissions.map((candidate) => ({ ...candidate,
        candidateText: candidate.requestId === first.requestId ? longResumeEdited : candidate.candidateText,
      })),
    ) };
    const applied = applyTailoringDemoReview(edited, Object.fromEntries(edited.proposalRows.map((row) => [row.validationId, "rejected"])));
    const blocks = applied.exportModel.sections.flatMap((section) => section.blocks.map((block) => block.renderText));
    expect(blocks).toContain(longResumeOriginal);
    expect(blocks).not.toContain(longResumeEdited);
    expect(blocks.filter((text) => text.startsWith("Proyecto sintético"))).toEqual(longResumeParagraphs);
    expect(applied.applicationResult.summary.rewrittenBlocks).toBe(0);
  });
});
