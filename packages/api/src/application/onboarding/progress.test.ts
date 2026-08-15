import { describe, expect, it } from "vitest";
import {
  deriveOnboardingProgress,
  deriveRecoveryMilestone,
  onboardingProgressSchema,
} from "./progress";
import type { OnboardingReadiness } from "./readiness";

type ProviderState = OnboardingReadiness["providers"][number]["state"];

function readiness(
  states: ProviderState[],
  status: OnboardingReadiness["status"] = "processing",
): OnboardingReadiness {
  return {
    status,
    ready_to_finalize: status === "review",
    next_actions: ["wait"],
    providers: states.map((state, index) => ({
      provider: "wahoo" as const,
      state,
      executable: true,
      integration_active: true,
      progress: {
        imported_count: index === 0 ? 1 : 0,
        skipped_count: 0,
        failed_count: 0,
        profile: "complete" as const,
      },
      next_actions: state === "recovery_required" ? ["retry" as const] : ["wait" as const],
    })),
  };
}

describe("deriveOnboardingProgress", () => {
  it.each([
    ["connected", "preparing_accounts", 25],
    ["queued", "importing_activities", 50],
    ["importing", "importing_activities", 50],
    ["deriving", "building_targets", 75],
    ["complete", "building_targets", 75],
    ["complete_no_data", "building_targets", 75],
    ["complete_with_limitations", "building_targets", 75],
  ] as const)("maps %s to %s at %s", (state, phase, percent) => {
    expect(deriveOnboardingProgress(readiness([state]))).toMatchObject({ phase, percent });
  });

  it("uses the least advanced unresolved provider", () => {
    expect(deriveOnboardingProgress(readiness(["deriving", "importing"]))).toMatchObject({
      phase: "importing_activities",
      percent: 50,
    });
  });

  it.each([25, 50, 75] as const)("reports truthful durable recovery milestone %s", (milestone) => {
    const progress = deriveOnboardingProgress(
      readiness(["recovery_required"]),
      new Map([["wahoo", milestone]]),
    );
    expect(progress).toMatchObject({
      phase: "recovery_required",
      percent: milestone,
      recovery: { provider: "wahoo", action: "retry" },
    });
  });

  it("derives recovery high-water only from exact durable import and completed work", () => {
    const base = {
      active: true,
      generation: 1,
      id: "integration",
      provider: "wahoo" as const,
      scope: "workouts_read user_read",
      jobs: [
        {
          id: "history",
          import_run_id: "run",
          payload_import_run_id: "run",
          job_type: "wahoo.activity_history_reconcile",
          status: "failed",
          last_error: "not exposed",
        },
        {
          id: "profile",
          import_run_id: null,
          payload_import_run_id: null,
          job_type: "wahoo.profile_enrichment",
          status: "failed",
          last_error: "not exposed",
        },
      ],
      importRun: {
        status: "failed" as const,
        imported_count: 2,
        skipped_count: 0,
        failed_count: 1,
        material_change_count: 2,
      },
    };
    expect(deriveRecoveryMilestone(base)).toBe(50);
    expect(
      deriveRecoveryMilestone({
        ...base,
        jobs: base.jobs.map((job) => ({ ...job, status: "completed" })),
        importRun: { ...base.importRun, status: "completed" },
      }),
    ).toBe(75);
  });

  it("uses restart selection when retry is unavailable", () => {
    const input = readiness(["recovery_required"]);
    const provider = input.providers[0];
    if (!provider) throw new Error("Expected provider fixture");
    input.providers[0] = { ...provider, next_actions: ["restart_selection"] };
    expect(deriveOnboardingProgress(input).recovery).toMatchObject({
      action: "restart_selection",
    });
  });

  it("chooses the first anchored recovery deterministically and summarizes every failure", () => {
    const input = readiness(["recovery_required", "recovery_required"]);
    const secondProvider = input.providers[1];
    if (!secondProvider) throw new Error("Expected second provider fixture");
    secondProvider.next_actions = ["restart_selection"];
    const progress = deriveOnboardingProgress(input);
    expect(progress.recovery).toMatchObject({ provider: "wahoo", action: "retry" });
    expect(progress.provider_summary.map((provider) => provider.state)).toEqual([
      "needs_attention",
      "needs_attention",
    ]);
  });

  it("keeps detail factual, grammatical, and omits zero exceptions", () => {
    const progress = deriveOnboardingProgress(readiness(["importing"]));
    expect(progress.detail).toBe("1 activity imported so far.");
    expect(JSON.stringify(progress)).not.toMatch(/last_error|cursor|secret failure/);
  });

  it("returns honest empty terminal detail and satisfies the strict schema", () => {
    const input = readiness(["complete_no_data"], "review");
    const provider = input.providers[0];
    if (!provider) throw new Error("Expected provider fixture");
    provider.progress.imported_count = 0;
    const progress = deriveOnboardingProgress(input);
    expect(progress.detail).toBe("No activities were available to import.");
    expect(onboardingProgressSchema.parse(progress)).toEqual(progress);
  });

  it("never reports ready before review is persisted", () => {
    expect(deriveOnboardingProgress(readiness(["complete"]))).toMatchObject({
      status: "processing",
      phase: "building_targets",
      percent: 75,
      message: "Finalizing your starting point.",
    });
    expect(deriveOnboardingProgress(readiness(["complete"], "review"))).toMatchObject({
      status: "review",
      phase: "ready",
      percent: 100,
    });
  });

  it("keeps empty provider selection at the first milestone", () => {
    expect(deriveOnboardingProgress(readiness([], "provider_selection"))).toMatchObject({
      phase: "preparing_accounts",
      percent: 25,
      recovery: null,
    });
  });

  it("reports terminal limitations without inventing counts", () => {
    const input = readiness(["complete_with_limitations"], "review");
    const provider = input.providers[0];
    if (!provider) throw new Error("Expected provider fixture");
    provider.progress.imported_count = 0;
    expect(deriveOnboardingProgress(input).detail).toBe(
      "Preparation completed with limited activity evidence.",
    );
  });

  it("fails closed when processing has no durable provider anchor", () => {
    const progress = deriveOnboardingProgress(readiness([]));
    expect(progress).toMatchObject({
      phase: "recovery_required",
      percent: 25,
      recovery: { action: "restart_selection" },
    });
  });
});
