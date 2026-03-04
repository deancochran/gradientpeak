import type {
  DailyTargetProfile,
  UserContext,
  ActivityPlanCandidate,
  RecommendationResult,
} from "./types";

/**
 * Scores and recommends activity plans based on daily targets and user context.
 *
 * @param target - Daily target profile (target TSS, target zones, effort category)
 * @param plans - Array of available activity plan candidates
 * @param context - User's current state (CTL, ATL)
 * @returns Top 3 recommended plans with match scores and rationale codes
 */
export function scoreActivityPlanCandidates(
  target: DailyTargetProfile,
  plans: ActivityPlanCandidate[],
  context: UserContext,
): RecommendationResult[] {
  const results: RecommendationResult[] = [];

  for (const plan of plans) {
    // 1. ACWR Safety Check
    const newAtl = context.currentAtl + plan.tss / 7;
    const newCtl = context.currentCtl + plan.tss / 42;

    // Handle edge case where CTL is 0 to avoid division by zero
    // If both are 0, ACWR is 0. If newCtl is very small, cap it or handle it.
    const acwr = newCtl > 0 ? newAtl / newCtl : 0;

    if (acwr > 1.5) {
      results.push({
        planId: plan.id,
        score: 0,
        matchRationale: ["REJECTED_ACWR_UNSAFE"],
        isRejected: true,
        rejectionReason: `ACWR would exceed 1.5 (${acwr.toFixed(2)})`,
      });
      continue;
    }

    const matchRationale: string[] = [];
    let totalScore = 0;

    // 2. TSS Proximity (Max 50 points)
    const tssDiff = Math.abs(plan.tss - target.targetTss);
    const tssDiffPercent =
      target.targetTss > 0 ? tssDiff / target.targetTss : 0;

    let tssScore = 0;
    if (target.targetTss === 0) {
      tssScore = plan.tss === 0 ? 50 : Math.max(0, 50 - plan.tss);
    } else {
      tssScore = Math.max(0, 50 * (1 - tssDiffPercent));
    }
    totalScore += tssScore;

    if (tssDiffPercent <= 0.1) {
      matchRationale.push("TSS_MATCH_EXCELLENT");
    } else if (tssDiffPercent <= 0.2) {
      matchRationale.push("TSS_MATCH_GOOD");
    }

    // 3. Zone Alignment (Max 30 points)
    let zoneScore = 0;
    if (target.targetZones.length === 0) {
      zoneScore = 30;
      matchRationale.push("ZONE_MATCH_FULL");
    } else {
      const matchedZones = plan.zones.filter((z) =>
        target.targetZones.includes(z),
      );
      zoneScore = 30 * (matchedZones.length / target.targetZones.length);

      if (matchedZones.length === target.targetZones.length) {
        matchRationale.push("ZONE_MATCH_FULL");
      } else if (matchedZones.length > 0) {
        matchRationale.push("ZONE_MATCH_PARTIAL");
      }
    }
    totalScore += zoneScore;

    // 4. Effort Match (Max 20 points)
    let effortScore = 0;
    if (plan.effortCategory === target.effortCategory) {
      effortScore = 20;
      matchRationale.push("EFFORT_MATCH");
    } else {
      matchRationale.push("EFFORT_MISMATCH");
    }
    totalScore += effortScore;

    results.push({
      planId: plan.id,
      score: Math.round(totalScore),
      matchRationale,
      isRejected: false,
    });
  }

  // Sort by score descending and return top 3 valid plans
  return results
    .filter((r) => !r.isRejected)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
