import { describe, expect, it } from "vitest";
import {
  buildProfileBoundedCandidateLattice,
  compareMpcTieBreakCandidates,
  pickBestMpcCandidate,
  resolveMpcSolveBounds,
  solveDeterministicBoundedMpc,
} from "../index";

describe("MPC lattice", () => {
  it("generates deterministic bounded candidates for the same inputs", () => {
    const runA = buildProfileBoundedCandidateLattice({
      optimization_profile: "balanced",
      min_value: 250,
      max_value: 420,
      center_value: 330,
      precision: 1,
    });
    const runB = buildProfileBoundedCandidateLattice({
      optimization_profile: "balanced",
      min_value: 250,
      max_value: 420,
      center_value: 330,
      precision: 1,
    });

    expect(runA).toEqual(runB);
    expect(runA.length).toBeLessThanOrEqual(7);
    expect(runA[0]).toBeGreaterThanOrEqual(250);
    expect(runA.at(-1)).toBeLessThanOrEqual(420);
  });
});

describe("MPC profile bounds", () => {
  it("enforces profile-specific horizon and candidate count caps", () => {
    expect(
      resolveMpcSolveBounds({
        optimization_profile: "sustainable",
        requested_horizon_weeks: 20,
        requested_candidate_count: 50,
      }),
    ).toMatchObject({
      horizon_weeks: 2,
      candidate_count: 5,
    });

    expect(
      resolveMpcSolveBounds({
        optimization_profile: "balanced",
        requested_horizon_weeks: 20,
        requested_candidate_count: 50,
      }),
    ).toMatchObject({
      horizon_weeks: 4,
      candidate_count: 7,
    });

    expect(
      resolveMpcSolveBounds({
        optimization_profile: "outcome_first",
        requested_horizon_weeks: 20,
        requested_candidate_count: 50,
      }),
    ).toMatchObject({
      horizon_weeks: 6,
      candidate_count: 9,
    });
  });
});

describe("MPC tiebreak", () => {
  it("is deterministic under input permutations", () => {
    const candidates = [
      {
        candidate_value: 370,
        objective_score: 10,
        delta_from_prev: 5,
        primary_goal_date: "2026-05-01",
        primary_goal_id: "goal-b",
      },
      {
        candidate_value: 360,
        objective_score: 10,
        delta_from_prev: 5,
        primary_goal_date: "2026-04-20",
        primary_goal_id: "goal-z",
      },
      {
        candidate_value: 355,
        objective_score: 10,
        delta_from_prev: 5,
        primary_goal_date: "2026-04-20",
        primary_goal_id: "goal-a",
      },
    ] as const;

    const forward = pickBestMpcCandidate(candidates);
    const reversed = pickBestMpcCandidate([...candidates].reverse());

    expect(forward.selected.candidate_value).toBe(355);
    expect(reversed.selected.candidate_value).toBe(355);
    expect(forward.tie_break_order).toEqual(reversed.tie_break_order);
  });

  it("returns deterministic tie-break diagnostics from solver", () => {
    const result = solveDeterministicBoundedMpc({
      optimization_profile: "sustainable",
      previous_action: 300,
      action_bounds: {
        min_value: 280,
        max_value: 320,
      },
      evaluate_candidate: ({ candidate_value }) => ({
        objective_score: 100,
        primary_goal_date: "2026-06-01",
        primary_goal_id: String(candidate_value),
      }),
    });

    expect(result.diagnostics.tie_break_order).toEqual([
      "objective",
      "delta_from_prev",
      "goal_date",
      "goal_id",
      "candidate_value",
    ]);
    expect(result.selected_candidate).toBe(300);
  });

  it("applies tie-break precedence objective -> delta -> date -> id -> value", () => {
    const betterObjective = compareMpcTieBreakCandidates(
      {
        candidate_value: 300,
        objective_score: 11,
        delta_from_prev: 5,
      },
      {
        candidate_value: 295,
        objective_score: 10,
        delta_from_prev: 1,
      },
    );
    expect(betterObjective).toBeLessThan(0);

    const betterDelta = compareMpcTieBreakCandidates(
      {
        candidate_value: 300,
        objective_score: 10,
        delta_from_prev: 2,
      },
      {
        candidate_value: 299,
        objective_score: 10,
        delta_from_prev: 4,
      },
    );
    expect(betterDelta).toBeLessThan(0);

    const betterDate = compareMpcTieBreakCandidates(
      {
        candidate_value: 300,
        objective_score: 10,
        delta_from_prev: 2,
        primary_goal_date: "2026-04-01",
      },
      {
        candidate_value: 299,
        objective_score: 10,
        delta_from_prev: 2,
        primary_goal_date: "2026-05-01",
      },
    );
    expect(betterDate).toBeLessThan(0);

    const betterId = compareMpcTieBreakCandidates(
      {
        candidate_value: 300,
        objective_score: 10,
        delta_from_prev: 2,
        primary_goal_date: "2026-04-01",
        primary_goal_id: "goal-a",
      },
      {
        candidate_value: 299,
        objective_score: 10,
        delta_from_prev: 2,
        primary_goal_date: "2026-04-01",
        primary_goal_id: "goal-b",
      },
    );
    expect(betterId).toBeLessThan(0);

    const betterValue = compareMpcTieBreakCandidates(
      {
        candidate_value: 298,
        objective_score: 10,
        delta_from_prev: 2,
        primary_goal_date: "2026-04-01",
        primary_goal_id: "goal-a",
      },
      {
        candidate_value: 300,
        objective_score: 10,
        delta_from_prev: 2,
        primary_goal_date: "2026-04-01",
        primary_goal_id: "goal-a",
      },
    );
    expect(betterValue).toBeLessThan(0);
  });

  it("throws for empty candidate set", () => {
    expect(() => pickBestMpcCandidate([])).toThrow(
      "Cannot pick MPC candidate from empty collection",
    );
  });
});
