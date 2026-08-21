import { render } from "@testing-library/react-native";
import { ConstraintIndicator } from "./ConstraintIndicator";

describe("ConstraintIndicator", () => {
  it("normalizes missing planned Load to a satisfied zero state", () => {
    const view = render(
      <ConstraintIndicator
        label="Weekly Load"
        status="violated"
        currentValue={null}
        newValue={null}
        limit={300}
        unit="Common Load"
      />,
    );

    expect(view.getAllByText("0")).toHaveLength(2);
    expect(view.queryByText(/unavailable|partial|incomplete/i)).toBeNull();
    expect(view.queryByText("❌ Exceeds recommended limit")).toBeNull();
  });
});
