import { render } from "@testing-library/react-native";
import { ConstraintIndicator } from "./ConstraintIndicator";
import { ConstraintValidator } from "./ConstraintValidator";

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

  it("labels a fail-closed aggregate as unevaluable rather than violated", () => {
    const view = render(
      <ConstraintValidator
        validation={{
          canSchedule: false,
          hasWarnings: false,
          constraints: {
            weeklyLoad: { status: "violated", current: null, withNew: null, limit: 300 },
            activitiesPerWeek: { status: "satisfied", current: 2, withNew: 3, limit: 5 },
            consecutiveDays: { status: "satisfied", current: 1, withNew: 2, limit: 3 },
            restDays: { status: "satisfied", current: 5, withNew: 4, minimum: 2 },
          },
        }}
      />,
    );

    expect(view.getByText("❌ Load cannot be evaluated")).toBeTruthy();
    expect(
      view.getByText(
        "Weekly Common Load cannot be evaluated because comparable Common Load is unavailable.",
      ),
    ).toBeTruthy();
    expect(view.queryByText("❌ Constraints violated")).toBeNull();
    expect(
      view.queryByText("⚠️ This activity violates one or more training plan constraints."),
    ).toBeNull();
  });
});
