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

  it("keeps an empty description directly editable after entering and clearing it", async () => {
    await renderNative(<EmptyBasicsHarness />);

    expect(screen.getByLabelText("Description")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Description"), "Draft notes");
    await fireEvent.changeText(screen.getByLabelText("Description"), "");
    expect(screen.getByLabelText("Description").props.value).toBe("");
    expect(screen.queryByText("Add description")).toBeNull();
  });

  it("keeps a deliberately blank title editable without replacing it with a default", async () => {
    await renderNative(<BlankNameHarness />);

    expect(screen.getByPlaceholderText("Plan name").props.value).toBe("");
    expect(screen.queryByLabelText("Edit plan name")).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText("Plan name"), "Lunch run");
    expect(screen.getByPlaceholderText("Plan name").props.value).toBe("Lunch run");
    await fireEvent.changeText(screen.getByPlaceholderText("Plan name"), "");
    expect(screen.getByPlaceholderText("Plan name").props.value).toBe("");
  });
});
