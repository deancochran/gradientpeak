import { describe, expect, it } from "vitest";

import {
  analyzeTrainingPlanTemplateVariety,
  buildTrainingPlanTemplateDependencyMap,
} from "../verification/trainingPlanTemplateVariety";
import { LOCAL_TRAINING_PLAN_FIXTURE } from "./fixtures/local-training-plan-verification";

describe("system training-plan template variety", () => {
  it("keeps retired production-plan analysis empty", () => {
    expect(analyzeTrainingPlanTemplateVariety()).toEqual([]);
  });

  it("counts local fixture template variety without reintroducing production plans", () => {
    const [analysis] = analyzeTrainingPlanTemplateVariety([LOCAL_TRAINING_PLAN_FIXTURE]);
    expect(analysis).toMatchObject({
      plan_name: "Local Run Progression (4 weeks)",
      total_linked_sessions: 11,
      unique_template_count: 3,
      dominant_template_reuse_count: 4,
      weak_variety: false,
    });
  });

  it("builds normalized dependency entries for newly linked long-session variants", () => {
    const dependencyMap = buildTrainingPlanTemplateDependencyMap([LOCAL_TRAINING_PLAN_FIXTURE]);
    expect(dependencyMap.map((entry) => entry.reuse_count).sort()).toEqual([3, 4, 4]);
    expect(
      dependencyMap.every(
        (entry) => entry.dependent_plans[0]?.plan_name === "Local Run Progression (4 weeks)",
      ),
    ).toBe(true);
  });
});
