import { describe, expect, it } from "vitest";
import {
  hasBehaviorControlsChanged,
  shouldApplyBehaviorControlSuggestions,
} from "./behaviorControlsState";

describe("behaviorControlsState", () => {
  it("marks behavior controls dirty when user value changes", () => {
    expect(
      hasBehaviorControlsChanged(
        {
          aggressiveness: 0.5,
          variability: 0.5,
          spike_frequency: 0.35,
          shape_target: 0,
          shape_strength: 0.35,
          recovery_priority: 0.6,
          starting_fitness_confidence: 0.6,
        },
        {
          aggressiveness: 0.7,
          variability: 0.5,
          spike_frequency: 0.35,
          shape_target: 0,
          shape_strength: 0.35,
          recovery_priority: 0.6,
          starting_fitness_confidence: 0.6,
        },
      ),
    ).toBe(true);
  });

  it("keeps behavior controls clean when values are unchanged", () => {
    expect(
      hasBehaviorControlsChanged(
        {
          aggressiveness: 0.5,
          variability: 0.5,
          spike_frequency: 0.35,
          shape_target: 0,
          shape_strength: 0.35,
          recovery_priority: 0.6,
          starting_fitness_confidence: 0.6,
        },
        {
          aggressiveness: 0.5,
          variability: 0.5,
          spike_frequency: 0.35,
          shape_target: 0,
          shape_strength: 0.35,
          recovery_priority: 0.6,
          starting_fitness_confidence: 0.6,
        },
      ),
    ).toBe(false);
  });

  it("prevents recompute suggestions from overriding dirty behavior sliders", () => {
    expect(
      shouldApplyBehaviorControlSuggestions({
        mode: "recompute",
        locked: false,
        dirty: true,
      }),
    ).toBe(false);
  });

  it("still applies recompute suggestions when sliders are pristine and unlocked", () => {
    expect(
      shouldApplyBehaviorControlSuggestions({
        mode: "recompute",
        locked: false,
        dirty: false,
      }),
    ).toBe(true);
  });
});
