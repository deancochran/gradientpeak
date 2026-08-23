import React from "react";

import { createHost } from "../../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../../test/render-native";

const editableScheduleField = {
  id: "schedule-field",
  planLocalKey: "durationWeeks",
  planLocalSupport: "editable",
  tab: "schedule",
};
const editableRecoveryField = {
  id: "recovery-field",
  planLocalKey: "recoveryPriority",
  planLocalSupport: "editable",
  tab: "recovery",
};
let mockScrollViewCount = 0;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: (props: Record<string, unknown>) => {
    mockScrollViewCount += 1;
    return React.createElement("ScrollView", props);
  },
  View: createHost("View"),
}));
jest.mock("@repo/core", () => ({
  __esModule: true,
  trainingPreferenceCatalog: [
    editableScheduleField,
    editableRecoveryField,
    {
      id: "read-only",
      planLocalKey: "weeklySessionCount",
      planLocalSupport: "read_only",
      tab: "schedule",
    },
    {
      id: "unsupported",
      planLocalKey: undefined,
      planLocalSupport: "unsupported",
      tab: "availability",
    },
  ],
}));
jest.mock("@repo/ui/components/select", () => ({
  __esModule: true,
  Select: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Select", { ...props, testID: "preference-group-select" }, children),
  SelectContent: createHost("SelectContent"),
  SelectItem: createHost("SelectItem"),
  SelectTrigger: createHost("SelectTrigger"),
  SelectValue: createHost("SelectValue"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/settings/training-preferences/TrainingPreferencesPanel", () => ({
  __esModule: true,
  TrainingPreferencesPanel: createHost("TrainingPreferencesPanel"),
}));
jest.mock("@/components/settings/training-preferences/TrainingPreferenceFieldRenderer", () => ({
  __esModule: true,
  TrainingPreferenceFieldRenderer: ({
    field,
    onChange,
    onClear,
  }: {
    field: { id: string };
    onChange?: (value: number | null) => void;
    onClear?: () => void;
  }) => (
    <React.Fragment>
      {React.createElement("Field", { testID: `field-${field.id}` })}
      {React.createElement("Pressable", {
        onPress: () => onChange?.(8),
        testID: `change-${field.id}`,
      })}
      {React.createElement("Pressable", { onPress: onClear, testID: `clear-${field.id}` })}
    </React.Fragment>
  ),
}));

const { PlanLocalPreferencesSection } = require("../PlanLocalPreferencesSection");

describe("PlanLocalPreferencesSection", () => {
  it("uses an accessible 44pt group select, exposes only editable groups, and preserves field callbacks", async () => {
    const onChangeField = jest.fn();
    const onRemoveField = jest.fn();
    mockScrollViewCount = 0;
    await renderNative(
      <PlanLocalPreferencesSection
        fields={[
          { key: "durationWeeks", value: { overridden: true, value: 6 } },
          { key: "recoveryPriority", value: { overridden: true, value: 3 } },
        ]}
        onChangeField={onChangeField}
        onRemoveField={onRemoveField}
      />,
    );

    expect(screen.getByLabelText("Preference group").props.className).toContain("min-h-11");
    expect(screen.getByTestId("field-schedule-field")).toBeTruthy();
    expect(screen.queryByTestId("field-read-only")).toBeNull();
    expect(mockScrollViewCount).toBe(0);

    const select = screen.getByTestId("preference-group-select");
    await fireEvent(select, "onValueChange", { value: "recovery" });

    expect(screen.getByTestId("field-recovery-field")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("change-recovery-field"));
    await fireEvent.press(screen.getByTestId("clear-recovery-field"));
    expect(onChangeField).toHaveBeenCalledWith("recoveryPriority", 8);
    expect(onRemoveField).toHaveBeenCalledWith("recoveryPriority");
  });
});
