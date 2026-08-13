import { defaultAthletePreferenceProfile } from "@repo/core";
import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import { describe, expect, it, vi } from "vitest";
import {
  completedOnboardingReplayMatches,
  getOnboardingGoalId,
} from "../../repositories/onboarding-lifecycle-repository";
import { completeLifecycleSetup } from "./complete-lifecycle-setup";

vi.mock("../wahoo-profile-setup-service", () => ({
  WahooProfileSetupService: class {
    async getSetupData() {
      return {
        profile: { dob: null, gender: null, onboarding_status: "completed" },
        sources: {},
        values: {},
      };
    }
  },
}));

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const profile: CompleteOnboarding = {
  full_name: "Lifecycle Athlete",
  username: "lifecycle-athlete",
  experience_level: "skip",
  intents: ["train_event"],
  baseline_field_sources: {},
};
const goal = {
  target_date: "2026-09-13",
  title: "Finish 5K",
  priority: 1,
  activity_category: "run" as const,
  target_payload: {
    type: "completion" as const,
    activity_category: "run" as const,
    distance_m: 5000,
  },
};

function createCompletedDb(overrides?: { fullName?: string; goalTitle?: string }) {
  const inserts = vi.fn();
  const updates = vi.fn();
  const desiredSettings = {
    ...defaultAthletePreferenceProfile,
    onboarding_intents: profile.intents,
  };
  const tx = {
    select: vi.fn((selection: Record<string, unknown>) => ({
      from: vi.fn(() => ({
        where: () => {
          if ("calculation_version" in selection) return Promise.resolve([]);
          return {
            limit: () => {
              if ("onboarding_status" in selection || "full_name" in selection) {
                const row = {
                  id: PROFILE_ID,
                  onboarding_status: "completed",
                  dob: null,
                  full_name: overrides?.fullName ?? profile.full_name,
                  gender: null,
                  planning_timezone: null,
                  username: profile.username,
                };
                return { for: async () => [row] };
              }
              if ("target_payload" in selection) {
                return Promise.resolve([
                  {
                    id: getOnboardingGoalId(PROFILE_ID),
                    profile_id: PROFILE_ID,
                    ...goal,
                    title: overrides?.goalTitle ?? goal.title,
                  },
                ]);
              }
              if ("settings" in selection) {
                return { for: async () => [{ settings: desiredSettings }] };
              }
              return Promise.resolve([]);
            },
          };
        },
      })),
    })),
    insert: inserts,
    update: updates,
  };
  const db = {
    transaction: (operation: (value: typeof tx) => Promise<unknown>) => operation(tx),
  };
  return { db, inserts, updates };
}

describe("completeLifecycleSetup completed replay", () => {
  it("returns already_completed without duplicate writes for an exact response-loss retry", async () => {
    const { db, inserts, updates } = createCompletedDb();
    await expect(
      completeLifecycleSetup({ db: db as never, profileId: PROFILE_ID, profile, goal }),
    ).resolves.toEqual({
      status: "already_completed",
      goal: { status: "unchanged" },
      settings: { status: "unchanged" },
      created: { profile_metrics: 0 },
    });
    expect(inserts).not.toHaveBeenCalled();
    expect(updates).not.toHaveBeenCalled();
  });

  it("rejects a completed replay whose persisted profile does not match", async () => {
    const { db, inserts, updates } = createCompletedDb({ fullName: "Different Athlete" });
    await expect(
      completeLifecycleSetup({ db: db as never, profileId: PROFILE_ID, profile, goal }),
    ).rejects.toMatchObject({ name: "OnboardingCompletedReplayConflictError" });
    expect(inserts).not.toHaveBeenCalled();
    expect(updates).not.toHaveBeenCalled();
  });

  it("rejects a completed replay whose deterministic goal content does not match", async () => {
    const { db } = createCompletedDb({ goalTitle: "Different goal" });
    await expect(
      completeLifecycleSetup({ db: db as never, profileId: PROFILE_ID, profile, goal }),
    ).rejects.toMatchObject({ name: "OnboardingCompletedReplayConflictError" });
  });
});

describe("completedOnboardingReplayMatches", () => {
  it("accepts only an exact persisted proof", () => {
    expect(
      completedOnboardingReplayMatches({
        goalMatches: true,
        metricsMatch: true,
        profileMatches: true,
        settingsMatch: true,
      }),
    ).toBe(true);
    expect(
      completedOnboardingReplayMatches({
        goalMatches: true,
        metricsMatch: true,
        profileMatches: false,
        settingsMatch: true,
      }),
    ).toBe(false);
  });
});
