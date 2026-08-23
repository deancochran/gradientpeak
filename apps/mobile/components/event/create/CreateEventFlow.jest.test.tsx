import React, { createRef } from "react";

import { createHost } from "@/test/mock-components";
import { renderNative, screen } from "@/test/render-native";

const updateMutateMock = jest.fn();

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
  ResourcePickerModal: createHost("ResourcePickerModal"),
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
  createDefaultEventDraft: jest.fn(),
  removeActivityPlanFromDraft: jest.fn(),
}));
jest.mock("./RepeatStep", () => ({ __esModule: true, RepeatStep: createHost("RepeatStep") }));
jest.mock("./CreateEventMainStep", () => ({
  __esModule: true,
  CreateEventMainStep: ({ isReadOnly }: { isReadOnly?: boolean }) =>
    React.createElement("CreateEventMainStep", { testID: isReadOnly ? "read-only" : "editable" }),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    events: {
      create: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutate: updateMutateMock }) },
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
