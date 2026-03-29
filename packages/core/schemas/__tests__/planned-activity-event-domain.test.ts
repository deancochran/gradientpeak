import { describe, expect, it } from "vitest";
import {
  eventCreateSchema,
  eventDomainSchema,
  eventMutationScopeSchema,
  eventRecurrenceSchema,
  eventTypeInputSchema,
  eventUpdateSchema,
  importedEventLifecycleMutationSchema,
  importedEventSourceMetadataSchema,
  plannedActivityCreateSchema,
  plannedActivityRescheduleSchema,
} from "../planned_activity";

describe("planned activity event domain schemas", () => {
  it("keeps planned activity create backward compatible", () => {
    const parsed = plannedActivityCreateSchema.safeParse({
      activity_plan_id: "2f3e7214-35ca-4ef5-a8ef-ef4f3efb1d15",
      scheduled_date: "2026-03-01T09:00:00.000Z",
    });

    expect(parsed.success).toBe(true);
  });

  it("maps legacy event types to the new core event domain", () => {
    expect(eventTypeInputSchema.parse("planned_activity")).toBe("planned");
    expect(eventTypeInputSchema.parse("race")).toBe("race_target");
  });

  it("validates RRULE-compatible recurrence strings", () => {
    const valid = eventRecurrenceSchema.safeParse({
      rule: "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR",
      timezone: "America/New_York",
      exdates: ["2026-04-01"],
      exceptions: [
        {
          occurrence_date: "2026-04-03",
          action: "modified",
          starts_at: "2026-04-03T12:00:00.000Z",
        },
      ],
    });

    const invalid = eventRecurrenceSchema.safeParse({
      rule: "RRULE:BYDAY=MO,WE",
      timezone: "UTC",
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("rejects duplicate exdates and collision with exceptions", () => {
    const parsed = eventRecurrenceSchema.safeParse({
      rule: "FREQ=DAILY;INTERVAL=1",
      timezone: "UTC",
      exdates: ["2026-05-10", "2026-05-10"],
      exceptions: [
        {
          occurrence_date: "2026-05-10",
          action: "modified",
          starts_at: "2026-05-10T07:00:00.000Z",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("enforces source metadata and read-only rules for imported events", () => {
    expect(
      importedEventSourceMetadataSchema.safeParse({
        external_uid: "abc123",
      }).success,
    ).toBe(false);

    const imported = eventDomainSchema.safeParse({
      event_type: "imported",
      title: "Team ride",
      starts_at: "2026-03-07T08:00:00.000Z",
      timezone: "UTC",
      source: {
        feed_url: "https://calendar.example.com/feed.ics",
        external_uid: "event-uid-42",
      },
      read_only: true,
    });

    expect(imported.success).toBe(true);
  });

  it("requires imported lifecycle mutation schema for imported events", () => {
    const parsed = importedEventLifecycleMutationSchema.safeParse({
      id: "97247f32-4dd2-45e3-9f4f-6768f2e6e2df",
      event_type: "imported",
      scope: "future",
      lifecycle: {
        status: "cancelled",
        cancelled: {
          cancelled_at: "2026-03-09T10:00:00.000Z",
        },
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("validates mutation scope enum on reschedule", () => {
    expect(eventMutationScopeSchema.safeParse("single").success).toBe(true);
    expect(eventMutationScopeSchema.safeParse("future").success).toBe(true);
    expect(eventMutationScopeSchema.safeParse("series").success).toBe(true);
    expect(eventMutationScopeSchema.safeParse("all").success).toBe(false);

    const parsed = plannedActivityRescheduleSchema.safeParse({
      id: "2f3e7214-35ca-4ef5-a8ef-ef4f3efb1d15",
      new_date: "2026-03-04T09:00:00.000Z",
      scope: "series",
    });

    expect(parsed.success).toBe(true);
  });

  it("blocks empty editable patches", () => {
    const parsed = eventUpdateSchema.safeParse({
      id: "e4e9d401-49dc-4f14-b8ab-2da517f7db1b",
      patch: {},
    });

    expect(parsed.success).toBe(false);
  });

  it("requires activity plan linkage for planned event creation", () => {
    const parsed = eventCreateSchema.safeParse({
      event_type: "planned",
      title: "Threshold session",
      starts_at: "2026-03-12T06:00:00.000Z",
      timezone: "UTC",
    });

    expect(parsed.success).toBe(false);
  });
});
