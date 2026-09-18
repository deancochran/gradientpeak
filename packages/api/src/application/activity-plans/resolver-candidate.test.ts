import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  ActivityPlanIntegrityError,
  toVerifiedResolverCandidate,
  toVerifiedResolverCandidates,
} from "./resolver-candidate";
import { activityPlanStructureHash } from "./structure-hash";

function candidate(purpose?: "work") {
  const structure = activityPlanStructureSchema.parse({
    version: 3,
    activity_category: "run",
    segments: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        role: "activity",
        name: "Run",
        intervals: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                name: "Steady",
                ...(purpose ? { purpose } : {}),
                duration: { type: "time", seconds: 1800 },
                targets: [{ type: "RPE", intensity: 5 }],
              },
            ],
          },
        ],
      },
    ],
  });
  return {
    id: purpose ? "44444444-4444-4444-8444-444444444444" : "55555555-5555-4555-8555-555555555555",
    revision: 1,
    structure,
    adaptation: null,
    trainingIntent: "general_maintenance",
    structureHash: activityPlanStructureHash(structure),
    semanticHash: activityPlanSemanticHash({
      structure,
      adaptation: null,
      trainingIntent: "general_maintenance",
    }),
  };
}

describe("new-selection resolver candidates", () => {
  it("rejects a historically valid but policy-invalid explicit selection", () => {
    expect(() => toVerifiedResolverCandidate(candidate())).toThrow(ZodError);
    expect(toVerifiedResolverCandidate(candidate("work"))).toMatchObject({ revision: 1 });
  });
  it("skips policy-invalid historical candidates for automatic selection without hiding explicit failures", () => {
    const historical = candidate();
    const current = candidate("work");
    expect(toVerifiedResolverCandidates([historical, current], []).map((item) => item.id)).toEqual([
      current.id,
    ]);
    expect(() => toVerifiedResolverCandidates([historical, current], [historical.id])).toThrow(
      ZodError,
    );
  });
  it("does not swallow integrity errors during automatic selection", () => {
    expect(() =>
      toVerifiedResolverCandidates([{ ...candidate("work"), semanticHash: "invalid" }], []),
    ).toThrow(ActivityPlanIntegrityError);
  });
});
