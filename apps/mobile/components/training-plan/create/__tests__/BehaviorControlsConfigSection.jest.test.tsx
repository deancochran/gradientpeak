import { fireEvent, render, screen } from "@testing-library/react-native";
import { BehaviorControlsConfigSection } from "../BehaviorControlsConfigSection";

const balancedValues = {
  aggressiveness: 0.5,
  variability: 0.5,
  spike_frequency: 0.35,
  shape_target: 0,
  shape_strength: 0.35,
  recovery_priority: 0.6,
  starting_fitness_confidence: 0.6,
};

describe("BehaviorControlsConfigSection", () => {
  it("offers presets and keeps precise controls behind a separate custom surface", () => {
    const onChange = jest.fn();

    render(<BehaviorControlsConfigSection behaviorControls={balancedValues} onChange={onChange} />);

    expect(screen.getByText("Tuning approach")).toBeTruthy();
    expect(screen.getByLabelText("Balanced tuning preset").props.accessibilityState.selected).toBe(
      true,
    );

    fireEvent.press(screen.getByLabelText("Conservative tuning preset"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ aggressiveness: 0.35, recovery_priority: 0.75 }),
    );

    fireEvent.press(screen.getByText("Custom tuning"));
    expect(screen.getByTestId("custom-tuning-modal")).toBeTruthy();
    expect(screen.getByText("Custom values")).toBeTruthy();
  });
});
