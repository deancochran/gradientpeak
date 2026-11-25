import { describe, expect, it } from "vitest";
import { PLANNED_SESSION_V1_FIXTURES } from "./contracts/client-contract-fixtures";
import {
  buildDirectPlannedSessionCreateInput,
  isPlannedSessionConflict,
} from "./planned-session-client";

describe("buildDirectPlannedSessionCreateInput", () => {
  it("sends only the saved-plan identity needed for a reference-based session", () => {
    const fixture = PLANNED_SESSION_V1_FIXTURES[0];
    const result = buildDirectPlannedSessionCreateInput({
      profileId: fixture.profileId,
      planningDate: fixture.planningDate,
      operationId: "direct-operation-00000000000000000001",
      activityPlanId: fixture.activityPlanId,
    });

    expect(result.session.activityPlanId).toBe(fixture.activityPlanId);
    expect(result.session).not.toHaveProperty("groupEventId");
    expect(result.session).not.toHaveProperty("prescription");
    expect(result.session).not.toHaveProperty("capturedAt");
  });

  it("preserves an explicit null or valid group-event association", () => {
    const fixture = PLANNED_SESSION_V1_FIXTURES[0];
    const base = {
      profileId: fixture.profileId,
      planningDate: fixture.planningDate,
      operationId: "direct-operation-00000000000000000001",
      activityPlanId: fixture.activityPlanId,
    };

    expect(
      buildDirectPlannedSessionCreateInput({ ...base, groupEventId: null }).session,
    ).toMatchObject({
      groupEventId: null,
    });
    expect(
      buildDirectPlannedSessionCreateInput({
        ...base,
        groupEventId: "00000000-0000-4000-8000-000000000001",
      }).session,
    ).toMatchObject({
      groupEventId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("recognizes the finite conflict code without depending on message text", () => {
    expect(isPlannedSessionConflict({ data: { code: "CONFLICT" }, message: "changed" })).toBe(true);
    expect(isPlannedSessionConflict({ data: { code: "BAD_REQUEST" } })).toBe(false);
  });
});
