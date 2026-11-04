import { describe, expect, it, vi } from "vitest";
import { retryOnboardingProviderProcessing } from "./retry-provider-processing";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "22222222-2222-4222-8222-222222222222";
const enqueue = vi.hoisted(() =>
  vi.fn(async (_tx: unknown, _input: Record<string, unknown>) => ({
    id: crypto.randomUUID(),
    status: "queued",
  })),
);

vi.mock("../../infrastructure/repositories", () => ({
  createWahooSyncRepository: () => ({ enqueueJobInTransaction: enqueue }),
}));

function dbFor(input: { status?: string; failed?: boolean; profileId?: string } = {}) {
  const profileId = input.profileId ?? PROFILE_ID;
  const jobRows = [
    {
      id: "history",
      job_type: "wahoo.activity_history_reconcile",
      status: input.failed === false ? "queued" : "dead_lettered",
      last_error: "failed",
    },
    {
      id: "profile",
      job_type: "wahoo.profile_enrichment",
      status: "completed",
      last_error: null,
    },
  ];
  const tx = {
    execute: vi.fn(),
    transaction: undefined,
    select: (selection: Record<string, unknown>) => ({
      from: (_table: unknown) => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () =>
              Promise.resolve([
                {
                  active: true,
                  id: INTEGRATION_ID,
                  generation: 1,
                  provider: "wahoo",
                  scope: "workouts_read offline_data user_read",
                  job_id: "history",
                  import_run_id: null,
                  payload_import_run_id: null,
                  job_type: "wahoo.activity_history_reconcile",
                  status: input.failed === false ? "queued" : "dead_lettered",
                  last_error: "failed",
                },
                {
                  active: true,
                  id: INTEGRATION_ID,
                  generation: 1,
                  provider: "wahoo",
                  scope: "workouts_read offline_data user_read",
                  job_id: "profile",
                  import_run_id: null,
                  payload_import_run_id: null,
                  job_type: "wahoo.profile_enrichment",
                  status: "completed",
                  last_error: null,
                },
              ]),
          }),
        }),
        where: () => ({
          limit: () =>
            Object.assign(
              Promise.resolve(
                "onboarding_status" in selection
                  ? [{ id: profileId, onboarding_status: input.status ?? "processing" }]
                  : [],
              ),
              {
                for: async () => [
                  "onboarding_status" in selection
                    ? { id: profileId, onboarding_status: input.status ?? "processing" }
                    : { published_revision: 1, source_revision: 1 },
                ],
              },
            ),
          orderBy: () =>
            "job_type" in selection ? Promise.resolve(jobRows) : { limit: async () => [] },
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: "history" }],
        }),
      }),
    }),
  };
  return { transaction: (operation: (value: typeof tx) => Promise<unknown>) => operation(tx) };
}

describe("retryOnboardingProviderProcessing", () => {
  it("re-admits only terminal failed owner work while preserving provider identity", async () => {
    enqueue.mockClear();
    await expect(
      retryOnboardingProviderProcessing({
        db: dbFor() as never,
        profileId: PROFILE_ID,
        provider: "wahoo",
      }),
    ).resolves.toEqual({ provider: "wahoo", status: "processing", queued: true });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects recovery after selection has closed into review", async () => {
    await expect(
      retryOnboardingProviderProcessing({
        db: dbFor({ status: "review" }) as never,
        profileId: PROFILE_ID,
        provider: "wahoo",
      }),
    ).rejects.toMatchObject({ name: "OnboardingStatusConflictError" });
  });
});
