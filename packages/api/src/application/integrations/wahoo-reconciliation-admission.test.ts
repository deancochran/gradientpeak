import { describe, expect, it } from "vitest";
import { admitWahooReconciliation } from "./wahoo-reconciliation-admission";

const enabledEnv = { WAHOO_CLIENT_ID: "client", WAHOO_CLIENT_SECRET: "secret" };
const integration = {
  generation: 4,
  id: "integration-1",
  lifecycle_status: "active" as const,
  profile_id: "profile-1",
  provider: "wahoo",
};

describe("admitWahooReconciliation", () => {
  it("admits a statically supported, enabled, scoped, active generation", () => {
    expect(
      admitWahooReconciliation({
        env: enabledEnv,
        integration,
        scope: "workouts_read offline_data",
        target: "activity_history",
        trigger: "connect",
      }),
    ).toEqual({
      admitted: true,
      generation: 4,
      integrationId: "integration-1",
      profileId: "profile-1",
      target: "activity_history",
      trigger: "connect",
    });
  });

  it.each([
    [{}, integration, "workouts_read offline_data", "runtime_disabled"],
    [
      enabledEnv,
      { ...integration, provider: "garmin" },
      "workouts_read offline_data",
      "wrong_provider",
    ],
    [
      enabledEnv,
      { ...integration, lifecycle_status: "disconnect_pending" as const },
      "workouts_read offline_data",
      "integration_inactive",
    ],
    [
      enabledEnv,
      { ...integration, generation: 0 },
      "workouts_read offline_data",
      "invalid_generation",
    ],
    [enabledEnv, integration, "workouts_read", "missing_scope"],
  ] as const)("rejects a fenced history admission", (env, candidate, scope, reason) => {
    expect(
      admitWahooReconciliation({
        env,
        integration: candidate,
        scope,
        target: "activity_history",
        trigger: "manual",
      }),
    ).toMatchObject({ admitted: false, reason });
  });

  it("requires Wahoo user-read scope for profile enrichment", () => {
    expect(
      admitWahooReconciliation({
        env: enabledEnv,
        integration,
        scope: "user_read",
        target: "profile_enrichment",
        trigger: "manual",
      }),
    ).toMatchObject({ admitted: true, generation: 4 });
    expect(
      admitWahooReconciliation({
        env: enabledEnv,
        integration,
        scope: "workouts_read offline_data",
        target: "profile_enrichment",
        trigger: "manual",
      }),
    ).toMatchObject({ admitted: false, reason: "missing_scope" });
  });
});
