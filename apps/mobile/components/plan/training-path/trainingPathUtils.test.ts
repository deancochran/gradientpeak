import { describe, expect, it } from "vitest";
import {
  buildTrainingPathGoalMarkers,
  buildTrainingPathViewModel,
  resolveTrainingPathRiskZone,
} from "./trainingPathUtils";

const goalMarkers = [{ id: "goal-1", label: "A race", targetDate: "2026-08-16" }];

describe("trainingPathUtils", () => {
  it("aggregates daily load into normalized weeks", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        {
          date: "2026-05-18",
          completed_load_tss: 50,
          scheduled_load_tss: 80,
          recommended_load_tss: 100,
        },
        {
          date: "2026-05-19",
          completed_load_tss: 25,
          scheduled_load_tss: 40,
          recommended_load_tss: 50,
        },
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
      fitness: 38,
      targetFitness: 45,
    });
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
      timeline: [{ date: "2026-05-18", scheduled_load_tss: 160, recommended_load_tss: 200 }],
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
        { date: "2026-05-18", completed_load_tss: 100 },
        { date: "2026-05-25", scheduled_load_tss: 150 },
      ],
      fitnessHistory: [{ date: "2026-05-18", ctl: 42 }],
      projectedFitness: [],
      idealFitnessCurve: [],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")?.fitness).toBe(38);
    expect(model.weeks.find((week) => week.weekStart === "2026-05-25")?.fitness).toBeNull();
  });

  it("shows a path with recommended and completed load even without scheduled workouts", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        { date: "2026-05-18", completed_load_tss: 80, recommended_load_tss: 120 },
        { date: "2026-05-19", recommended_load_tss: 100 },
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
        { date: "2026-05-18", completed_load_tss: 80 },
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
      targetLoad: 0,
    });
  });

  it("does not require completed activity history to show planned or recommended load", () => {
    const model = buildTrainingPathViewModel({
      timeline: [{ date: "2026-05-18", scheduled_load_tss: 75, recommended_load_tss: 120 }],
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
        { date: "2026-05-18", completed_load_tss: 100 },
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
    expect(currentWeek?.fitness).toBe(38);
    expect(currentWeek?.scheduledFitness).toBe(38);
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
