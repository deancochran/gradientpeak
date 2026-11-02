import { manualTrainingDiaryObservationSchema } from "@repo/core/calendar";
import { describe, expect, it } from "vitest";
import { getPlanningDateForClock } from "../training-plan/appliedScheduleUseCases";
import {
  assertManualDiaryDateIsCurrentOrPast,
  ManualDiaryConflictError,
  manualDiaryRequestFingerprint,
} from "./create-manual-diary-entry";

const operationId = "11111111-1111-4111-8111-111111111111";

function observation(input: Partial<Record<string, unknown>> = {}) {
  return manualTrainingDiaryObservationSchema.parse({
    operationId,
    diaryDate: "2026-08-01",
    diaryTimezone: "Pacific/Auckland",
    name: "Diary entry",
    activityCategory: "run",
    ...input,
  });
}

describe("manual diary entry guards", () => {
  it("allows current and past civil dates while rejecting future dates", () => {
    expect(() =>
      assertManualDiaryDateIsCurrentOrPast({
        currentPlanningDate: "2026-08-01",
        diaryDate: "2026-08-01",
      }),
    ).not.toThrow();
    expect(() =>
      assertManualDiaryDateIsCurrentOrPast({
        currentPlanningDate: "2026-08-01",
        diaryDate: "2026-07-31",
      }),
    ).not.toThrow();
    expect(() =>
      assertManualDiaryDateIsCurrentOrPast({
        currentPlanningDate: "2026-08-01",
        diaryDate: "2026-08-02",
      }),
    ).toThrow(ManualDiaryConflictError);
  });

  it("uses the authoritative planning date for planned completion rather than the diary timezone", () => {
    expect(
      getPlanningDateForClock({
        now: new Date("2026-07-31T12:30:00.000Z"),
        planningTimezone: "Pacific/Auckland",
      }),
    ).toBe("2026-08-01");
    expect(() =>
      assertManualDiaryDateIsCurrentOrPast({
        currentPlanningDate: "2026-08-01",
        diaryDate: "2026-08-01",
        plannedSessionDate: "2026-08-02",
      }),
    ).toThrow("Future planned sessions");
  });

  it("hashes omitted and explicit null actual fields identically", () => {
    expect(manualDiaryRequestFingerprint(observation(), undefined)).toBe(
      manualDiaryRequestFingerprint(
        observation({
          notes: null,
          startedAt: null,
          finishedAt: null,
          elapsedMs: null,
          distanceMeters: null,
          rpe: undefined,
          rpeOperationId: undefined,
        }),
        undefined,
      ),
    );
  });

  it("rejects changed payloads by producing a different request fingerprint", () => {
    expect(manualDiaryRequestFingerprint(observation(), undefined)).not.toBe(
      manualDiaryRequestFingerprint(observation({ name: "Changed entry" }), undefined),
    );
  });
});
