import {
  athleteCapabilityPlanningProjectionSchema,
  athleteCapabilityProfileSchema,
  capabilityPlanningSelectionContextSchema,
  composeAthleteCapabilityProfile,
  projectAthleteCapabilitiesForPlanning,
} from "@repo/core";
import { describe, expect, it } from "vitest";

describe("athlete capability public exports", () => {
  it("exposes the current profile, planning contracts, and deterministic functions", () => {
    expect(athleteCapabilityProfileSchema).toBeDefined();
    expect(capabilityPlanningSelectionContextSchema).toBeDefined();
    expect(athleteCapabilityPlanningProjectionSchema).toBeDefined();
    expect(composeAthleteCapabilityProfile).toBeTypeOf("function");
    expect(projectAthleteCapabilitiesForPlanning).toBeTypeOf("function");
  });
});
