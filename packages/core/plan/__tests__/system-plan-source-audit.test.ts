import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ALL_SAMPLE_PLANS } from "../../samples";
import {
  buildAllSystemTrainingPlanAudits,
  extractSeededSystemTrainingPlanIds,
  migrationSeedsLinkedActivityPlanIds,
} from "../verification/systemPlanAudit";

const TRAINING_PLAN_MIGRATION_PATH = resolve(
  __dirname,
  "../../../db/supabase/migrations/20260308173500_remake_system_training_plan_templates.sql",
);

describe("system plan source audit", () => {
  it("code registry and curated SQL migration - stay aligned on system training-plan ids while exposing linkage drift", () => {
    const migrationSql = readFileSync(TRAINING_PLAN_MIGRATION_PATH, "utf8");

    expect(extractSeededSystemTrainingPlanIds(migrationSql)).toEqual(
      ALL_SAMPLE_PLANS.map((plan) => plan.id),
    );
    expect(migrationSeedsLinkedActivityPlanIds(migrationSql)).toBe(false);
  });

  it("first-wave exact plans - now materialize their advertised week spans", () => {
    const spanMismatches = buildAllSystemTrainingPlanAudits()
      .filter(
        (audit) =>
          audit.advertisedWeekCount !== null &&
          audit.advertisedWeekCount !== audit.materializedWeekCount,
      )
      .map((audit) => ({
        planName: audit.planName,
        advertisedWeekCount: audit.advertisedWeekCount,
        materializedWeekCount: audit.materializedWeekCount,
      }));

    expect(spanMismatches).toEqual([
      {
        planName: "Sprint Triathlon Base (10 weeks)",
        advertisedWeekCount: 10,
        materializedWeekCount: 2,
      },
      {
        planName: "General Fitness Maintenance (6 weeks)",
        advertisedWeekCount: 6,
        materializedWeekCount: 3,
      },
    ]);
  });
});
