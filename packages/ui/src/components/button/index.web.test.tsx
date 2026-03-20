import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Button } from "./index.web";

describe("Button web", () => {
  it("maps normalized test props onto the DOM button", () => {
    renderWeb(
      <Button
        accessibilityLabel="Save changes"
        id="save-button"
        testId="settings-save"
      >
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save changes" });

    expect(button).toHaveAttribute("data-testid", "settings-save");
    expect(button).toHaveAttribute("id", "save-button");
  });
});
