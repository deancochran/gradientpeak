import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { Toggle } from "./index.web";

describe("Toggle web", () => {
  it("maps normalized test props and forwards pressed changes", () => {
    const onPressedChange = vi.fn();

    renderWeb(
      <Toggle
        accessibilityLabel="Pin workout"
        onPressedChange={onPressedChange}
        pressed
        testId="pin-workout-toggle"
      >
        Pin
      </Toggle>,
    );

    const toggle = screen.getByRole("button", { name: "Pin workout" });

    expect(toggle).toHaveAttribute("data-testid", "pin-workout-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(onPressedChange).toHaveBeenCalledWith(false);
  });
});
