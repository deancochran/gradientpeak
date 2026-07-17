import { describe, expect, it } from "vitest";
import { intensityTargetSchemaV2 } from "../../schemas/activity_plan_v2";
import {
  activityTargetCapabilityConfig as transitionalCapabilityConfig,
  activityTargetDomainByType as transitionalDomainByType,
} from "../../schemas/activity_target_capabilities";
import {
  activityTargetCapabilityConfig,
  activityTargetDefinitionByType,
  activityTargetDomainByType,
  activityTargetSchema,
  isTargetTypePermittedForActivity,
  saveableActivityTargetSchema,
} from "..";

describe("modern target authority", () => {
  it("owns discriminators, canonical units, domains, and bounds", () => {
    expect(activityTargetDefinitionByType.speed).toEqual({
      domain: "speed",
      unit: "kilometers_per_hour",
      minimum: 0,
      maximum: 100,
      saveableMaximum: 100,
    });
    expect(activityTargetDomainByType["%FTP"]).toBe("power");
    expect(activityTargetSchema.safeParse({ type: "%FTP", intensity: 300 }).success).toBe(true);
    expect(activityTargetSchema.safeParse({ type: "%FTP", intensity: 301 }).success).toBe(true);
    expect(saveableActivityTargetSchema.safeParse({ type: "%FTP", intensity: 301 }).success).toBe(
      false,
    );
    expect(activityTargetSchema.safeParse({ type: "bpm", intensity: 29 }).success).toBe(false);
    expect(activityTargetSchema.safeParse({ type: "RPE", intensity: 10 }).success).toBe(true);
  });

  it("owns category compatibility without depending on V2", () => {
    expect(isTargetTypePermittedForActivity({ activityCategory: "run", targetType: "speed" })).toBe(
      true,
    );
    expect(isTargetTypePermittedForActivity({ activityCategory: "run", targetType: "watts" })).toBe(
      false,
    );
  });

  it("is reused by transitional V2 schema and capability exports", () => {
    expect(intensityTargetSchemaV2).toBe(activityTargetSchema);
    expect(transitionalCapabilityConfig).toBe(activityTargetCapabilityConfig);
    expect(transitionalDomainByType).toBe(activityTargetDomainByType);
  });
});
