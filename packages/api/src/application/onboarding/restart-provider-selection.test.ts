import { describe, expect, it, vi } from "vitest";
import { restartOnboardingProviderSelection } from "./restart-provider-selection";

const PROFILE = "11111111-1111-4111-8111-111111111111";

function dbFor(state: "healthy" | "lost" | "recovery") {
  let status = "processing";
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const tx = {
    execute: vi.fn(),
    select: (selection: Record<string, unknown>) => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: async () =>
              state === "lost"
                ? []
                : [
                    {
                      active: true,
                      generation: 1,
                      id: "22222222-2222-4222-8222-222222222222",
                      import_run_id: "33333333-3333-4333-8333-333333333333",
                      job_id: "44444444-4444-4444-8444-444444444444",
                      job_type: "wahoo.activity_history_reconcile",
                      last_error: state === "recovery" ? "failed" : null,
                      payload_import_run_id: "33333333-3333-4333-8333-333333333333",
                      provider: "wahoo",
                      scope: "workouts_read user_read",
                      status: state === "recovery" ? "failed" : "queued",
                    },
                    {
                      active: true,
                      generation: 1,
                      id: "22222222-2222-4222-8222-222222222222",
                      import_run_id: null,
                      job_id: "55555555-5555-4555-8555-555555555555",
                      job_type: "wahoo.profile_enrichment",
                      last_error: null,
                      payload_import_run_id: null,
                      provider: "wahoo",
                      scope: "workouts_read user_read",
                      status: state === "recovery" ? "dead_lettered" : "queued",
                    },
                  ],
          }),
        }),
        where: () => ({
          limit: () => ({
            for: async () => [{ id: PROFILE, onboarding_status: status }],
            then: (resolve: (rows: unknown[]) => void) =>
              resolve(
                "onboarding_status" in selection
                  ? [{ id: PROFILE, onboarding_status: status }]
                  : [],
              ),
          }),
        }),
        limit: () => ({ then: (resolve: (rows: unknown[]) => void) => resolve([]) }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table, values });
        if (typeof values.onboarding_status === "string") status = values.onboarding_status;
        return { where: () => ({ returning: async () => [{ id: PROFILE }] }) };
      },
    }),
  };
  return {
    db: { transaction: (operation: (value: typeof tx) => Promise<unknown>) => operation(tx) },
    getStatus: () => status,
    updates,
  };
}

describe("restartOnboardingProviderSelection", () => {
  it("rejects healthy processing", async () => {
    const { db } = dbFor("healthy");
    await expect(
      restartOnboardingProviderSelection({ db: db as never, profileId: PROFILE }),
    ).rejects.toMatchObject({ name: "OnboardingRestartConflictError" });
  });

  it("terminates exact failed anchors and returns to provider selection", async () => {
    const { db, getStatus, updates } = dbFor("recovery");
    await expect(
      restartOnboardingProviderSelection({ db: db as never, profileId: PROFILE }),
    ).resolves.toEqual({ status: "provider_selection" });
    expect(getStatus()).toBe("provider_selection");
    expect(updates.some(({ values }) => values.status === "dead_lettered")).toBe(true);
    expect(updates.some(({ values }) => values.status === "cancelled")).toBe(true);
  });

  it("executes lost-anchor recovery without terminating unrelated work", async () => {
    const { db, getStatus, updates } = dbFor("lost");
    await expect(
      restartOnboardingProviderSelection({ db: db as never, profileId: PROFILE }),
    ).resolves.toEqual({ status: "provider_selection" });
    expect(getStatus()).toBe("provider_selection");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.values).toMatchObject({ onboarding_status: "provider_selection" });
  });
});
