import { expect, it, vi } from "vitest";
import { readCoachAthleteGoals } from "./read-coach-athlete-goals";

const COACH_ID = "11111111-1111-4111-8111-111111111111";
const ATHLETE_ID = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const TRANSACTION = { transaction: true } as never;

function goal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    profile_id: ATHLETE_ID,
    target_date: "2026-06-10",
    title: "Spring 10K",
    priority: 7,
    activity_category: "run",
    created_at_key: "2026-01-02T03:04:05.123456Z",
    ...overrides,
  };
}

function input() {
  return {
    db: {} as never,
    actorProfileId: COACH_ID,
    organizationId: ORGANIZATION_ID,
    athleteProfileId: ATHLETE_ID,
    limit: 1,
    cursor: null,
    now: new Date("2026-06-10T12:00:00.000Z"),
  };
}

it("authorizes only the selected organization and reads the allowlisted projection in its transaction", async () => {
  const list = vi.fn(async ({ transaction }) => {
    expect(transaction).toBe(TRANSACTION);
    return [goal()];
  });
  const authorize = vi.fn(async (request) => ({
    decision: { outcome: "allow" as const, scope: "goals" as const },
    value: await request.read(TRANSACTION),
  }));

  const result = await readCoachAthleteGoals(input(), {
    authorize: authorize as never,
    list,
    getPlanningTimezone: async () => "UTC",
  });

  expect(authorize).toHaveBeenCalledWith(
    expect.objectContaining({
      actorProfileId: COACH_ID,
      organizationId: ORGANIZATION_ID,
      athleteProfileId: ATHLETE_ID,
      scope: "goals",
    }),
  );
  expect(list).toHaveBeenCalledWith(
    expect.objectContaining({ athleteProfileId: ATHLETE_ID, cursor: null, limit: 1 }),
  );
  expect(result).toEqual({
    items: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Spring 10K",
        targetDate: "2026-06-10",
        category: "run",
        priority: 7,
        status: "in_progress",
      },
    ],
    nextCursor: null,
  });
  expect(Object.keys(result?.items[0] ?? {}).sort()).toEqual([
    "category",
    "id",
    "name",
    "priority",
    "status",
    "targetDate",
  ]);
});

it("treats ISO date-only target dates on today as active and prior dates as completed", async () => {
  const authorize = vi.fn(async (request) => ({
    decision: { outcome: "allow" as const, scope: "goals" as const },
    value: await request.read(TRANSACTION),
  }));
  const result = await readCoachAthleteGoals(
    { ...input(), limit: 2 },
    {
      authorize: authorize as never,
      list: async () => [
        goal(),
        goal({ id: "55555555-5555-4555-8555-555555555555", target_date: "2026-06-09" }),
      ],
      getPlanningTimezone: async () => "UTC",
    },
  );

  expect(result?.items.map((item) => item.status)).toEqual(["in_progress", "completed"]);
});

it("uses the athlete planning timezone at a UTC-midnight boundary", async () => {
  const authorize = vi.fn(async (request) => ({
    decision: { outcome: "allow" as const, scope: "goals" as const },
    value: await request.read(TRANSACTION),
  }));
  const result = await readCoachAthleteGoals(
    { ...input(), now: new Date("2026-06-10T00:30:00.000Z") },
    {
      authorize: authorize as never,
      list: async () => [goal({ target_date: "2026-06-09" })],
      getPlanningTimezone: async () => "America/Los_Angeles",
    },
  );

  expect(result?.items[0]?.status).toBe("in_progress");
});

it("does not read goals when selected-organization goals consent is denied", async () => {
  const list = vi.fn();
  const result = await readCoachAthleteGoals(input(), {
    authorize: (async () => ({
      decision: { outcome: "deny", scope: "goals", reason: "missing_consent" },
    })) as never,
    list,
    getPlanningTimezone: async () => "UTC",
  });

  expect(result).toBeNull();
  expect(list).not.toHaveBeenCalled();
});
