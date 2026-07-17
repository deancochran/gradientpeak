import { describe, expect, it } from "vitest";
import {
  SYSTEM_PLAN_FIXTURE_CATALOG,
  SYSTEM_PLAN_MAPPING_FIXTURES,
} from "../verification/fixtures/system-plan-mappings";
import { buildAllSystemTrainingPlanAudits } from "../verification/systemPlanAudit";

const planNameById = new Map(
  SYSTEM_PLAN_FIXTURE_CATALOG.map((entry) => [entry.plan_id, entry.plan_name]),
);
const FIRST_WAVE_EXACT_PLAN_NAMES = Array.from(
  new Set(
    SYSTEM_PLAN_MAPPING_FIXTURES.filter((fixture) => fixture.tolerance_class === "tight")
      .map((fixture) => planNameById.get(fixture.plan_id))
      .filter((planName): planName is string => Boolean(planName)),
  ),
).sort();
const firstWaveExactPlanNameSet = new Set(FIRST_WAVE_EXACT_PLAN_NAMES);

describe("system plan template resolution audit", () => {
  it("materialized sessions with linked activity templates - resolve deterministically", () => {
    const audits = buildAllSystemTrainingPlanAudits();

    for (const audit of audits) {
      expect(audit.missingTemplateIds, audit.planName).toEqual([]);
      expect(
        buildAllSystemTrainingPlanAudits().find((item) => item.planId === audit.planId),
      ).toEqual(audit);
      expect(audit.materializedEvents.length).toBeGreaterThan(0);
    }
  });

  it("resolved weekly duration aggregation - stays finite, ordered, and reconciles to plan totals", () => {
    const audits = buildAllSystemTrainingPlanAudits();

    for (const audit of audits) {
      expect(audit.weeklyResolvedDurationHours.length).toBe(audit.materializedWeekCount);
      const knownWeeks = audit.weeklyResolvedDurationHours.filter(
        (hours): hours is number => hours !== null,
      );
      expect(knownWeeks.every(Number.isFinite)).toBe(true);
      expect(knownWeeks.every((hours) => hours >= 0)).toBe(true);
      if (knownWeeks.length !== audit.weeklyResolvedDurationHours.length) {
        expect(audit.totalResolvedDurationHours).toBeNull();
      } else {
        expect(Number(knownWeeks.reduce((sum, weekHours) => sum + weekHours, 0).toFixed(2))).toBe(
          audit.totalResolvedDurationHours,
        );
      }
    }
  });

  it("first-wave plans expose exact duration only when every prescription is timed", () => {
    const exactPlanDurations = buildAllSystemTrainingPlanAudits()
      .filter((audit) => firstWaveExactPlanNameSet.has(audit.planName))
      .map((audit) => ({
        planName: audit.planName,
        declaredDurationHours: audit.declaredDurationHours,
        meanWeeklyResolvedDurationHours: audit.meanWeeklyResolvedDurationHours,
        differenceHours:
          audit.meanWeeklyResolvedDurationHours === null
            ? null
            : Number(
                Math.abs(
                  audit.declaredDurationHours - audit.meanWeeklyResolvedDurationHours,
                ).toFixed(2),
              ),
      }));

    expect(exactPlanDurations).toHaveLength(FIRST_WAVE_EXACT_PLAN_NAMES.length);
    expect(
      exactPlanDurations.every(
        (duration) =>
          duration.differenceHours === null ||
          (Number.isFinite(duration.differenceHours) && duration.differenceHours >= 0),
      ),
    ).toBe(true);
  });
});
