import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Switch } from "./index.web";

describe("Switch web", () => {
  it("maps normalized test props onto the DOM switch", () => {
    renderWeb(
      <Switch accessibilityLabel="Email notifications" checked testId="email-notifications" />,
    );

    const switchRoot = screen.getByRole("switch", {
      name: "Email notifications",
    });

    expect(switchRoot).toHaveAttribute("data-testid", "email-notifications");
    expect(switchRoot).toHaveAttribute("data-state", "checked");
  });
});
