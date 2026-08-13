import { render } from "@testing-library/react-native";
import { ConstraintIndicator } from "./ConstraintIndicator";

describe("ConstraintIndicator", () => {
  it("explains fail-closed weekly Load instead of describing it as over the limit", () => {
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

    expect(view.getAllByText("Unavailable")).toHaveLength(2);
    expect(
      view.getByText("❌ Common Load unavailable; this constraint cannot be evaluated"),
    ).toBeTruthy();
    expect(view.queryByText("❌ Exceeds recommended limit")).toBeNull();
  });
});
