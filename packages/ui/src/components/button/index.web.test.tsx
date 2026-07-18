import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { buttonFixtures } from "./fixtures";
import { Button, IconButton } from "./index.web";

describe("Button web", () => {
  it("maps normalized test props onto the DOM button", () => {
    renderWeb(<Button {...buttonFixtures.save}>{buttonFixtures.save.children}</Button>);

    const button = screen.getByRole("button", {
      name: buttonFixtures.save.accessibilityLabel,
    });

    expect(button).toHaveAttribute("data-testid", buttonFixtures.save.testId);
    expect(button).toHaveAttribute("id", buttonFixtures.save.id);
  });

  it("keeps the icon-only contract available on web", () => {
    renderWeb(
      <IconButton {...buttonFixtures.moreActions}>
        <span aria-hidden="true">⋯</span>
      </IconButton>,
    );

    expect(
      screen.getByRole("button", { name: buttonFixtures.moreActions.accessibilityLabel }),
    ).toHaveAttribute("data-testid", buttonFixtures.moreActions.testId);
  });
});
