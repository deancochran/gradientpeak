import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  ActivityPlanIntegrityError,
  toVerifiedResolverCandidate,
  toVerifiedResolverCandidates,
} from "./resolver-candidate";
import { activityPlanStructureHash } from "./structure-hash";

function candidate(policyInvalid = false) {
  const structure = activityPlanStructureSchema.parse({
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "33333333-3333-4333-8333-333333333333",
        name: "Steady",
        duration: { type: "time", seconds: 1800 },
        targets: [{ type: "RPE", intensity: 5 }],
      },
    ],
  });
  if (policyInvalid) {
    const firstStep = structure.items
      .flatMap((item) => (item.type === "step" ? [item] : item.steps))
      .at(0);
    if (!firstStep) throw new Error("Candidate fixture requires one activity-plan step");
    firstStep.duration = { type: "untilFinished" };
  }
  return {
    id: policyInvalid
      ? "55555555-5555-4555-8555-555555555555"
      : "44444444-4444-4444-8444-444444444444",
    revision: 1,
    structure,
    trainingIntent: "general_maintenance",
    structureHash: activityPlanStructureHash(structure),
    semanticHash: activityPlanSemanticHash({
      structure,
      trainingIntent: "general_maintenance",
    }),
  };
}
describe("new-selection resolver candidates", () => {
  it("rejects a historically valid but policy-invalid explicit selection", () => {
    expect(() => toVerifiedResolverCandidate(candidate(true))).toThrow(ZodError);
    expect(toVerifiedResolverCandidate(candidate())).toMatchObject({ revision: 1 });
  });
  it("skips policy-invalid historical candidates for automatic selection without hiding explicit failures", () => {
    const historical = candidate(true);
    const current = candidate();
    expect(toVerifiedResolverCandidates([historical, current], []).map((item) => item.id)).toEqual([
      current.id,
    ]);
    expect(() => toVerifiedResolverCandidates([historical, current], [historical.id])).toThrow(
      ZodError,
    );
  });
  it("does not swallow integrity errors during automatic selection", () => {
    expect(() =>
      toVerifiedResolverCandidates([{ ...candidate(), semanticHash: "invalid" }], []),
    ).toThrow(ActivityPlanIntegrityError);
  });
});
