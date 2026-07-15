import { Form, FormTextField } from "@repo/ui/components/form";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { useActivityPlanBasicsForm } from "../useActivityPlanBasicsForm";

type HarnessProps = {
  name: string;
  onNameChange: (name: string) => void;
};

function Harness({ name, onNameChange }: HarnessProps) {
  const form = useActivityPlanBasicsForm({
    description: "",
    name,
    onDescriptionChange: jest.fn(),
    onNameChange,
  });

  return (
    <Form {...form}>
      <FormTextField control={form.control} label="Plan name" name="name" />
    </Form>
  );
}

describe("useActivityPlanBasicsForm", () => {
  it("separates external hydration from user-originated changes", async () => {
    const onNameChange = jest.fn();
    const view = render(<Harness name="Draft plan" onNameChange={onNameChange} />);

    await act(async () => {
      view.rerender(<Harness name="Hydrated plan" onNameChange={onNameChange} />);
    });

    await waitFor(() => {
      expect(view.getByLabelText("Plan name").props.value).toBe("Hydrated plan");
    });
    expect(onNameChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent(view.getByLabelText("Plan name"), "changeText", "Edited plan");
    });

    expect(onNameChange).toHaveBeenCalledTimes(1);
    expect(onNameChange).toHaveBeenCalledWith("Edited plan");
  });
});
