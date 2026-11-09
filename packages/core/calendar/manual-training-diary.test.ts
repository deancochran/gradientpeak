import { describe, expect, it } from "vitest";
import { manualTrainingDiaryObservationSchema } from "./manual-training-diary";

const operationId = "11111111-1111-4111-8111-111111111111";

describe("manualTrainingDiaryObservationSchema", () => {
  it("preserves unknown actuals without inventing timestamps or values", () => {
    const result = manualTrainingDiaryObservationSchema.parse({
      operationId,
      diaryDate: "2026-09-14",
      diaryTimezone: "America/New_York",
      name: "Easy run",
      activityCategory: "run",
    });
    expect(result).not.toHaveProperty("elapsedMs");
    expect(result).not.toHaveProperty("distanceMeters");
    expect(result).not.toHaveProperty("startedAt");
  });

  it("requires a separate retry key when RPE is reported", () => {
    expect(
      manualTrainingDiaryObservationSchema.safeParse({
        operationId,
        diaryDate: "2026-09-14",
        diaryTimezone: "America/New_York",
        name: "Easy run",
        activityCategory: "run",
        rpe: 4,
      }).success,
    ).toBe(false);
  });
});
