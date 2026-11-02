import { describe, expect, it } from "vitest";
import { decideProviderActivityMatch } from "./provider-activity-matching";

const incoming = {
  activityCategory: "run" as const,
  elapsedMs: 1_000_000,
  startedAt: new Date("2026-09-01T10:00:00Z"),
};
const probable = {
  ...incoming,
  activityId: "activity-1",
  elapsedMs: 1_050_000,
  startedAt: new Date("2026-09-01T10:02:00Z"),
};

describe("provider activity matching", () => {
  it("always merges exact provider, artifact, or trusted-origin identity", () => {
    expect(
      decideProviderActivityMatch({
        exactActivityId: "exact",
        incoming,
        candidates: [{ ...probable, activityCategory: "bike" }],
      }),
    ).toEqual({ kind: "exact", activityId: "exact" });
  });

  it("creates when no candidate meets every probable rule", () => {
    expect(
      decideProviderActivityMatch({
        exactActivityId: null,
        incoming,
        candidates: [
          { ...probable, activityCategory: "bike" },
          { ...probable, activityId: "late", startedAt: new Date("2026-09-01T10:02:01Z") },
          { ...probable, activityId: "long", elapsedMs: 1_060_001 },
        ],
      }),
    ).toEqual({ kind: "create" });
  });

  it("stages one probable candidate with its target", () => {
    expect(
      decideProviderActivityMatch({ exactActivityId: null, incoming, candidates: [probable] }),
    ).toEqual({ kind: "review", candidateActivityId: "activity-1", candidateCount: 1 });
  });

  it("stages multiple probable candidates without inventing a winner", () => {
    expect(
      decideProviderActivityMatch({
        exactActivityId: null,
        incoming,
        candidates: [probable, { ...probable, activityId: "activity-2" }],
      }),
    ).toEqual({ kind: "review", candidateActivityId: null, candidateCount: 2 });
  });
});
