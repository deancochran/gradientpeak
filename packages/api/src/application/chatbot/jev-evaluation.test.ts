import { describe, expect, it } from "vitest";
import { runSyntheticJevExperiment, syntheticJevCases } from "./jev-evaluation";

describe("synthetic Jev evaluation contract", () => {
  it("has representative offline fixtures with candidate-specific preference conditions", () => {
    expect(syntheticJevCases).toHaveLength(24);
    expect(new Set(syntheticJevCases.map((item) => item.input.template))).toEqual(
      new Set(["select_activity_plan", "identify_session", "check_preferences"]),
    );
    for (const test of syntheticJevCases) {
      if (test.expectedDecision.candidateId)
        expect(test.input.candidates.map((candidate) => candidate.id)).toContain(
          test.expectedDecision.candidateId,
        );
      for (const question of test.input.questions) expect(question.question).toContain("candidate");
    }
  });

  it("does not derive clarification from the expected outcome or semantic uncertainty", async () => {
    const expectedClarification = syntheticJevCases.find((test) =>
      test.expectedDecision.allowedOutcomes.includes("uncertain"),
    );
    if (!expectedClarification) throw new Error("expected an unresolved synthetic fixture");
    const firstCase = syntheticJevCases[0];
    if (!firstCase) throw new Error("expected a synthetic fixture");
    const observedNoClarification = await runSyntheticJevExperiment(
      [expectedClarification],
      "baseline",
      async () => ({ clarification: false }),
    );
    expect(observedNoClarification.at(0)?.clarification).toBe(false);

    const absentObservation = await runSyntheticJevExperiment(
      [firstCase],
      "baseline",
      async () => undefined,
    );
    expect(absentObservation.at(0)?.clarification).toBeNull();

    const uncertainDecision = await runSyntheticJevExperiment(
      [firstCase],
      "baseline",
      async () => ({
        decision: {
          status: "uncertain",
          confidence: 0.5,
          probabilities: { run_easy_45: 0.5, bike_tempo_45: 0.4, __none__: 0.1 },
          conditions: {},
          evidenceLimits: "based only on supplied candidates/context",
        },
      }),
    );
    expect(uncertainDecision.at(0)?.clarification).toBeNull();
  });

  it("runs serially by default and leaves unobserved metrics unknown", async () => {
    let active = 0;
    let peak = 0;
    const records = await runSyntheticJevExperiment(
      syntheticJevCases.slice(0, 3),
      "baseline",
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return {};
      },
    );
    expect(peak).toBe(1);
    expect(
      records.every((record) => record.taskSuccess === null && record.providerCost === null),
    ).toBe(true);
  });
});
