import { SYSTEM_TEMPLATES } from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import { createEventUseCase } from "./createEventUseCase";
import { updateEventUseCase } from "./updateEventUseCase";

const activityPlanId = "11111111-1111-4111-8111-111111111111";
const profileId = "viewer-profile";
const activityPlan = { id: activityPlanId, structure: SYSTEM_TEMPLATES[0]?.structure };

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
          enqueueProviderPlannedActivityJobs: vi.fn(async () => null),
          ensurePersistableRecurrence: () => undefined,
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
            sourceProvider: null,
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
          buildMaterializedRecurrenceOccurrences: () => [],
          enqueueProviderPlannedActivityJobs: vi.fn(async () => null),
          ensurePersistableRecurrence: () => undefined,
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
                source_provider: null,
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
          toDbEventType: (eventType) => eventType,
          toNextDayStartIso: (value) => `${value}T00:00:00.000Z`,
          toPersistableEventStatus: () => "scheduled",
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
          enqueueProviderPlannedActivityJobs: vi.fn(async () => null),
          ensurePersistableRecurrence: () => undefined,
          getContentPermissions: () => access,
          getEventWriteRepository: () => writeRepository,
          mapEvent: (event: unknown) => event as any,
          normalizeEventCreateInput: () => ({ activityPlanId, eventType: "planned" as const }),
          toDbEventType: (eventType: "planned" | "race_target" | "custom" | "imported") =>
            eventType,
        } as any,
      }),
    ).rejects.toThrow("Activity plan not found or not accessible");

    expect(getActivityPlanById).not.toHaveBeenCalled();
  });
});
