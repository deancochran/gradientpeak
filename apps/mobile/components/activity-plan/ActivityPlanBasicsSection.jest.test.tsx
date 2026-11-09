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

function EmptyBasicsHarness() {
  const form = useForm<ActivityPlanBasicsFormData>({
    defaultValues: { name: "Intervals", description: "" },
  });
  return (
    <ActivityPlanBasicsSection
      activityCategory="run"
      form={form}
      onChangeActivityCategory={jest.fn()}
    />
  );
}

function BlankNameHarness() {
  const form = useForm<ActivityPlanBasicsFormData>({
    defaultValues: { name: "", description: "" },
  });
  return (
    <ActivityPlanBasicsSection
      activityCategory="run"
      form={form}
      onChangeActivityCategory={jest.fn()}
    />
  );
}

describe("ActivityPlanBasicsSection", () => {
  it("freezes existing metadata and category controls while a save is pending", async () => {
    const view = await renderNative(<BasicsHarness />);
    await view.rerender(<BasicsHarness disabled />);
    expect(screen.getByLabelText(/Plan name/).props.editable).toBe(false);
    expect(screen.getByLabelText("Description").props.editable).toBe(false);
    expect(screen.getByLabelText("Description").props.value).toBe("Keep this pacing plan.");
    expect(activityCategorySelectorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true }),
    );
  });
  it("keeps the description visible and editable without a disclosure", async () => {
    await renderNative(<BasicsHarness />);

    const description = screen.getByPlaceholderText("What is this session for?");
    await fireEvent.changeText(description, "Updated pacing plan.");

    expect(screen.getByDisplayValue("Updated pacing plan.")).toBeTruthy();
    expect(screen.queryByLabelText("Edit description")).toBeNull();
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
    const row = screen.getByTestId("activity-plan-name-row");
    expect(row.children[0]).toEqual(
      expect.objectContaining({
        props: expect.objectContaining({ className: "min-w-0 flex-1" }),
      }),
    );
  });

  it("adds, cancels, and clears an optional description without retaining an empty field", async () => {
    await renderNative(<EmptyBasicsHarness />);

    expect(screen.queryByLabelText("Description")).toBeNull();
    await fireEvent.press(screen.getByText("Add description"));
    expect(screen.getByLabelText("Description")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Cancel description"));
    expect(screen.queryByLabelText("Description")).toBeNull();

    await fireEvent.press(screen.getByText("Add description"));
    await fireEvent.changeText(screen.getByLabelText("Description"), "Draft notes");
    await fireEvent.press(screen.getByLabelText("Clear description"));
    expect(screen.queryByLabelText("Description")).toBeNull();
    expect(screen.getByText("Add description")).toBeTruthy();
  });

  it("uses New plan only as a blank-title placeholder and restores or clears a title explicitly", async () => {
    await renderNative(<BlankNameHarness />);

    expect(screen.getByText("New plan")).toBeTruthy();
    expect(screen.queryByLabelText("Plan name")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Edit plan name"));
    await fireEvent.changeText(screen.getByPlaceholderText("Plan name"), "Lunch run");
    await fireEvent.press(screen.getByLabelText("Cancel plan name"));
    expect(screen.getByText("New plan")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Edit plan name"));
    await fireEvent.changeText(screen.getByPlaceholderText("Plan name"), "Lunch run");
    await fireEvent.press(screen.getByLabelText("Clear plan name"));
    expect(screen.getByPlaceholderText("Plan name").props.value).toBe("");
  });
});
