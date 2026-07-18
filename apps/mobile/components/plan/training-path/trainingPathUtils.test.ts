import { describe, expect, it } from "vitest";
import { buildEffectiveCompletedObservationsByDate } from "@/lib/training-path/trainingTimelineAdapters";
import {
  buildScheduledFitnessTrend,
  buildTrainingPathGoalMarkers,
  buildTrainingPathViewModel,
  resolveTrainingPathRiskZone,
} from "./trainingPathUtils";

const goalMarkers = [{ id: "goal-1", label: "A race", targetDate: "2026-08-16" }];
const observedCompletedLoad = {
  completed_observation_state: "observed" as const,
  completed_tss_identity: {
    sport: "bike" as const,
    method: "power_threshold" as const,
    source: "activity_analysis" as const,
    version: "1" as const,
    calibration: { type: "ftp_watts" as const, value: 250 },
  },
};
const zeroTargetDates = (dates: string[]) =>
  dates.map((date) => ({ date, recommended_load_tss: 0 }));

describe("trainingPathUtils", () => {
  it("aggregates daily load into normalized weeks", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        {
          date: "2026-05-18",
          ...observedCompletedLoad,
          completed_load_tss: 50,
          scheduled_load_tss: 80,
          recommended_load_tss: 100,
        },
        {
          date: "2026-05-19",
          ...observedCompletedLoad,
          completed_load_tss: 25,
          scheduled_load_tss: 40,
          recommended_load_tss: 50,
        },
        ...zeroTargetDates(["2026-05-20", "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24"]),
      ],
      fitnessHistory: [{ date: "2026-05-18", ctl: 42, tsb: -4 }],
      projectedFitness: [],
      idealFitnessCurve: [{ date: "2026-05-18", ctl: 45 }],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")).toMatchObject({
      completedLoad: 75,
      plannedLoad: 120,
      targetLoad: 150,
      fitness: 40,
      targetFitness: 45,
    });
  });

  it("discards malformed and impossible source date keys", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        { date: "not-a-date", recommended_load_tss: 50 },
        { date: "2026-02-30", recommended_load_tss: 50 },
      ],
      fitnessHistory: [{ date: "2026-02-30", ctl: 42 }],
      goalMarkers: [{ id: "invalid-goal", targetDate: "2026-02-30" }],
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.goalMarkers).toEqual([]);
    expect(model.weeks).toHaveLength(1);
    expect(model.weeks[0]).toMatchObject({
      weekStart: "2026-05-18",
      completedLoad: null,
      targetLoad: null,
      fitness: null,
      scheduledFitness: null,
    });
  });

  it("keeps weekly target and delta null at a partial projection boundary", () => {
    const model = buildTrainingPathViewModel({
      timeline: Array.from({ length: 6 }, (_, index) => ({
        date: `2026-05-${String(18 + index).padStart(2, "0")}`,
        completed_observation_state: "known_zero" as const,
        recommended_load_tss: 10,
      })),
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")?.targetLoad).toBeNull();
    expect(model.selectedWeekSummary).toMatchObject({ targetLoad: null, loadDelta: null });
  });

  it("treats seven explicitly covered zero targets as an available zero weekly target", () => {
    const model = buildTrainingPathViewModel({
      timeline: Array.from({ length: 7 }, (_, index) => ({
        date: `2026-05-${String(18 + index).padStart(2, "0")}`,
        completed_observation_state: "known_zero" as const,
        recommended_load_tss: 0,
      })),
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")?.targetLoad).toBe(0);
    expect(model.selectedWeekSummary).toMatchObject({ targetLoad: 0, loadDelta: 0 });
  });

  it("computes a future planned-vs-target delta without completed API coverage", () => {
    const effectiveCompleted = buildEffectiveCompletedObservationsByDate({
      completedObservationsByDate: new Map(),
      endDate: "2026-06-07",
      todayKey: "2026-05-20",
    });
    const model = buildTrainingPathViewModel({
      timeline: Array.from({ length: 7 }, (_, index) => {
        const date = `2026-06-0${index + 1}`;
        return {
          date,
          completed_observation_state: effectiveCompleted.get(date)?.state,
          recommended_load_tss: 10,
          scheduled_load_tss: index === 0 ? 40 : 0,
        };
      }),
      goalMarkers,
      range: "all",
      selectedWeekStart: "2026-06-01",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-06-01")).toMatchObject({
      completedLoad: 0,
      plannedLoad: 40,
      targetLoad: 70,
    });
    expect(model.selectedWeekSummary).toMatchObject({ targetLoad: 70, loadDelta: -30 });
  });

  it("filters weeks by range around today", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        { date: "2025-01-06", scheduled_load_tss: 100 },
        { date: "2026-05-18", scheduled_load_tss: 100 },
        { date: "2027-01-04", scheduled_load_tss: 100 },
      ],
      fitnessHistory: [{ date: "2026-05-18", ctl: 42 }],
      projectedFitness: [],
      idealFitnessCurve: [],
      goalMarkers,
      range: "goal",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.map((week) => week.weekStart)).toContain("2026-05-18");
    expect(model.weeks.map((week) => week.weekStart)).not.toContain("2025-01-06");
    expect(model.weeks.map((week) => week.weekStart)).not.toContain("2027-01-04");
  });

  it("falls back selected summary to the current week", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        {
          date: "2026-05-18",
          scheduled_load_tss: 160,
          recommended_load_tss: 200,
          completed_observation_state: "known_zero",
        },
        ...zeroTargetDates([
          "2026-05-19",
          "2026-05-20",
          "2026-05-21",
          "2026-05-22",
          "2026-05-23",
          "2026-05-24",
        ]),
      ],
      fitnessHistory: [{ date: "2026-05-18", ctl: 42 }],
      projectedFitness: [],
      idealFitnessCurve: [],
      goalMarkers,
      selectedWeekStart: "2026-01-05",
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.selectedWeekSummary?.weekStart).toBe("2026-05-18");
    expect(model.selectedWeekSummary?.loadDelta).toBe(-40);
    expect(model.selectedWeekSummary?.headline).toBe("40 TSS below target");
  });

  it("does not flatline actual fitness into future weeks without projected fitness", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        { date: "2026-05-18", completed_load_tss: 100, ...observedCompletedLoad },
        { date: "2026-05-25", scheduled_load_tss: 150 },
      ],
      fitnessHistory: [{ date: "2026-05-18", ctl: 42 }],
      projectedFitness: [],
      idealFitnessCurve: [],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")?.fitness).toBe(40);
    expect(model.weeks.find((week) => week.weekStart === "2026-05-25")?.fitness).toBeNull();
  });

  it("shows a path with recommended and completed load even without scheduled workouts", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        {
          date: "2026-05-18",
          completed_load_tss: 80,
          recommended_load_tss: 120,
          ...observedCompletedLoad,
        },
        { date: "2026-05-19", recommended_load_tss: 100 },
        ...zeroTargetDates(["2026-05-20", "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24"]),
      ],
      fitnessHistory: [{ date: "2026-05-18", ctl: 42 }],
      projectedFitness: [],
      idealFitnessCurve: [{ date: "2026-05-18", ctl: 45 }],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.emptyState).toBeNull();
    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")).toMatchObject({
      completedLoad: 80,
      plannedLoad: 0,
      targetLoad: 220,
    });
  });

  it("does not require a goal to show completed or planned load", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        { date: "2026-05-18", completed_load_tss: 80, ...observedCompletedLoad },
        { date: "2026-05-19", scheduled_load_tss: 45 },
      ],
      fitnessHistory: [{ date: "2026-05-18", ctl: 42 }],
      projectedFitness: [],
      idealFitnessCurve: [],
      goalMarkers: [],
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.emptyState).toBeNull();
    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")).toMatchObject({
      completedLoad: 80,
      plannedLoad: 45,
      targetLoad: null,
    });
    expect(model.selectedWeekSummary).toMatchObject({
      targetLoad: null,
      loadDelta: null,
      headline: null,
      body: null,
    });
  });

  it("does not require completed activity history to show planned or recommended load", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        {
          date: "2026-05-18",
          scheduled_load_tss: 75,
          recommended_load_tss: 120,
          completed_observation_state: "known_zero",
        },
        ...zeroTargetDates([
          "2026-05-19",
          "2026-05-20",
          "2026-05-21",
          "2026-05-22",
          "2026-05-23",
          "2026-05-24",
        ]),
      ],
      fitnessHistory: [],
      projectedFitness: [],
      idealFitnessCurve: [{ date: "2026-05-18", ctl: 45 }],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.emptyState).toBeNull();
    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")).toMatchObject({
      completedLoad: 0,
      plannedLoad: 75,
      targetLoad: 120,
      fitness: null,
    });
  });

  it("uses projected fitness for scheduled fitness trend weeks", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        { date: "2026-05-18", completed_load_tss: 100, ...observedCompletedLoad },
        { date: "2026-05-25", scheduled_load_tss: 150 },
      ],
      fitnessHistory: [{ date: "2026-05-18", ctl: 42 }],
      projectedFitness: [{ date: "2026-05-25", ctl: 47 }],
      idealFitnessCurve: [{ date: "2026-05-25", ctl: 50 }],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-05-25")).toMatchObject({
      fitness: null,
      scheduledFitness: 47,
      targetFitness: 50,
    });
  });

  it("anchors scheduled fitness at today's decayed fitness state", () => {
    const model = buildTrainingPathViewModel({
      timeline: [{ date: "2026-05-21", scheduled_load_tss: 100 }],
      fitnessHistory: [{ date: "2026-05-18", ctl: 42, atl: 42 }],
      idealFitnessCurve: [{ date: "2026-05-25", ctl: 50 }],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    const currentWeek = model.weeks.find((week) => week.weekStart === "2026-05-18");
    expect(currentWeek?.fitness).toBe(40);
    expect(currentWeek?.scheduledFitness).toBe(40);
  });

  it("replays planned CTL through the requested chart window when ideal data ends sooner", () => {
    const trend = buildScheduledFitnessTrend({
      endDate: "2026-06-03",
      fitnessHistory: [{ date: "2026-05-31", ctl: 42, atl: 42 }],
      idealFitnessCurve: [{ date: "2026-06-01", ctl: 45 }],
      timeline: [{ date: "2026-06-03", scheduled_load_tss: 100 }],
      todayKey: "2026-06-01",
    });

    expect(trend.map((point) => point.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });

  it.each([
    {
      label: "incompatible identities",
      secondPoint: {
        completed_load_tss: 25,
        completed_observation_state: "observed" as const,
        completed_tss_identity: {
          sport: "run" as const,
          method: "run_pace_threshold" as const,
          source: "activity_analysis" as const,
          version: "1" as const,
          calibration: { type: "threshold_speed_mps" as const, value: 4 },
        },
      },
    },
    {
      label: "an unavailable completed activity",
      secondPoint: {
        completed_load_tss: 0,
        completed_observation_state: "unavailable" as const,
        completed_tss_identity: null,
        has_unavailable_completed_activity: true,
      },
    },
  ])("keeps weekly completed load null for $label", ({ secondPoint }) => {
    const model = buildTrainingPathViewModel({
      timeline: [
        {
          date: "2026-05-18",
          completed_load_tss: 50,
          recommended_load_tss: 100,
          ...observedCompletedLoad,
        },
        { date: "2026-05-19", recommended_load_tss: 50, ...secondPoint },
      ],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")).toMatchObject({
      completedLoad: null,
      completedLoadUnavailable: true,
    });
    expect(model.selectedWeekSummary).toMatchObject({
      completedLoad: null,
      loadDelta: null,
      body: "Completed load is unavailable for this week.",
    });
  });

  it("places goal markers on their target week", () => {
    expect(buildTrainingPathGoalMarkers(goalMarkers)).toEqual([
      { id: "goal-1", label: "A race", targetDate: "2026-08-16", weekStart: "2026-08-10" },
    ]);
  });

  it("maps form values to risk zones", () => {
    expect(resolveTrainingPathRiskZone(8)).toBe("fresh");
    expect(resolveTrainingPathRiskZone(-2)).toBe("moderate");
    expect(resolveTrainingPathRiskZone(-15)).toBe("high");
    expect(resolveTrainingPathRiskZone(-30)).toBe("veryHigh");
    expect(resolveTrainingPathRiskZone(null)).toBeNull();
  });
});
