import { describe, expect, it, vi } from "vitest";
import { createEventUseCase } from "../../application/events/createEventUseCase";
import { deleteEventUseCase } from "../../application/events/deleteEventUseCase";
import { updateEventUseCase } from "../../application/events/updateEventUseCase";

const ctx = { session: { user: { id: "owner-1" } } } as any;
const event = (overrides: Record<string, unknown> = {}) => ({
  id: "event-1",
  profile_id: "owner-1",
  event_type: "custom",
  activity_plan_id: null,
  route_id: null,
  training_plan_id: null,
  linked_activity_id: null,
  series_id: null,
  starts_at: "2026-10-01T09:00:00.000Z",
  ends_at: null,
  scheduled_date: "2026-10-01",
  status: "scheduled",
  updated_at: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

function createDependencies(rows: any[], calls: any[]) {
  return {
    assertRestDayWritesBlocked: vi.fn(),
    buildInsightRefreshHint: vi.fn(() => null),
    buildMaterializedRecurrenceOccurrences: vi.fn(() => [
      { startsAt: "2026-10-01T09:00:00.000Z", endsAt: null, occurrenceKey: "2026-10-01" },
      { startsAt: "2026-10-08T09:00:00.000Z", endsAt: null, occurrenceKey: "2026-10-08" },
      { startsAt: "2026-10-15T09:00:00.000Z", endsAt: null, occurrenceKey: "2026-10-15" },
    ]),
    enqueueWahooPlannedActivityJobs: vi.fn(async () => null),
    getContentPermissions: () => null,
    getEventWriteRepository: () => ({
      createOwnedEvents: vi.fn(async (input: any) => {
        calls.push(input);
        return rows;
      }),
      updateOwnedEvent: vi.fn(async (input: any) => {
        calls.push(input);
        return event(input.patch);
      }),
    }),
    mapEvent: (value: any) => ({ ...value, event_type: "custom", updated_at: "2026-09-02" }),
    normalizeEventCreateInput: (input: any) => input,
    normalizeEventUpdatePatch: (input: any) => ({ patch: input.patch, scheduledDate: undefined }),
    toDbEventType: (value: string) => value,
    toCoreEventType: () => "custom",
    hasInstantChanged: () => false,
    toDateKey: (value: string) => value.slice(0, 10),
    toDayStartIso: (value: string) => value,
    toNextDayStartIso: (value: string) => value,
    getEventCompletionRepository: () => ({
      getOwnedEventForCompletion: vi.fn(async (input: any) =>
        input.profileId === "owner-1" ? event() : null,
      ),
      deleteOwnedEventsForScope: vi.fn(async (input: any) => {
        const rowsToDelete =
          input.scope === "series" ? [event(), event({ id: "event-2" })] : [event()];
        await input.beforeDelete({ candidates: rowsToDelete, tx: {} });
        calls.push({ scope: input.scope, ids: rowsToDelete.map((row) => row.id) });
        return rowsToDelete;
      }),
    }),
  } as any;
}

describe("P1 calendar capability boundaries", () => {
  it("calendar.create-event persists the owner and every bounded recurrence occurrence", async () => {
    const calls: any[] = [];
    const result = await createEventUseCase({
      ctx,
      input: {
        eventType: "custom",
        title: "Weekly appointment",
        allDay: false,
        description: null,
        endsAt: null,
        notes: null,
        routeId: null,
        activityPlanId: null,
        trainingPlanId: null,
        scheduledDate: "2026-10-01",
        startsAt: "2026-10-01T09:00:00.000Z",
        status: "scheduled",
        timezone: "UTC",
        recurrence: { rule: "FREQ=WEEKLY;COUNT=3", timezone: "UTC" },
      },
      dependencies: createDependencies([event()], calls),
    });
    expect(result.profile_id).toBe("owner-1");
    expect(calls[0].anchor).toMatchObject({ profileId: "owner-1", seriesId: null });
    expect(calls[0].occurrences).toHaveLength(2);
    expect(calls[0].occurrences.map((row: any) => row.scheduledDate)).toEqual([
      "2026-10-08",
      "2026-10-15",
    ]);
  });

  it("calendar.edit-event and calendar.delete-event reject a non-owner before persistence", async () => {
    const calls: any[] = [];
    const dependencies = createDependencies([event()], calls);
    const nonOwner = { session: { user: { id: "someone-else" } } } as any;
    await expect(
      updateEventUseCase({
        ctx: nonOwner,
        input: { id: "event-1", patch: { title: "Nope" } },
        dependencies,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      deleteEventUseCase({
        ctx: nonOwner,
        input: { id: "event-1", scope: "series" },
        dependencies,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(calls).toEqual([]);
  });

  it("calendar.delete-event applies series scope to the persisted occurrence set", async () => {
    const calls: any[] = [];
    const result = await deleteEventUseCase({
      ctx,
      input: { id: "event-1", scope: "series" },
      dependencies: createDependencies([event()], calls),
    });
    expect(result).toMatchObject({ mutation_scope: "series", affected_count: 2 });
    expect(calls.at(-1)).toEqual({ scope: "series", ids: ["event-1", "event-2"] });
  });
});
