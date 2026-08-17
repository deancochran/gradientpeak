import { SYSTEM_TEMPLATES } from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import type {
  CreateOwnedEventInput,
  EventWriteRepository,
} from "../../repositories/event-write-repository";
import { createEventUseCase } from "./createEventUseCase";
import { updateEventUseCase } from "./updateEventUseCase";

const activityPlanId = "11111111-1111-4111-8111-111111111111";
const profileId = "viewer-profile";
const activityPlan = {
  id: activityPlanId,
  name: "Readable activity plan",
  structure: SYSTEM_TEMPLATES[0]?.structure,
};

function createdEvent() {
  return {
    activity_plan_id: activityPlanId,
    event_type: "planned" as const,
    id: "event-1",
    profile_id: profileId,
    scheduled_date: "2026-03-12",
    training_plan_id: null,
    updated_at: "2026-03-01T00:00:00.000Z",
  };
}

function permissions(allowed: boolean) {
  return {
    grantEventContentAccess: vi.fn(async () => undefined),
    requireRead: vi.fn(async () => {
      if (!allowed) throw new Error("Activity plan not found or not accessible");
    }),
    revokeEventGrants: vi.fn(async () => undefined),
  } as any;
}

describe("ActivityPlan scheduling access", () => {
  it.each([
    "public",
    "follower-visible",
    "explicit-grant",
  ])("schedules and replaces a %s readable plan after permission authorization", async () => {
    const access = permissions(true);
    const getActivityPlanById = vi.fn(async () => activityPlan);
    const getAccessibleActivityPlan = vi.fn(async () => null);
    const writeRepository = {
      createOwnedEvents: vi.fn(async () => [createdEvent()]),
      getAccessibleActivityPlan,
      getActivityPlanById,
      updateOwnedEventsForScope: vi.fn(async () => [createdEvent()]),
    } as any;
    const ctx = { session: { user: { id: profileId } } } as any;

    await expect(
      createEventUseCase({
        ctx,
        input: {},
        dependencies: {
          assertRestDayWritesBlocked: () => undefined,
          buildInsightRefreshHint: () => null,
          buildMaterializedRecurrenceOccurrences: () => [],
          enqueueWahooPlannedActivityJobs: vi.fn(async () => null),
          getContentPermissions: () => access,
          getEventWriteRepository: () => writeRepository,
          mapEvent: (event) => event as any,
          normalizeEventCreateInput: () => ({
            activityPlanId,
            allDay: false,
            description: null,
            endsAt: null,
            eventType: "planned" as const,
            notes: null,
            routeId: null,
            scheduledDate: "2026-03-12",
            startsAt: "2026-03-12T09:00:00.000Z",
            status: "scheduled" as const,
            timezone: "UTC",
            title: "Plan",
            trainingPlanId: null,
          }),
          toDbEventType: (eventType) => eventType,
        },
      }),
    ).resolves.toMatchObject({ id: "event-1" });

    await expect(
      updateEventUseCase({
        ctx,
        input: { id: "event-1" },
        dependencies: {
          assertRestDayWritesBlocked: () => undefined,
          buildInsightRefreshHint: () => null,
          enqueueWahooPlannedActivityJobs: vi.fn(async () => null),
          getContentPermissions: () => access,
          getEventCompletionRepository: () =>
            ({
              getOwnedEventForCompletion: vi.fn(async () => ({
                ...createdEvent(),
                all_day: false,
                ends_at: null,
                linked_activity_id: null,
                recurrence_rule: null,
                recurrence_timezone: null,
                route_id: null,
                series_id: null,
                starts_at: "2026-03-12T09:00:00.000Z",
                status: "scheduled",
                timezone: "UTC",
                title: "Plan",
              })),
            }) as any,
          getEventWriteRepository: () => writeRepository,
          hasInstantChanged: () => false,
          mapEvent: (event) => event as any,
          normalizeEventUpdatePatch: () => ({
            patch: { activity_plan_id: activityPlanId },
            scheduledDate: undefined,
          }),
          toCoreEventType: (eventType) => eventType,
          toDateKey: (value) => value.slice(0, 10),
          toDayStartIso: (value) => `${value}T00:00:00.000Z`,
          toNextDayStartIso: (value) => `${value}T00:00:00.000Z`,
        },
      }),
    ).resolves.toMatchObject({ id: "event-1" });

    expect(access.requireRead).toHaveBeenCalledWith(
      profileId,
      { id: activityPlanId, type: "activity_plan" },
      "Activity plan not found or not accessible",
    );
    expect(getActivityPlanById).toHaveBeenCalledTimes(2);
    expect(getAccessibleActivityPlan).not.toHaveBeenCalled();
  });

  it("rejects instant schedule fields for an existing planned session", async () => {
    const updateOwnedEventsForScope = vi.fn();
    const existing = {
      ...createdEvent(),
      all_day: true,
      ends_at: "2026-03-13T00:00:00.000Z",
      linked_activity_id: null,
      route_id: null,
      starts_at: "2026-03-12T00:00:00.000Z",
      status: "scheduled" as const,
      timezone: "UTC",
    };

    await expect(
      updateEventUseCase({
        ctx: { session: { user: { id: profileId } } } as any,
        input: { id: existing.id },
        dependencies: {
          assertRestDayWritesBlocked: () => undefined,
          buildInsightRefreshHint: () => null,
          enqueueWahooPlannedActivityJobs: vi.fn(async () => null),
          getContentPermissions: () => null,
          getEventCompletionRepository: () => ({
            getOwnedEventForCompletion: vi.fn(async () => existing),
          }),
          getEventWriteRepository: () => ({ updateOwnedEventsForScope }),
          hasInstantChanged: () => true,
          mapEvent: (event: unknown) => event,
          normalizeEventUpdatePatch: () => ({
            patch: { starts_at: "2026-03-12T09:00:00.000Z" },
            scheduledDate: undefined,
          }),
          toCoreEventType: (eventType: "planned" | "race_target" | "custom") => eventType,
          toDateKey: (value: string) => value.slice(0, 10),
          toDayStartIso: (value: string) => `${value}T00:00:00.000Z`,
          toNextDayStartIso: (value: string) => `${value}T00:00:00.000Z`,
        } as any,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Planned sessions accept calendar-date schedule updates only",
    });

    expect(updateOwnedEventsForScope).not.toHaveBeenCalled();
  });

  it("uses each recurrence occurrence key as its scheduled planning date", async () => {
    type CreateOwnedEventsInput = {
      anchor: CreateOwnedEventInput;
      occurrences: Omit<CreateOwnedEventInput, "seriesId">[];
    };
    let persistedInput: CreateOwnedEventsInput | undefined;
    const createOwnedEvents = vi.fn(async (input: CreateOwnedEventsInput) => {
      persistedInput = input;
      return [createdEvent(), createdEvent()];
    });
    const recurrenceOccurrences = [
      {
        startsAt: "2026-03-09T09:30:00.000Z",
        endsAt: "2026-03-09T10:30:00.000Z",
        occurrenceKey: "2026-03-08",
      },
      {
        startsAt: "2026-03-16T08:30:00.000Z",
        endsAt: "2026-03-16T09:30:00.000Z",
        occurrenceKey: "2026-03-15",
      },
    ];

    await createEventUseCase({
      ctx: { session: { user: { id: profileId } } } as any,
      input: {},
      dependencies: {
        assertRestDayWritesBlocked: () => undefined,
        buildInsightRefreshHint: () => null,
        buildMaterializedRecurrenceOccurrences: () => recurrenceOccurrences,
        enqueueWahooPlannedActivityJobs: vi.fn(async () => null),
        getContentPermissions: () => null,
        getEventWriteRepository: () =>
          ({
            createOwnedEvents,
            getAccessibleActivityPlan: vi.fn(async () => activityPlan),
          }) as unknown as EventWriteRepository,
        mapEvent: () => createdEvent(),
        normalizeEventCreateInput: () => ({
          activityPlanId,
          allDay: false,
          description: null,
          endsAt: recurrenceOccurrences[0]?.endsAt ?? null,
          eventType: "planned" as const,
          notes: null,
          recurrence: { rule: "FREQ=WEEKLY;COUNT=2", timezone: "America/Adak" },
          routeId: null,
          scheduledDate: "2026-03-08",
          startsAt: recurrenceOccurrences[0]?.startsAt ?? "",
          status: "scheduled" as const,
          timezone: "America/Adak",
          title: "Recurring plan",
          trainingPlanId: null,
        }),
        toDbEventType: (eventType) => eventType,
      },
    });

    expect([persistedInput?.anchor, ...(persistedInput?.occurrences ?? [])]).toEqual(
      recurrenceOccurrences.map((occurrence, index) =>
        expect.objectContaining({
          occurrenceKey: occurrence.occurrenceKey,
          scheduledDate: occurrence.occurrenceKey,
          startsAt: occurrence.startsAt,
          ...(index === 0 ? { seriesId: null } : {}),
        }),
      ),
    );
    expect(recurrenceOccurrences[0]?.startsAt.slice(0, 10)).not.toBe(
      recurrenceOccurrences[0]?.occurrenceKey,
    );
  });

  it("denies scheduling before loading a plan row", async () => {
    const access = permissions(false);
    const getActivityPlanById = vi.fn(async () => activityPlan);
    const writeRepository = { getActivityPlanById } as any;
    const ctx = { session: { user: { id: profileId } } } as any;

    await expect(
      createEventUseCase({
        ctx,
        input: {},
        dependencies: {
          assertRestDayWritesBlocked: () => undefined,
          buildInsightRefreshHint: () => null,
          buildMaterializedRecurrenceOccurrences: () => [],
          enqueueWahooPlannedActivityJobs: vi.fn(async () => null),
          getContentPermissions: () => access,
          getEventWriteRepository: () => writeRepository,
          mapEvent: (event: unknown) => event as any,
          normalizeEventCreateInput: () => ({ activityPlanId, eventType: "planned" as const }),
          toDbEventType: (eventType: "planned" | "race_target" | "custom") => eventType,
        } as any,
      }),
    ).rejects.toThrow("Activity plan not found or not accessible");

    expect(getActivityPlanById).not.toHaveBeenCalled();
  });
});
