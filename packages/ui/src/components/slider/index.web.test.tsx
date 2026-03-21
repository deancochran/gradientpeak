import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { sliderFixtures } from "./fixtures";
import { Slider } from "./index.web";

describe("Slider web", () => {
  it("maps normalized test props and forwards slider events", () => {
    const onValueChange = vi.fn();
    const onSlidingComplete = vi.fn();

    renderWeb(
      <Slider
        {...sliderFixtures.effort}
        onSlidingComplete={onSlidingComplete}
        onValueChange={onValueChange}
      />,
    );

    const control = screen.getByRole("slider", {
      name: sliderFixtures.effort.accessibilityLabel,
    });

    expect(control).toHaveAttribute("data-testid", sliderFixtures.effort.testId);
    expect(control).toHaveAttribute("id", sliderFixtures.effort.id);

    fireEvent.change(control, {
      currentTarget: { value: "7.5" },
      target: { value: "7.5" },
    });
    (control as HTMLInputElement).value = "7.5";
    fireEvent.mouseUp(control);

    expect(onValueChange).toHaveBeenCalledWith(7.5);
    expect(onSlidingComplete).toHaveBeenCalledWith(7.5);
  });
});
