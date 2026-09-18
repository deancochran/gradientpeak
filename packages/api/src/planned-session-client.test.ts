import { describe, expect, it } from "vitest";
import { PLANNED_SESSION_V1_FIXTURES } from "./contracts/client-contract-fixtures";
import {
  buildDirectPlannedSessionCreateInput,
  isPlannedSessionConflict,
} from "./planned-session-client";

describe("buildDirectPlannedSessionCreateInput", () => {
  it("sends only the saved-plan identity needed for a server-owned snapshot", () => {
    const fixture = PLANNED_SESSION_V1_FIXTURES[0];
    const result = buildDirectPlannedSessionCreateInput({
      profileId: fixture.profileId,
      planningDate: fixture.planningDate,
      operationId: "direct-operation-00000000000000000001",
      activityPlanId: fixture.prescription.resolutionManifest.activity_plan_id,
    });

    expect(result.session.activityPlanId).toBe(
      fixture.prescription.resolutionManifest.activity_plan_id,
    );
    expect(result.session).not.toHaveProperty("prescription");
    expect(result.session).not.toHaveProperty("capturedAt");
  });

  it("recognizes the finite conflict code without depending on message text", () => {
    expect(isPlannedSessionConflict({ data: { code: "CONFLICT" }, message: "changed" })).toBe(true);
    expect(isPlannedSessionConflict({ data: { code: "BAD_REQUEST" } })).toBe(false);
  });
});
