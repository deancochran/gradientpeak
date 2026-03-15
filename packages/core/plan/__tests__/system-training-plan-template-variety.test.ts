import { describe, expect, it } from "vitest";

import { buildSystemActivityTemplateCatalog } from "../verification/activityTemplateCatalog";
import {
  analyzeTrainingPlanTemplateVariety,
  buildTrainingPlanTemplateDependencyMap,
} from "../verification/trainingPlanTemplateVariety";

describe("system training-plan template variety", () => {
  it("keeps first-wave representative plans above weak-variety and over-reuse gates", () => {
    const analyses = analyzeTrainingPlanTemplateVariety().filter(
      (analysis) => analysis.gate_scope === "first-wave",
    );

    expect(analyses.map((analysis) => analysis.plan_name)).toEqual([
      "5K Speed Block (8 weeks)",
      "Cycling Endurance Builder (12 weeks)",
      "Half Marathon Build (10 weeks)",
      "Marathon Foundation (12 weeks)",
    ]);
    expect(
      analyses.every(
        (analysis) =>
          analysis.unique_template_count >= 4 &&
          analysis.dominant_template_share <= 0.5 &&
          analysis.unresolved_template_ids.length === 0 &&
          analysis.weak_variety === false &&
          analysis.over_reuse === false,
      ),
    ).toBe(true);
  });

  it("keeps audit-only plans visible without mixing their scope into first-wave gates", () => {
    const analyses = analyzeTrainingPlanTemplateVariety().filter(
      (analysis) => analysis.gate_scope === "audit-only",
    );

    expect(analyses.map((analysis) => analysis.plan_name)).toEqual([
      "General Fitness Maintenance (6 weeks)",
      "Sprint Triathlon Base (10 weeks)",
    ]);
  });

  it("builds normalized dependency entries for newly linked long-session variants", () => {
    const catalog = buildSystemActivityTemplateCatalog();
    const dependencyMap = buildTrainingPlanTemplateDependencyMap();
    const racePaceLongTemplate = catalog.find(
      (entry) => entry.template_name === "Marathon Pace Long Run",
    );
    const progressiveLongRideTemplate = catalog.find(
      (entry) => entry.template_name === "Progressive Long Endurance Ride",
    );

    expect(
      dependencyMap.find(
        (entry) => entry.template_id === racePaceLongTemplate?.template_id,
      ),
    ).toMatchObject({
      dependent_plans: [
        {
          plan_name: "Half Marathon Build (10 weeks)",
          reuse_count: 2,
        },
      ],
      reuse_count: 2,
    });

    expect(
      dependencyMap.find(
        (entry) =>
          entry.template_id === progressiveLongRideTemplate?.template_id,
      ),
    ).toMatchObject({
      dependent_plans: [
        {
          plan_name: "Cycling Endurance Builder (12 weeks)",
          reuse_count: 3,
        },
      ],
      reuse_count: 3,
    });
  });
});
