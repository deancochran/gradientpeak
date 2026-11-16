import { describe, expect, it } from "vitest";

import { ALL_SAMPLE_PLANS, SYSTEM_TEMPLATES } from "../../samples";
import {
  assertSystemTrainingPlanTemplateLinksResolved,
  buildAllSystemTrainingPlanAudits,
} from "../verification/systemPlanAudit";

describe("system plan source audit", () => {
  it("current registry plans link only to current activity templates", () => {
    const audits = ALL_SAMPLE_PLANS.map((plan) =>
      assertSystemTrainingPlanTemplateLinksResolved(plan),
    );
    expect(audits.every((audit) => audit.missingTemplateIds.length === 0)).toBe(true);
    expect(SYSTEM_TEMPLATES).not.toHaveLength(0);
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

    expect(spanMismatches).toEqual([]);
  });
});
