import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { Toggle } from "./index.web";

describe("Toggle web", () => {
  it("maps normalized test props and forwards pressed changes", () => {
    const onPressedChange = vi.fn();

    renderWeb(
      <Toggle
        accessibilityLabel="Pin activity"
        onPressedChange={onPressedChange}
        pressed
        testId="pin-activity-toggle"
      >
        Pin
      </Toggle>,
    );

    const toggle = screen.getByRole("button", { name: "Pin activity" });

    expect(toggle).toHaveAttribute("data-testid", "pin-activity-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(onPressedChange).toHaveBeenCalledWith(false);
  });
});
