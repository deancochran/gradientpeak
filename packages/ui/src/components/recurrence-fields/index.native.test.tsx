import { DEFAULT_WEEKLY_COUNT_RECURRENCE } from "@repo/core/recurrence";
import { useState } from "react";
import { fireEvent, renderNative } from "../../test/render-native";
import { RecurrenceFields } from "./index.native";

describe("RecurrenceFields native", () => {
  it("is controlled and exposes bounded accessible controls", () => {
    function Harness() {
      const [value, setValue] = useState(DEFAULT_WEEKLY_COUNT_RECURRENCE);
      return <RecurrenceFields onChange={setValue} testIdPrefix="test" value={value} />;
    }

    const { getByLabelText, getByTestId, queryByTestId } = renderNative(<Harness />);
    const toggle = getByLabelText("Repeat weekly");

    expect(toggle.props.checked).toBe(false);
    expect(queryByTestId("test-repeat-count")).toBeNull();

    fireEvent(toggle, "onCheckedChange", true);
    expect(getByTestId("test-repeat-count").props.children.join("")).toBe(
      "Ends after 4 occurrences",
    );

    fireEvent.press(getByLabelText("Decrease occurrence count"));
    expect(getByTestId("test-repeat-count").props.children.join("")).toBe(
      "Ends after 3 occurrences",
    );
  });

  it("disables interaction and announces errors", () => {
    const onChange = jest.fn();
    const { getByLabelText, getByRole } = renderNative(
      <RecurrenceFields
        disabled
        error="Choose a supported count"
        onChange={onChange}
        value={{ ...DEFAULT_WEEKLY_COUNT_RECURRENCE, enabled: true }}
      />,
    );

    expect(getByLabelText("Repeat weekly").props.accessibilityState.disabled).toBe(true);
    expect(getByLabelText("Repeat weekly").props.accessibilityHint).toContain(
      "Error: Choose a supported count",
    );
    expect(getByLabelText("Decrease occurrence count").props.disabled).toBe(true);
    expect(getByRole("alert")).toBeTruthy();
  });
});
