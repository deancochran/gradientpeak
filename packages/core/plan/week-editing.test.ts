import { describe, expect, it } from "vitest";
import { copyTrainingPlanWeek, summarizeTrainingPlanWeek } from "./week-editing";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const session = (suffix: string, offset_days: number, duration: number | null = 30) => ({
  id: id(suffix),
  offset_days,
  activity_plan_id: id("99"),
  demand: {
    activity_category: "run" as const,
    importance: "normal" as const,
    target_common_load: null,
    target_duration_minutes: duration,
    training_intent: "general_maintenance" as const,
  },
});

describe("training-plan week editing", () => {
  it("copies a week with fresh ids while preserving day offsets and order", () => {
    const result = copyTrainingPlanWeek({
      sessions: [session("1", 1), session("2", 3)],
      sourceWeekIndex: 0,
      destinationWeekIndex: 1,
      createId: (() => {
        let next = 10;
        return () => id(String(next++));
      })(),
    });
    expect(result).toMatchObject({ status: "copied" });
    if (result.status !== "copied") throw new Error("Expected copy");
    expect(result.sessions.map((item) => [item.id, item.offset_days])).toEqual([
      [id("1"), 1],
      [id("2"), 3],
      [id("10"), 8],
      [id("11"), 10],
    ]);
  });

  it("rejects span overflow and the 366-session limit", () => {
    expect(
      copyTrainingPlanWeek({
        sessions: [session("1", 0)],
        sourceWeekIndex: 0,
        destinationWeekIndex: 2,
        durationWeeks: 2,
        createId: () => id("2"),
      }),
    ).toEqual({ status: "rejected", reason: "destination_outside_plan_span" });
    expect(
      copyTrainingPlanWeek({
        sessions: Array.from({ length: 366 }, (_, index) => session(String(index + 1), index % 7)),
        sourceWeekIndex: 0,
        destinationWeekIndex: 1,
        createId: () => id("999"),
      }),
    ).toEqual({ status: "rejected", reason: "session_limit" });
  });

  it("permits finite same-week duplication with fresh identities", () => {
    const result = copyTrainingPlanWeek({
      sessions: [session("1", 2)],
      sourceWeekIndex: 0,
      destinationWeekIndex: 0,
      createId: () => id("2"),
    });
    expect(result).toMatchObject({ status: "copied" });
    if (result.status !== "copied") throw new Error("Expected copy");
    expect(result.sessions.map((item) => item.id)).toEqual([id("1"), id("2")]);
    expect(result.sessions.map((item) => item.offset_days)).toEqual([2, 2]);
  });

  it("keeps unknown durations explicit in per-activity-category summaries", () => {
    expect(
      summarizeTrainingPlanWeek({
        sessions: [session("1", 0, 45), session("2", 2, null)],
        weekIndex: 0,
      }).run,
    ).toEqual({
      knownDurationMinutes: 45,
      sessionCount: 2,
      unknownDurationSessionCount: 1,
    });
  });
});
