import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:55322/fixture";
});

import {
  activityArtifactId,
  assertDisposableActivityEvidenceFixture,
  markDisposableAthleteStateDirty,
  processAthleteStateJobs,
  readGoalProgress,
  readThresholdOverview,
  readyActivityIngestion,
  submitActivity,
} from "./activity-evidence-acceptance";

afterEach(() => vi.unstubAllEnvs());

describe("activity evidence acceptance fixture guard", () => {
  it("requires the disposable database marker before exposing fixture writers", async () => {
    vi.stubEnv("E2E_DISPOSABLE_DATABASE", "");
    expect(() => assertDisposableActivityEvidenceFixture()).toThrow(/managed disposable fixture/);
    expect(() => readyActivityIngestion(undefined as never, undefined as never)).toThrow(
      /managed disposable fixture/,
    );
    expect(() => submitActivity(undefined as never, undefined as never)).toThrow(
      /managed disposable fixture/,
    );
    expect(() => activityArtifactId("profile", "sha", 1)).toThrow(/managed disposable fixture/);
    expect(() => readGoalProgress(undefined as never)).toThrow(/managed disposable fixture/);
    expect(() => readThresholdOverview(undefined as never)).toThrow(/managed disposable fixture/);
    await expect(markDisposableAthleteStateDirty(undefined as never)).rejects.toThrow(
      /managed disposable fixture/,
    );
    await expect(processAthleteStateJobs(undefined as never)).rejects.toThrow(
      /managed disposable fixture/,
    );
  });

  it("accepts only the managed disposable marker", () => {
    vi.stubEnv("E2E_DISPOSABLE_DATABASE", "1");
    expect(() => assertDisposableActivityEvidenceFixture()).not.toThrow();
  });
});
