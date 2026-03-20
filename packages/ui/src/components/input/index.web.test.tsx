import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Input } from "./index.web";

describe("Input web", () => {
  it("maps normalized test props onto the DOM input", () => {
    renderWeb(
      <Input
        accessibilityLabel="Email"
        id="email-input"
        testId="auth-email"
        type="email"
      />,
    );

    const input = screen.getByRole("textbox", { name: "Email" });

    expect(input).toHaveAttribute("data-testid", "auth-email");
    expect(input).toHaveAttribute("id", "email-input");
  });
});
