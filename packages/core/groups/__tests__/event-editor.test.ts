import { describe, expect, it } from "vitest";
import { createGroupEventEditorDraft, prepareGroupEventEditorPayload } from "../event-editor";

describe("group event editor", () => {
  it("uses the event zone for defaults and leaves an optional end unset", () => {
    expect(
      createGroupEventEditorDraft({
        startsAt: "2026-06-01T10:30:00.000Z",
        timezone: "Pacific/Kiritimati",
      }),
    ).toMatchObject({ date: "2026-06-02", endDate: null, endsTime: null, startsTime: "00:30" });
  });

  it("round-trips a multi-day end independently from its start date", () => {
    const draft = createGroupEventEditorDraft({
      endsAt: "2026-11-23T01:00:00.000Z",
      startsAt: "2026-11-22T23:00:00.000Z",
      timezone: "UTC",
      title: "Overnight relay",
    });
    expect(draft).toMatchObject({
      date: "2026-11-22",
      endDate: "2026-11-23",
      endsTime: "01:00",
      startsTime: "23:00",
    });
    expect(prepareGroupEventEditorPayload(draft, { isRecurringCreate: false })).toMatchObject({
      success: true,
      data: {
        endsAt: "2026-11-23T01:00:00.000Z",
        startsAt: "2026-11-22T23:00:00.000Z",
      },
    });
  });

  it("rejects an end before start without mutating the draft", () => {
    const draft = createGroupEventEditorDraft(undefined);
    const result = prepareGroupEventEditorPayload(
      {
        ...draft,
        date: "2026-10-10",
        endsTime: "08:00",
        startsTime: "09:00",
        timezone: "Pacific/Kiritimati",
        title: "Sunday run",
      },
      { isRecurringCreate: false },
    );
    expect(result).toEqual({
      success: false,
      field: "endsTime",
      message: "End time must be after start time.",
    });
  });

  it("builds a bounded recurrence payload in the selected zone", () => {
    const result = prepareGroupEventEditorPayload(
      {
        ...createGroupEventEditorDraft(undefined),
        date: "2026-10-10",
        recurrenceEndDate: "2026-10-17",
        recurrenceFrequency: "weekly",
        startsTime: "09:00",
        timezone: "Pacific/Kiritimati",
        title: "Sunday run",
      },
      { isRecurringCreate: true, activityPlanId: "plan-1" },
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        activityPlanId: "plan-1",
        endsAt: null,
        recurrenceRule: /^FREQ=WEEKLY;UNTIL=20261017T/,
      },
    });
  });

  it("retains DST validation from scheduled wall-time conversion", () => {
    const result = prepareGroupEventEditorPayload(
      {
        ...createGroupEventEditorDraft(undefined),
        date: "2026-03-08",
        startsTime: "02:30",
        timezone: "America/New_York",
        title: "Impossible run",
      },
      { isRecurringCreate: false },
    );
    expect(result).toMatchObject({
      success: false,
      field: "date",
      message: "The local wall time does not exist in this time zone",
    });
  });

  it("makes an unreadable persisted schedule observable without throwing or rewriting it", () => {
    const draft = createGroupEventEditorDraft({
      startsAt: "not-an-instant",
      timezone: "UTC",
    });
    expect(draft).toMatchObject({
      date: "",
      initializationError: "isoInstant must include an explicit UTC offset",
      startsTime: "",
    });
  });

  it("contains invalid persisted timezone and recurrence UNTIL values in the draft boundary", () => {
    expect(
      createGroupEventEditorDraft({
        recurrenceRule: "FREQ=WEEKLY;UNTIL=20261123T010000Z",
        timezone: "Not/A_Timezone",
      }),
    ).toMatchObject({
      initializationError: "timeZone must be a valid IANA zone",
      recurrenceEndDate: null,
    });
    expect(
      createGroupEventEditorDraft({
        recurrenceRule: "FREQ=WEEKLY;UNTIL=not-a-date",
        timezone: "UTC",
      }),
    ).toMatchObject({
      initializationError: "recurrence UNTIL must be a valid UTC date or datetime",
      recurrenceEndDate: null,
    });
  });
});
