import { afterEach, describe, expect, it, vi } from "vitest";
import { expandMinimalGoalToPlan } from "../expandMinimalGoalToPlan";

describe("expandMinimalGoalToPlan", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds contiguous periodized blocks ending on target date", () => {
    const plan = expandMinimalGoalToPlan({
      plan_start_date: "2026-02-01",
      goals: [
        {
          name: "Spring 10k",
          target_date: "2026-05-01",
          priority: 1,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 10000,
              target_time_s: 2700,
            },
          ],
        },
      ],
    });

    expect(plan.start_date).toBe("2026-02-01");
    expect(plan.end_date).toBe("2026-05-01");
    expect(plan.blocks.length).toBeGreaterThan(0);

    expect(plan.blocks[0]?.start_date).toBe("2026-02-01");
    expect(plan.blocks.at(-1)?.end_date).toBe("2026-05-01");

    for (let i = 1; i < plan.blocks.length; i++) {
      const previousEnd = new Date(
        `${plan.blocks[i - 1]!.end_date}T00:00:00.000Z`,
      );
      previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
      const expectedStart = previousEnd.toISOString().slice(0, 10);
      expect(plan.blocks[i]!.start_date).toBe(expectedStart);
    }
  });

  it("extends plan horizon for multiple goals and links all goals to blocks", () => {
    const plan = expandMinimalGoalToPlan({
      plan_start_date: "2026-02-01",
      goals: [
        {
          name: "Tune-up 5k",
          target_date: "2026-04-01",
          priority: 2,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1320,
            },
          ],
        },
        {
          name: "A race 10k",
          target_date: "2026-05-01",
          priority: 1,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 10000,
              target_time_s: 2700,
            },
          ],
        },
      ],
    });

    expect(plan.end_date).toBe("2026-05-01");
    expect(plan.goals).toHaveLength(2);

    const allGoalIds = new Set(plan.goals.map((goal) => goal.id));
    for (const block of plan.blocks) {
      expect(block.goal_ids.length).toBe(2);
      for (const goalId of block.goal_ids) {
        expect(allGoalIds.has(goalId)).toBe(true);
      }
    }
  });

  it("falls back to today when plan_start_date is missing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));

    const plan = expandMinimalGoalToPlan({
      goals: [
        {
          name: "Spring 10k",
          target_date: "2026-05-01",
          priority: 1,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 10000,
              target_time_s: 2700,
            },
          ],
        },
      ],
    });

    expect(plan.start_date).toBe("2026-01-10");
  });

  it("rejects plan_start_date after the latest goal date", () => {
    expect(() =>
      expandMinimalGoalToPlan({
        plan_start_date: "2026-06-01",
        goals: [
          {
            name: "Spring 10k",
            target_date: "2026-05-01",
            priority: 1,
            targets: [
              {
                target_type: "race_performance",
                activity_category: "run",
                distance_m: 10000,
                target_time_s: 2700,
              },
            ],
          },
          {
            name: "Tune-up 5k",
            target_date: "2026-04-01",
            priority: 2,
            targets: [
              {
                target_type: "race_performance",
                activity_category: "run",
                distance_m: 5000,
                target_time_s: 1320,
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "plan_start_date must be on or before the latest goal target_date",
    );
  });
});
