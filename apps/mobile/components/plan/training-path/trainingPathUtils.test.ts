import { describe, expect, it } from "vitest";
import { buildEffectiveCompletedObservationsByDate } from "@/lib/training-path/trainingTimelineAdapters";
import {
  buildTrainingPathGoalMarkers,
  buildTrainingPathViewModel,
  resolveTrainingPathRiskZone,
} from "./trainingPathUtils";

const goalMarkers = [{ id: "goal-1", label: "A race", targetDate: "2026-08-16" }];
const observedCompletedLoad = {
  completed_observation_state: "observed" as const,
  completed_common_load_identity: {
    model: "gradientpeak_relative_load" as const,
    version: "1" as const,
  },
};
const zeroTargetDates = (dates: string[]) =>
  dates.map((date) => ({
    date,
    recommended_common_load: 0,
    scheduled_common_load: 0,
  }));

describe("trainingPathUtils", () => {
  it("aggregates daily load into normalized weeks", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        {
          date: "2026-05-18",
          ...observedCompletedLoad,
          completed_common_load: 50,
          scheduled_common_load: 80,
          recommended_common_load: 100,
        },
        {
          date: "2026-05-19",
          ...observedCompletedLoad,
          completed_common_load: 25,
          scheduled_common_load: 40,
          recommended_common_load: 50,
        },
        ...zeroTargetDates(["2026-05-20", "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24"]),
      ],
      fitnessHistory: [{ date: "2026-05-18", longTermLoad: 42, loadBalance: -4 }],
      projectedFitness: [],
      idealFitnessCurve: [{ date: "2026-05-18", longTermLoad: 45 }],
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

  it("keeps a finite partial scheduled weekly Load visible as incomplete", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        {
          date: "2026-05-18",
          scheduled_common_load: 40,
          scheduled_common_load_status: "partial",
        },
        {
          date: "2026-05-19",
          scheduled_common_load: null,
          scheduled_common_load_status: "unavailable",
        },
      ],
      goalMarkers: [],
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")).toMatchObject({
      plannedLoad: 40,
      plannedLoadStatus: "partial",
    });
    expect(model.selectedWeekSummary).toMatchObject({
      plannedLoad: 40,
      plannedLoadStatus: "partial",
    });
  });

  it("discards malformed and impossible source date keys", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        { date: "not-a-date", recommended_common_load: 50 },
        { date: "2026-02-30", recommended_common_load: 50 },
      ],
      fitnessHistory: [{ date: "2026-02-30", longTermLoad: 42 }],
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
        recommended_common_load: 10,
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
        recommended_common_load: 0,
        scheduled_common_load: 0,
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
          recommended_common_load: 10,
          scheduled_common_load: index === 0 ? 40 : 0,
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
        { date: "2025-01-06", scheduled_common_load: 100 },
        { date: "2026-05-18", scheduled_common_load: 100 },
        { date: "2027-01-04", scheduled_common_load: 100 },
      ],
      fitnessHistory: [{ date: "2026-05-18", longTermLoad: 42 }],
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
          scheduled_common_load: 160,
          recommended_common_load: 200,
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
      fitnessHistory: [{ date: "2026-05-18", longTermLoad: 42 }],
      projectedFitness: [],
      idealFitnessCurve: [],
      goalMarkers,
      selectedWeekStart: "2026-01-05",
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.selectedWeekSummary?.weekStart).toBe("2026-05-18");
    expect(model.selectedWeekSummary?.loadDelta).toBe(-40);
    expect(model.selectedWeekSummary?.headline).toBe("40 Common Load below target");
  });

  it("does not flatline actual fitness into future weeks without projected fitness", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        { date: "2026-05-18", completed_common_load: 100, ...observedCompletedLoad },
        { date: "2026-05-25", scheduled_common_load: 150 },
      ],
      fitnessHistory: [{ date: "2026-05-18", longTermLoad: 42 }],
      projectedFitness: [],
      idealFitnessCurve: [],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")?.fitness).toBe(40);
    expect(model.weeks.find((week) => week.weekStart === "2026-05-25")?.fitness).toBeNull();
  });

  it("shows a path with recommended and completed load even without scheduled activities", () => {
    const model = buildTrainingPathViewModel({
      timeline: [
        {
          date: "2026-05-18",
          completed_common_load: 80,
          recommended_common_load: 120,
          scheduled_common_load: 0,
          ...observedCompletedLoad,
        },
        {
          date: "2026-05-19",
          recommended_common_load: 100,
          scheduled_common_load: 0,
        },
        ...zeroTargetDates(["2026-05-20", "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24"]),
      ],
      fitnessHistory: [{ date: "2026-05-18", longTermLoad: 42 }],
      projectedFitness: [],
      idealFitnessCurve: [{ date: "2026-05-18", longTermLoad: 45 }],
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
        {
          date: "2026-05-18",
          completed_common_load: 80,
          scheduled_common_load: 0,
          ...observedCompletedLoad,
        },
        {
          date: "2026-05-19",
          scheduled_common_load: 45,
        },
      ],
      fitnessHistory: [{ date: "2026-05-18", longTermLoad: 42 }],
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
          scheduled_common_load: 75,
          recommended_common_load: 120,
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
      idealFitnessCurve: [{ date: "2026-05-18", longTermLoad: 45 }],
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
        { date: "2026-05-18", completed_common_load: 100, ...observedCompletedLoad },
        { date: "2026-05-25", scheduled_common_load: 150 },
      ],
      fitnessHistory: [{ date: "2026-05-18", longTermLoad: 42 }],
      projectedFitness: [{ date: "2026-05-25", longTermLoad: 47 }],
      idealFitnessCurve: [{ date: "2026-05-25", longTermLoad: 50 }],
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

  it("leaves scheduled fitness unavailable without authoritative scheduled common Load", () => {
    const model = buildTrainingPathViewModel({
      timeline: [{ date: "2026-05-21", scheduled_common_load: 100 }],
      fitnessHistory: [{ date: "2026-05-18", longTermLoad: 42, recentLoad: 42 }],
      idealFitnessCurve: [{ date: "2026-05-25", longTermLoad: 50 }],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    const currentWeek = model.weeks.find((week) => week.weekStart === "2026-05-18");
    expect(currentWeek?.fitness).toBe(40);
    expect(currentWeek?.scheduledFitness).toBeNull();
  });

  it.each([
    {
      label: "incompatible identities",
      secondPoint: {
        completed_common_load: 25,
        completed_observation_state: "observed" as const,
        completed_common_load_identity: {
          model: "gradientpeak_relative_load" as const,
          version: "2" as const,
        },
      },
      expectedWeek: {
        completedLoad: null,
        completedLoadStatus: "unavailable",
        completedLoadUnavailable: true,
      },
      expectedSummary: {
        completedLoad: null,
        loadDelta: null,
        body: "Completed Common Load is unavailable for this week.",
      },
    },
    {
      label: "an unavailable completed activity",
      secondPoint: {
        completed_common_load: 0,
        completed_observation_state: "unavailable" as const,
        completed_common_load_identity: null,
        has_unavailable_completed_activity: true,
      },
      expectedWeek: {
        completedLoad: 50,
        completedLoadStatus: "partial",
        completedLoadUnavailable: false,
      },
      expectedSummary: {
        completedLoad: 50,
        body: "Completed Common Load is based on available activity evidence for this week.",
      },
    },
  ])("keeps weekly completed load truthful for $label", ({
    expectedSummary,
    expectedWeek,
    secondPoint,
  }) => {
    const model = buildTrainingPathViewModel({
      timeline: [
        {
          date: "2026-05-18",
          completed_common_load: 50,
          recommended_common_load: 100,
          ...observedCompletedLoad,
        },
        { date: "2026-05-19", recommended_common_load: 50, ...secondPoint },
      ],
      goalMarkers,
      range: "all",
      todayKey: "2026-05-20",
    });

    expect(model.weeks.find((week) => week.weekStart === "2026-05-18")).toMatchObject(expectedWeek);
    expect(model.selectedWeekSummary).toMatchObject(expectedSummary);
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
