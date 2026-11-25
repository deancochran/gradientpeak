import React from "react";
import { createHost, createPressableHost, type HostProps } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { TrainingPlanTemplateSchedulingDialog } from "../TrainingPlanTemplateSchedulingDialog";

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createPressableHost("Button"),
}));
jest.mock("@repo/ui/components/date-input", () => ({
  __esModule: true,
  DateInput: createHost("DateInput"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppFormModal: ({
    children,
    primaryAction,
    secondaryAction,
    ...props
  }: HostProps & { primaryAction?: React.ReactNode; secondaryAction?: React.ReactNode }) =>
    React.createElement("AppFormModal", props, children, primaryAction, secondaryAction),
}));

describe("TrainingPlanTemplateSchedulingDialog", () => {
  it("allows editing during a read preview, locks during a write, and exposes query retry", async () => {
    const retry = jest.fn();
    const props = {
      applyPending: false,
      onApply: jest.fn(),
      onScheduleModalOpenChange: jest.fn(),
      onSelectScheduleApplicationMode: jest.fn(),
      onSelectScheduleAnchorMode: jest.fn(),
      scheduleApplicationMode: "full" as const,
      scheduleAnchorContent: {
        fieldLabel: "Start On",
        fieldPlaceholder: "Start date",
        helperText: "Choose a start date.",
      },
      scheduleAnchorMode: "start" as const,
      scheduleReview: null,
      scheduledApplications: [],
      selectedApplicationId: "",
      onSelectApplication: jest.fn(),
      setTemplateAnchorDate: jest.fn(),
      showScheduleModal: true,
      templateAnchorDate: "2026-10-02",
    };
    const view = await renderNative(
      <TrainingPlanTemplateSchedulingDialog {...props} previewPending />,
    );
    expect(screen.getByTestId("training-plan-schedule-confirm").props.disabled).toBe(true);
    expect(view.container.queryAll((node) => node.type === "DateInput")[0]?.props.disabled).toBe(
      false,
    );
    await view.rerender(
      <TrainingPlanTemplateSchedulingDialog {...props} applyPending inputsLocked />,
    );
    expect(view.container.queryAll((node) => node.type === "DateInput")[0]?.props.disabled).toBe(
      true,
    );
    expect(screen.getByTestId("training-plan-schedule-cancel").props.disabled).toBe(true);
    await view.rerender(
      <TrainingPlanTemplateSchedulingDialog
        {...props}
        applicationsError="Schedule offline"
        onRetryApplications={retry}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    await fireEvent.press(screen.getByText("Retry scheduled applications"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows direct scheduling controls without active-plan replacement copy", async () => {
    await renderNative(
      <TrainingPlanTemplateSchedulingDialog
        applyPending={false}
        onApply={jest.fn()}
        onScheduleModalOpenChange={jest.fn()}
        onSelectScheduleApplicationMode={jest.fn()}
        onSelectScheduleAnchorMode={jest.fn()}
        scheduleApplicationMode="full"
        scheduleAnchorContent={{
          fieldLabel: "Start On",
          fieldPlaceholder: "Select start date",
          helperText: "Leave blank to start today.",
        }}
        scheduleAnchorMode="start"
        scheduleReview={null}
        scheduledApplications={[]}
        selectedApplicationId=""
        onSelectApplication={jest.fn()}
        setTemplateAnchorDate={jest.fn()}
        showScheduleModal={true}
        templateAnchorDate=""
      />,
    );

    expect(screen.getByTestId("training-plan-schedule-modal")).toBeTruthy();
    expect(screen.getByTestId("training-plan-schedule-confirm")).toBeTruthy();
    expect(screen.queryByText(/replace scheduled plan/i)).toBeNull();
    expect(screen.queryByText(/current plan already scheduled/i)).toBeNull();
    expect(screen.queryByText(/open current plan/i)).toBeNull();
  });

  it("shows the server review before confirming", async () => {
    await renderNative(
      <TrainingPlanTemplateSchedulingDialog
        applyPending={false}
        onApply={jest.fn()}
        onScheduleModalOpenChange={jest.fn()}
        onSelectScheduleApplicationMode={jest.fn()}
        onSelectScheduleAnchorMode={jest.fn()}
        scheduleApplicationMode="full"
        scheduleAnchorContent={{
          fieldLabel: "Start On",
          fieldPlaceholder: "Select start date",
          helperText: "Leave blank to start today.",
        }}
        scheduleAnchorMode="start"
        scheduleReview={{
          preview: {
            applicable: true,
            replacement: { affected: [{}] },
            sessions: [{ planningDate: "2026-09-15" }],
            unresolved: [],
          },
        }}
        scheduledApplications={[]}
        selectedApplicationId=""
        onSelectApplication={jest.fn()}
        setTemplateAnchorDate={jest.fn()}
        showScheduleModal={true}
        templateAnchorDate=""
      />,
    );

    expect(screen.getByText("Schedule review")).toBeTruthy();
    expect(screen.getByText(/1 session scheduled from 2026-09-15/)).toBeTruthy();
    expect(screen.getByText(/Replaces 1 currently scheduled session/)).toBeTruthy();
  });
});
