import React from "react";
import { createHost, createPressableHost, type HostProps } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
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
});
