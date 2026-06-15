import { canonicalTrainingPlanStructureSchema, trainingPlanCreateInputSchema } from "@repo/core";
import { describe, expect, it } from "vitest";
import { createDefaultTrainingPlanBuilderState } from "./defaults";
import { createTrainingPlanBuilderFixtures } from "./fixtures";
import { toTrainingPlanCreatePayload, toTrainingPlanStructure } from "./mappers";
import { trainingPlanBuilderReducer } from "./reducer";
import { trainingPlanBuilderStateSchema } from "./schemas";
import { selectBuilderSummary, selectSaveReadiness, selectSessionById } from "./selectors";
import { TrainingPlanBuilderService } from "./service";
import { validateTrainingPlanBuilderState } from "./validation";

describe("training plan creation domain", () => {
  it("creates schema-valid defaults without goals or persisted side effects", () => {
    const state = createDefaultTrainingPlanBuilderState({ createId: () => "local-1" });

    expect(trainingPlanBuilderStateSchema.parse(state)).toEqual(state);
    expect(state.goals).toEqual([]);
    expect(state.schedule.sessions).toEqual([]);
    expect(state.selection).toEqual({ type: "overview" });
  });

  it("defaults builder-local goals to canonical priority 10", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = trainingPlanBuilderReducer(fixtures.emptyState, {
      type: "goal.add",
      goal: fixtures.localGoal({ localId: "goal-1", priority: undefined }),
    });

    expect(state.goals).toHaveLength(1);
    expect(state.goals[0]?.priority).toBe(10);
    expect("importance" in (state.goals[0] ?? {})).toBe(false);
  });

  it("adds, assigns, moves, and selects relative sessions", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const withSession = trainingPlanBuilderReducer(fixtures.emptyState, {
      type: "session.add",
      session: fixtures.unresolvedSession({ localId: "session-1", offsetDays: 0 }),
    });
    const assigned = trainingPlanBuilderReducer(withSession, {
      type: "session.assignActivityPlan",
      sessionId: "session-1",
      activityPlan: fixtures.activityPlan({ id: fixtures.activityPlanId }),
    });
    const moved = trainingPlanBuilderReducer(assigned, {
      type: "session.move",
      sessionId: "session-1",
      offsetDays: 3,
    });
    const customized = trainingPlanBuilderReducer(moved, {
      type: "session.updateEventOverrides",
      sessionId: "session-1",
      eventOverrides: { title: "Custom title", start_time: "08:00" },
    });
    const selected = trainingPlanBuilderReducer(customized, {
      type: "selection.set",
      selection: { type: "session", sessionId: "session-1" },
    });

    expect(selectSessionById(selected, "session-1")?.offsetDays).toBe(3);
    expect(selectSessionById(selected, "session-1")?.eventOverrides).toEqual({
      title: "Custom title",
      start_time: "08:00",
    });
    expect(selectBuilderSummary(selected)).toMatchObject({ sessionCount: 1, durationDays: 4 });
    expect(selected.selection).toEqual({ type: "session", sessionId: "session-1" });
  });

  it("reports save blockers for unresolved, invalid, inaccessible, and duplicate sessions", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const invalid = {
      ...fixtures.emptyState,
      details: { ...fixtures.emptyState.details, name: "" },
      schedule: {
        sessions: [
          fixtures.unresolvedSession({ localId: "missing", offsetDays: 0 }),
          fixtures.assignedSession({ localId: "invalid-offset", offsetDays: -1 }),
          fixtures.assignedSession({
            localId: "invalid-time",
            offsetDays: 1,
            eventOverrides: { start_time: "7" },
          }),
          fixtures.assignedSession({
            localId: "not-accessible",
            offsetDays: 2,
            activityPlan: fixtures.activityPlan({ accessible: false }),
          }),
          fixtures.assignedSession({
            localId: "duplicate-a",
            offsetDays: 3,
            eventOverrides: { start_time: "07:30" },
          }),
          fixtures.assignedSession({
            localId: "duplicate-b",
            offsetDays: 3,
            eventOverrides: { start_time: "07:30" },
          }),
        ],
      },
    };

    expect(validateTrainingPlanBuilderState(invalid).blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "missing_plan_name",
        "missing_activity_plan",
        "invalid_offset_days",
        "invalid_start_time",
        "inaccessible_activity_plan",
        "duplicate_session",
      ]),
    );
  });

  it("maps save-ready builder state to canonical create input only", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = fixtures.readyState;
    const structure = toTrainingPlanStructure(state);
    const payload = toTrainingPlanCreatePayload(state);

    expect(canonicalTrainingPlanStructureSchema.parse(structure)).toEqual(structure);
    expect(trainingPlanCreateInputSchema.parse(payload)).toEqual(payload);
    expect(JSON.stringify(payload)).not.toContain("scheduled_date");
    expect(JSON.stringify(payload)).not.toContain("session_type");
    expect(JSON.stringify(payload)).not.toContain("goals");
    expect(JSON.stringify(payload)).not.toContain("scenarioAssumptions");
    expect(payload.structure.sessions[0]).toEqual({
      offset_days: 0,
      activity_plan_id: fixtures.activityPlanId,
      event_overrides: { title: "Aerobic opener", start_time: "07:30" },
    });
  });

  it("emits service snapshots after dispatched actions", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const service = new TrainingPlanBuilderService(fixtures.emptyState);
    const snapshots: Array<ReturnType<TrainingPlanBuilderService["getSnapshot"]>> = [];
    const unsubscribe = service.subscribe((snapshot) => snapshots.push(snapshot));

    service.dispatch({
      type: "session.add",
      session: fixtures.assignedSession({ localId: "session-1", offsetDays: 0 }),
    });
    service.dispatch({
      type: "selection.set",
      selection: { type: "session", sessionId: "session-1" },
    });
    unsubscribe();

    expect(snapshots).toHaveLength(2);
    expect(snapshots.at(-1)?.summary).toMatchObject({ sessionCount: 1, durationDays: 1 });
    expect(selectSaveReadiness(snapshots.at(-1)?.state ?? fixtures.emptyState).canSave).toBe(true);
  });
});
