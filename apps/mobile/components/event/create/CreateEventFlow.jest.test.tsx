import React, { createRef } from "react";

import { createHost } from "@/test/mock-components";
import { fireEvent, renderNative, screen } from "@/test/render-native";

const updateMutateMock = jest.fn();
const createDefaultDraftMock = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQueryClient: () => ({}),
}));

jest.mock("@repo/ui/hooks", () => {
  const React = require("react");

  return {
    __esModule: true,
    useZodForm: ({ defaultValues }: { defaultValues: Record<string, unknown> }) => {
      const valuesRef = React.useRef(defaultValues);
      return {
        control: {},
        formState: { isDirty: false },
        getValues: () => valuesRef.current,
        reset: (values: Record<string, unknown>) => {
          valuesRef.current = values;
        },
      };
    },
  };
});

jest.mock("react-hook-form", () => ({
  __esModule: true,
  useWatch: () => undefined,
}));

jest.mock("@repo/ui/components/form", () => ({ __esModule: true, Form: createHost("Form") }));
jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppFormModal: createHost("AppFormModal"),
}));
jest.mock("@/components/shared/resource-picker", () => ({
  __esModule: true,
  ResourcePickerModal: (props: Record<string, unknown>) =>
    React.createElement("ResourcePickerModal", { ...props, testID: `picker-${props.scope}` }),
}));
jest.mock("@/lib/calendar/eventSchedule", () => ({
  __esModule: true,
  getDeviceTimeZone: () => "UTC",
  getEventScheduledDate: () => "2026-06-02",
}));
jest.mock("@/lib/scheduling/refreshScheduleViews", () => ({
  __esModule: true,
  refreshScheduleViews: jest.fn(),
}));
jest.mock("../EventEditorCard", () => ({
  __esModule: true,
  parseEventDateForEditor: () => new Date("2026-06-02T12:00:00.000Z"),
  parseRecurrenceEndDate: () => null,
  parseRecurrenceFrequency: () => "none",
}));
jest.mock("./createEventDraft", () => ({
  __esModule: true,
  buildCreateEventInput: jest.fn(),
  buildUpdatePatch: jest.fn(() => ({})),
  createDefaultEventDraft: createDefaultDraftMock,
  removeActivityPlanFromDraft: jest.fn(),
}));
jest.mock("./RepeatStep", () => ({ __esModule: true, RepeatStep: createHost("RepeatStep") }));
jest.mock("./CreateEventMainStep", () => ({
  __esModule: true,
  CreateEventMainStep: ({
    isReadOnly,
    ...props
  }: { isReadOnly?: boolean } & Record<string, unknown>) =>
    React.createElement("CreateEventMainStep", {
      ...props,
      testID: isReadOnly ? "read-only" : "editable",
    }),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    events: {
      create: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutate: updateMutateMock }) },
    },
    plannedSessions: {
      create: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
    },
    activityPlans: {
      getById: { useQuery: () => ({ data: null }) },
      list: { useQuery: () => ({ data: { items: [] } }) },
    },
  },
}));

const { CreateEventFlow } = require("./CreateEventFlow");

const eventDefaults = {
  id: "event-1",
  starts_at: "2026-06-02T12:00:00.000Z",
};

describe("CreateEventFlow existing event editability", () => {
  it("restores every custom-event value after visiting activity-plan mode", async () => {
    const customDraft = {
      allDay: false,
      eventType: "race_target",
      mode: "custom",
      notes: "Bring fuel",
      recurrenceEndDate: "2026-07-01",
      recurrenceFrequency: "weekly",
      routeId: "route-1",
      routeName: "River Loop",
      scheduledDate: "2026-06-02",
      startsAt: new Date("2026-06-02T17:30:00.000Z"),
      timezone: "Pacific/Auckland",
      title: "Target race",
    };
    createDefaultDraftMock.mockReturnValue(customDraft);
    await renderNative(<CreateEventFlow onCancel={jest.fn()} onCreated={jest.fn()} />);

    await fireEvent(screen.getByTestId("editable"), "changeMode", "planned");
    await fireEvent(screen.getByTestId("editable"), "changeMode", "custom");

    expect(screen.getByTestId("editable").props.draft).toEqual(customDraft);
  });

  it("reports route-only changes as dirty and becomes clean when they are reversed", async () => {
    const onDirtyChange = jest.fn();
    await renderNative(
      <CreateEventFlow
        onCancel={jest.fn()}
        onCreated={jest.fn()}
        onDirtyChange={onDirtyChange}
        updateEvent={eventDefaults}
      />,
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await fireEvent(screen.getByTestId("picker-routes"), "select", {
      id: "route-1",
      name: "River Loop",
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await fireEvent(screen.getByTestId("editable"), "removeRoute");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  beforeEach(() => {
    updateMutateMock.mockClear();
  });

  it("fails closed for a top-level ID with a null relation, including an imperative stale submission", async () => {
    const planReference = { activity_plan_id: "plan-1", activity_plan: null };
    const ref = createRef<{ submit: () => void }>();
    await renderNative(
      <CreateEventFlow
        ref={ref}
        onCancel={jest.fn()}
        onCreated={jest.fn()}
        updateEvent={{ ...eventDefaults, ...planReference }}
      />,
    );

    expect(screen.getByTestId("read-only")).toBeTruthy();
    ref.current?.submit();
    expect(updateMutateMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a linked event", { activity_plan: { id: "plan-1" } }],
    ["an unlinked event", {}],
  ])("keeps %s editable", async (_label, planReference) => {
    await renderNative(
      <CreateEventFlow
        onCancel={jest.fn()}
        onCreated={jest.fn()}
        updateEvent={{ ...eventDefaults, ...planReference }}
      />,
    );

    expect(screen.getByTestId("editable")).toBeTruthy();
  });
});
