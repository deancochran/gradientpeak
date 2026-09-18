import { createElement } from "react";
import { useForm } from "react-hook-form";
import { fireEvent, renderNative, screen } from "../../test/render-native";
import {
  type ActivityPlanBasicsFormData,
  ActivityPlanBasicsSection,
} from "./ActivityPlanBasicsSection";

const activityCategorySelectorMock = jest.fn((props: object) =>
  createElement("ActivityCategorySelector", props),
);

jest.mock("@/components/activity-plan/activity/ActivityCategorySelector", () => ({
  ActivityCategorySelector: (props: object) => activityCategorySelectorMock(props),
}));

function BasicsHarness({ disabled = false }: { disabled?: boolean }) {
  const form = useForm<ActivityPlanBasicsFormData>({
    defaultValues: { name: "Intervals", description: "Keep this pacing plan." },
  });
  return (
    <ActivityPlanBasicsSection
      disabled={disabled}
      activityCategory="run"
      form={form}
      onChangeActivityCategory={jest.fn()}
    />
  );
}

describe("ActivityPlanBasicsSection", () => {
  it("freezes existing metadata and category controls while a save is pending", async () => {
    const view = await renderNative(<BasicsHarness />);
    await fireEvent.press(screen.getByLabelText("Edit description"));
    await view.rerender(<BasicsHarness disabled />);
    expect(screen.getByLabelText(/Plan name/).props.editable).toBe(false);
    expect(screen.getByLabelText("Description").props.editable).toBe(false);
    expect(screen.getByLabelText("Description").props.value).toBe("Keep this pacing plan.");
    expect(activityCategorySelectorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true }),
    );
  });
  it("keeps a stored description collapsed until it is explicitly opened", async () => {
    await renderNative(<BasicsHarness />);

    expect(screen.getByText("Description: Keep this pacing plan.")).toBeTruthy();
    expect(screen.queryByPlaceholderText("What is this session for?")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Edit description"));
    const description = screen.getByPlaceholderText("What is this session for?");
    await fireEvent.changeText(description, "Updated pacing plan.");
    await fireEvent.press(screen.getByLabelText("Hide description"));
    await fireEvent.press(screen.getByLabelText("Edit description"));

    expect(screen.getByDisplayValue("Updated pacing plan.")).toBeTruthy();
  });

  it("aligns the category trigger with the plan-name control rather than its label", async () => {
    await renderNative(<BasicsHarness />);

    expect(activityCategorySelectorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accessibilityLabel: "Plan activity category",
        compact: true,
      }),
    );
    const nameInput = screen.getByPlaceholderText("Plan name");
    expect(nameInput.props.value).toBe("Intervals");
  });
});
