import { describe, it, expect } from "vitest";
import { scoreActivityPlanCandidates } from "../engine";
import type {
  DailyTargetProfile,
  UserContext,
  ActivityPlanCandidate,
} from "../types";

describe("scoreActivityPlanCandidates", () => {
  const defaultContext: UserContext = {
    currentCtl: 50,
    currentAtl: 50,
  };

  const defaultTarget: DailyTargetProfile = {
    targetTss: 60,
    targetZones: ["Z2"],
    effortCategory: "moderate",
  };

  it("should score and rank plans correctly based on TSS, zones, and effort", () => {
    const plans: ActivityPlanCandidate[] = [
      {
        id: "plan-1",
        name: "Perfect Match",
        tss: 60,
        zones: ["Z2"],
        effortCategory: "moderate",
      },
      {
        id: "plan-2",
        name: "Good Match",
        tss: 50, // 10 diff -> 50 * (1 - 10/60) = 41.67
        zones: ["Z2", "Z3"], // 1/1 match -> 30
        effortCategory: "moderate", // match -> 20
      },
      {
        id: "plan-3",
        name: "Poor Match",
        tss: 30, // 30 diff -> 50 * (1 - 30/60) = 25
        zones: ["Z1"], // 0 match -> 0
        effortCategory: "easy", // mismatch -> 0
      },
    ];

    const results = scoreActivityPlanCandidates(
      defaultTarget,
      plans,
      defaultContext,
    );

    expect(results).toHaveLength(3);

    // Perfect Match: 50 (TSS) + 30 (Zone) + 20 (Effort) = 100
    expect(results[0]!.planId).toBe("plan-1");
    expect(results[0]!.score).toBe(100);
    expect(results[0]!.matchRationale).toContain("TSS_MATCH_EXCELLENT");
    expect(results[0]!.matchRationale).toContain("ZONE_MATCH_FULL");
    expect(results[0]!.matchRationale).toContain("EFFORT_MATCH");

    // Good Match: ~42 (TSS) + 30 (Zone) + 20 (Effort) = 92
    expect(results[1]!.planId).toBe("plan-2");
    expect(results[1]!.score).toBe(92);
    expect(results[1]!.matchRationale).toContain("ZONE_MATCH_FULL");
    expect(results[1]!.matchRationale).toContain("EFFORT_MATCH");

    // Poor Match: 25 (TSS) + 0 (Zone) + 0 (Effort) = 25
    expect(results[2]!.planId).toBe("plan-3");
    expect(results[2]!.score).toBe(25);
    expect(results[2]!.matchRationale).toContain("EFFORT_MISMATCH");
  });

  it("should reject plans that push ACWR > 1.5", () => {
    const context: UserContext = {
      currentCtl: 20,
      currentAtl: 25, // Current ACWR = 1.25
    };

    const plans: ActivityPlanCandidate[] = [
      {
        id: "plan-safe",
        name: "Safe Plan",
        tss: 30, // newAtl = 25 + 4.28 = 29.28, newCtl = 20 + 0.71 = 20.71, ACWR = 1.41
        zones: ["Z2"],
        effortCategory: "moderate",
      },
      {
        id: "plan-unsafe",
        name: "Unsafe Plan",
        tss: 100, // newAtl = 25 + 14.28 = 39.28, newCtl = 20 + 2.38 = 22.38, ACWR = 1.75
        zones: ["Z4"],
        effortCategory: "hard",
      },
    ];

    const results = scoreActivityPlanCandidates(defaultTarget, plans, context);

    // Only the safe plan should be returned
    expect(results).toHaveLength(1);
    expect(results[0]!.planId).toBe("plan-safe");
  });

  it("should handle zero target TSS gracefully", () => {
    const target: DailyTargetProfile = {
      targetTss: 0,
      targetZones: [],
      effortCategory: "easy",
    };

    const plans: ActivityPlanCandidate[] = [
      {
        id: "plan-rest",
        name: "Rest Day",
        tss: 0,
        zones: [],
        effortCategory: "easy",
      },
      {
        id: "plan-light",
        name: "Light Activity",
        tss: 20,
        zones: ["Z1"],
        effortCategory: "easy",
      },
    ];

    const results = scoreActivityPlanCandidates(target, plans, defaultContext);

    expect(results).toHaveLength(2);
    expect(results[0]!.planId).toBe("plan-rest");
    expect(results[0]!.score).toBe(100); // 50 (TSS) + 30 (Zone) + 20 (Effort)

    expect(results[1]!.planId).toBe("plan-light");
    expect(results[1]!.score).toBe(80); // 30 (TSS) + 30 (Zone) + 20 (Effort)
  });

  it("should handle partial zone matches", () => {
    const target: DailyTargetProfile = {
      targetTss: 50,
      targetZones: ["Z2", "Z3"],
      effortCategory: "moderate",
    };

    const plans: ActivityPlanCandidate[] = [
      {
        id: "plan-partial",
        name: "Partial Zone Match",
        tss: 50,
        zones: ["Z2", "Z1"],
        effortCategory: "moderate",
      },
    ];

    const results = scoreActivityPlanCandidates(target, plans, defaultContext);

    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBe(85); // 50 (TSS) + 15 (Zone - 1/2 match) + 20 (Effort)
    expect(results[0]!.matchRationale).toContain("ZONE_MATCH_PARTIAL");
  });

  it("should return at most 3 plans", () => {
    const plans: ActivityPlanCandidate[] = Array.from({ length: 5 }).map(
      (_, i) => ({
        id: `plan-${i}`,
        name: `Plan ${i}`,
        tss: 60,
        zones: ["Z2"],
        effortCategory: "moderate",
      }),
    );

    const results = scoreActivityPlanCandidates(
      defaultTarget,
      plans,
      defaultContext,
    );

    expect(results).toHaveLength(3);
  });
});
