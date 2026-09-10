import { describe, expect, it } from "vitest";
import type { ProviderOnboardingRuntime } from "../integrations/provider-runtime";
import { deriveOnboardingReadiness } from "./readiness";

const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  onboarding_status: "processing" as const,
};
const provider = {
  active: true,
  id: "22222222-2222-4222-8222-222222222222",
  generation: 1,
  provider: "wahoo" as const,
  scope: "workouts_read offline_data user_read",
};

describe("deriveOnboardingReadiness", () => {
  it("reaches terminal readiness with synthetic adapter-defined persisted job roles", () => {
    const syntheticAdapter = {
      identifyOnboardingWork: ({ jobs }) => ({
        historyJobId: jobs.find((job) => job.jobType === "synthetic.import")?.id ?? null,
        profileJobId: jobs.find((job) => job.jobType === "synthetic.identity")?.id ?? null,
        requiredJobTypes: ["synthetic.import", "synthetic.identity"],
        importRunLinked: jobs.some(
          (job) =>
            job.jobType === "synthetic.import" &&
            job.importRunId !== null &&
            job.importRunId === job.payloadImportRunId,
        ),
      }),
    } satisfies Pick<ProviderOnboardingRuntime, "identifyOnboardingWork">;
    const result = deriveOnboardingReadiness(
      {
        profile: { ...profile, onboarding_status: "review" },
        athleteState: null,
        providers: [
          {
            active: true,
            generation: 1,
            id: "synthetic-integration",
            provider: "synthetic" as never,
            scope: "history profile",
            jobs: [
              {
                id: "history",
                import_run_id: "run",
                payload_import_run_id: "run",
                job_type: "synthetic.import",
                status: "completed",
                last_error: null,
              },
              {
                id: "profile",
                import_run_id: null,
                payload_import_run_id: null,
                job_type: "synthetic.identity",
                status: "completed",
                last_error: null,
              },
            ],
            importRun: {
              status: "completed",
              failed_count: 0,
              imported_count: 3,
              skipped_count: 0,
              material_change_count: 0,
            },
          },
        ],
      },
      () => syntheticAdapter,
      () => true,
    );

    expect(result.ready_to_finalize).toBe(true);
    expect(result.providers[0]).toMatchObject({ state: "complete", next_actions: ["review"] });
  });

  it("treats provider profile work as optional when the adapter declares no profile job", () => {
    const historyOnlyAdapter = {
      identifyOnboardingWork: ({ jobs }) => ({
        historyJobId: jobs.find((job) => job.jobType === "synthetic.import")?.id ?? null,
        profileJobId: null,
        requiredJobTypes: ["synthetic.import"],
        importRunLinked: true,
      }),
    } satisfies Pick<ProviderOnboardingRuntime, "identifyOnboardingWork">;
    const result = deriveOnboardingReadiness(
      {
        profile: { ...profile, onboarding_status: "review" },
        athleteState: null,
        providers: [
          {
            active: true,
            generation: 1,
            id: "synthetic-integration",
            provider: "synthetic" as never,
            scope: "history",
            jobs: [
              {
                id: "history",
                import_run_id: "run",
                payload_import_run_id: "run",
                job_type: "synthetic.import",
                status: "completed",
                last_error: null,
              },
            ],
            importRun: {
              status: "completed",
              failed_count: 0,
              imported_count: 1,
              skipped_count: 0,
              material_change_count: 0,
            },
          },
        ],
      },
      () => historyOnlyAdapter,
      () => true,
    );

    expect(result.providers[0]).toMatchObject({
      state: "complete",
      progress: { profile: "complete" },
    });
    expect(result.ready_to_finalize).toBe(true);
  });

  it("preserves a disabled anchored provider and offers restart without retry", () => {
    const roles = {
      identifyOnboardingWork: () => ({
        historyJobId: null,
        profileJobId: null,
        requiredJobTypes: ["disabled.history", "disabled.profile"],
        importRunLinked: false,
      }),
    };
    const result = deriveOnboardingReadiness(
      {
        profile,
        athleteState: null,
        providers: [
          {
            ...provider,
            active: true,
            jobs: [],
            importRun: null,
          },
        ],
      },
      () => roles,
      () => false,
    );

    expect(result.providers[0]).toMatchObject({
      provider: "wahoo",
      state: "recovery_required",
      executable: false,
      integration_active: true,
      next_actions: ["restart_selection"],
    });
    expect(result.next_actions).toEqual(["restart_selection"]);
  });

  it("fails closed when processing has lost its durable provider anchors", () => {
    const result = deriveOnboardingReadiness({ profile, athleteState: null, providers: [] });
    expect(result.ready_to_finalize).toBe(false);
    expect(result.next_actions).toEqual(["restart_selection"]);
  });

  it("treats a successful zero-data initial import as terminal without athlete state", () => {
    const result = deriveOnboardingReadiness({
      profile: { ...profile, onboarding_status: "review" },
      athleteState: null,
      providers: [
        {
          ...provider,
          jobs: [
            {
              id: "history",
              import_run_id: "run",
              payload_import_run_id: "run",
              job_type: "wahoo.activity_history_reconcile",
              status: "completed",
              last_error: null,
            },
            {
              id: "profile",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.profile_enrichment",
              status: "completed",
              last_error: null,
            },
          ],
          importRun: {
            status: "completed",
            failed_count: 0,
            imported_count: 0,
            skipped_count: 0,
            material_change_count: 0,
          },
        },
      ],
    });

    expect(result.providers).toEqual([
      expect.objectContaining({
        state: "complete_no_data",
        next_actions: ["review"],
        progress: { imported_count: 0, skipped_count: 0, failed_count: 0, profile: "complete" },
      }),
    ]);
    expect(result.ready_to_finalize).toBe(true);
  });

  it("fails closed when initial work failed", () => {
    const result = deriveOnboardingReadiness({
      profile,
      athleteState: null,
      providers: [
        {
          ...provider,
          jobs: [
            {
              id: "history",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.activity_history_reconcile",
              status: "dead_lettered",
              last_error: "failed",
            },
            {
              id: "profile",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.profile_enrichment",
              status: "completed",
              last_error: null,
            },
          ],
          importRun: null,
        },
      ],
    });

    expect(result.providers[0]?.state).toBe("recovery_required");
    expect(result.next_actions).toEqual(["retry", "restart_selection"]);
    expect(result.ready_to_finalize).toBe(false);
  });

  it("keeps processing while retryable profile enrichment waits for its scheduled retry", () => {
    const result = deriveOnboardingReadiness({
      profile,
      athleteState: null,
      providers: [
        {
          ...provider,
          jobs: [
            {
              id: "history",
              import_run_id: "run",
              payload_import_run_id: "run",
              job_type: "wahoo.activity_history_reconcile",
              status: "completed",
              last_error: null,
            },
            {
              id: "profile",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.profile_enrichment",
              status: "failed",
              last_error: "wahoo_profile_enrichment_failed",
            },
          ],
          importRun: {
            status: "completed",
            failed_count: 0,
            imported_count: 231,
            skipped_count: 0,
            material_change_count: 0,
          },
        },
      ],
    });

    expect(result.providers[0]).toMatchObject({
      state: "queued",
      next_actions: ["wait"],
      progress: { profile: "queued" },
    });
    expect(result.next_actions).toEqual(["wait"]);
  });

  it("fails closed when the anchored integration becomes inactive", () => {
    const result = deriveOnboardingReadiness({
      profile,
      athleteState: null,
      providers: [{ ...provider, active: false, jobs: [], importRun: null }],
    });
    expect(result.providers[0]?.state).toBe("recovery_required");
  });

  it("does not accept a completed run without the history job's exact link", () => {
    const result = deriveOnboardingReadiness({
      profile,
      athleteState: null,
      providers: [
        {
          ...provider,
          jobs: [
            {
              id: "history",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.activity_history_reconcile",
              status: "completed",
              last_error: null,
            },
            {
              id: "profile",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.profile_enrichment",
              status: "completed",
              last_error: null,
            },
          ],
          importRun: {
            status: "completed",
            failed_count: 0,
            imported_count: 1,
            skipped_count: 0,
            material_change_count: 0,
          },
        },
      ],
    });
    expect(result.providers[0]?.state).toBe("recovery_required");
  });

  it("rejects a disagreement between the history column and payload import-run identities", () => {
    const result = deriveOnboardingReadiness({
      profile,
      athleteState: null,
      providers: [
        {
          ...provider,
          jobs: [
            {
              id: "history",
              import_run_id: "run-a",
              payload_import_run_id: "run-b",
              job_type: "wahoo.activity_history_reconcile",
              status: "completed",
              last_error: null,
            },
            {
              id: "profile",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.profile_enrichment",
              status: "completed",
              last_error: null,
            },
          ],
          importRun: {
            status: "completed",
            failed_count: 0,
            imported_count: 1,
            skipped_count: 0,
            material_change_count: 0,
          },
        },
      ],
    });
    expect(result.providers[0]?.state).toBe("recovery_required");
  });

  it("does not block review when an import completes with failed items", () => {
    const result = deriveOnboardingReadiness({
      profile: { ...profile, onboarding_status: "review" },
      athleteState: { source_revision: 3, published_revision: 3 },
      providers: [
        {
          ...provider,
          jobs: [
            {
              id: "history",
              import_run_id: "run",
              payload_import_run_id: "run",
              job_type: "wahoo.activity_history_reconcile",
              status: "completed",
              last_error: null,
            },
            {
              id: "profile",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.profile_enrichment",
              status: "completed",
              last_error: null,
            },
          ],
          importRun: {
            status: "completed",
            failed_count: 1,
            imported_count: 3,
            skipped_count: 0,
            material_change_count: 3,
          },
        },
      ],
    });
    expect(result.providers[0]).toMatchObject({ state: "complete", next_actions: ["review"] });
    expect(result.ready_to_finalize).toBe(true);
  });

  it("waits for a material athlete-state revision to publish", () => {
    const result = deriveOnboardingReadiness({
      profile,
      athleteState: { source_revision: 2, published_revision: 1 },
      providers: [
        {
          ...provider,
          jobs: [
            {
              id: "history",
              import_run_id: "run",
              payload_import_run_id: "run",
              job_type: "wahoo.activity_history_reconcile",
              status: "completed",
              last_error: null,
            },
            {
              id: "profile",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.profile_enrichment",
              status: "completed",
              last_error: null,
            },
          ],
          importRun: {
            status: "completed",
            failed_count: 0,
            imported_count: 4,
            skipped_count: 0,
            material_change_count: 4,
          },
        },
      ],
    });

    expect(result.providers[0]?.state).toBe("deriving");
    expect(result.next_actions).toEqual(["wait"]);
  });

  it("does not block review on an unpublished revision whose evidence begins in the future", () => {
    const result = deriveOnboardingReadiness({
      profile,
      athleteState: {
        dirty_from_at: new Date(Date.now() + 60_000),
        source_revision: 2,
        published_revision: 1,
      },
      providers: [
        {
          ...provider,
          jobs: [
            {
              id: "history",
              import_run_id: "run",
              payload_import_run_id: "run",
              job_type: "wahoo.activity_history_reconcile",
              status: "completed",
              last_error: null,
            },
            {
              id: "profile",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.profile_enrichment",
              status: "completed",
              last_error: null,
            },
          ],
          importRun: {
            status: "completed",
            failed_count: 0,
            imported_count: 4,
            skipped_count: 1,
            material_change_count: 4,
          },
        },
      ],
    });

    expect(result.providers[0]?.state).toBe("complete");
  });

  it("does not require athlete state for imported rows without durable material change", () => {
    const result = deriveOnboardingReadiness({
      profile: { ...profile, onboarding_status: "review" },
      athleteState: null,
      providers: [
        {
          ...provider,
          jobs: [
            {
              id: "history",
              import_run_id: "run",
              payload_import_run_id: "run",
              job_type: "wahoo.activity_history_reconcile",
              status: "completed",
              last_error: null,
            },
            {
              id: "profile",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.profile_enrichment",
              status: "completed",
              last_error: null,
            },
          ],
          importRun: {
            status: "completed",
            failed_count: 0,
            imported_count: 4,
            skipped_count: 0,
            material_change_count: 0,
          },
        },
      ],
    });

    expect(result.providers[0]?.state).toBe("complete");
    expect(result.ready_to_finalize).toBe(true);
  });
});
