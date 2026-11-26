import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import type { GroupEventDetail } from "@/lib/groups";
import { GroupEventForm, type GroupEventFormHandle } from "../GroupEventForm";

jest.mock("@/lib/api", () => ({
  api: {
    activityPlans: {
      getManyByIds: { useQuery: () => ({ data: { items: [] }, isLoading: false }) },
    },
    routes: { get: { useQuery: () => ({ data: null }) } },
  },
}));
jest.mock("@/components/shared/resource-picker", () => ({ ResourcePickerModal: () => null }));
jest.mock("@/components/shared/ActivityPlanCard", () => ({ ActivityPlanCard: () => null }));
jest.mock("@repo/ui/components/form", () => {
  const React = require("react");
  const { TextInput } = require("react-native");
  const { FormProvider, useController } = require("react-hook-form");
  // Keep real form state and validation; replace presentation at the shared UI boundary.
  const Picker = ({ control, name, label, testId }: Record<string, unknown>) => {
    const { field } = useController({ control, name });
    return React.createElement(TextInput, {
      accessibilityLabel: label,
      testID: testId,
      value: field.value ?? "",
      onChangeText: field.onChange,
    });
  };
  return {
    Form: FormProvider,
    FormDateInputField: Picker,
    FormTimeInputField: Picker,
    FormTextField: Picker,
    FormTextareaField: Picker,
    FormTimezoneField: Picker,
  };
});

describe("GroupEventForm recurrence validation", () => {
  function eventWithSchedule(startsAt: string, endsAt: string): GroupEventDetail {
    return {
      acceptedRsvpCount: 0,
      activity_plan_id: null,
      cancelled_at: null,
      description: null,
      ends_at: endsAt,
      group_id: "group-1",
      id: "event-1",
      is_recurring_occurrence: false,
      is_recurring_series: false,
      location_name: null,
      recurrence_rule: null,
      route_id: null,
      series_id: null,
      starts_at: startsAt,
      timezone: "UTC",
      title: "Night run",
      viewerRsvp: null,
      viewerSeriesRsvp: null,
    } as GroupEventDetail;
  }

  it("requires an explicit timezone before it calls the server", async () => {
    const submit = jest.fn();
    const ref = createRef<GroupEventFormHandle>();
    await render(
      <GroupEventForm ref={ref} groupId="group-1" onSubmit={submit} submitLabel="Create event" />,
    );
    await fireEvent.changeText(screen.getByLabelText("Title"), "Sunday run");
    await fireEvent.changeText(screen.getByTestId("group-event-date-button"), "2026-10-10");
    await fireEvent.changeText(screen.getByTestId("group-event-start-time-button"), "09:00");

    await act(async () => ref.current?.submit());
    expect(submit).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("Event time zone"), "Pacific/Kiritimati");
    await act(async () => ref.current?.submit());
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Pacific/Kiritimati" }),
    );
  });

  it("rejects an end before the first occurrence and retains the draft for correction", async () => {
    const submit = jest.fn();
    const ref = createRef<GroupEventFormHandle>();
    await render(
      <GroupEventForm ref={ref} groupId="group-1" onSubmit={submit} submitLabel="Create event" />,
    );
    await fireEvent.changeText(screen.getByLabelText("Title"), "Sunday run");
    await fireEvent.press(screen.getByText("Recurring"));
    await fireEvent.changeText(screen.getByTestId("group-event-date-button"), "2026-10-10");
    await fireEvent.changeText(screen.getByTestId("group-event-start-time-button"), "09:00");
    await fireEvent.changeText(screen.getByLabelText("Event time zone"), "Pacific/Kiritimati");
    await fireEvent.changeText(
      screen.getByTestId("group-event-recurrence-end-date-button"),
      "2026-10-09",
    );
    await act(async () => ref.current?.submit());
    expect(submit).not.toHaveBeenCalled();
    expect(
      screen.getByText("Repeat end date must be on or after the event start date."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("Sunday run");

    await fireEvent.changeText(
      screen.getByTestId("group-event-recurrence-end-date-button"),
      "2026-10-17",
    );
    await act(async () => ref.current?.submit());
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Sunday run",
        recurrenceRule: expect.stringMatching(/^FREQ=WEEKLY;UNTIL=/),
      }),
    );
  });

  it("moves a same-day end to a changed start date", async () => {
    const submit = jest.fn();
    const ref = createRef<GroupEventFormHandle>();
    await render(
      <GroupEventForm
        event={eventWithSchedule("2026-11-22T09:00:00.000Z", "2026-11-22T10:00:00.000Z")}
        ref={ref}
        groupId="group-1"
        onSubmit={submit}
        submitLabel="Save"
      />,
    );

    await fireEvent.changeText(screen.getByTestId("group-event-date-button"), "2026-11-23");
    await act(async () => ref.current?.submit());

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: "2026-11-23T09:00:00.000Z",
        endsAt: "2026-11-23T10:00:00.000Z",
      }),
    );
  });

  it("renders, preserves, and lets an organizer correct an overnight end date", async () => {
    const submit = jest.fn();
    const ref = createRef<GroupEventFormHandle>();
    await render(
      <GroupEventForm
        event={eventWithSchedule("2026-11-22T23:00:00.000Z", "2026-11-23T01:00:00.000Z")}
        ref={ref}
        groupId="group-1"
        onSubmit={submit}
        submitLabel="Save"
      />,
    );

    expect(screen.getByLabelText("End date").props.value).toBe("2026-11-23");
    await act(async () => ref.current?.submit());
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ endsAt: "2026-11-23T01:00:00.000Z" }),
    );

    submit.mockClear();
    await fireEvent.changeText(screen.getByTestId("group-event-end-date-button"), "2026-11-24");
    await act(async () => ref.current?.submit());
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ endsAt: "2026-11-24T01:00:00.000Z" }),
    );
  });
});
