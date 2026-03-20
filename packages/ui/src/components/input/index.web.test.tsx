import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { inputFixtures } from "./fixtures";
import { Input } from "./index.web";

describe("Input web", () => {
  it("maps normalized test props onto the DOM input", () => {
    renderWeb(<Input {...inputFixtures.email} />);

    const input = screen.getByRole("textbox", {
      name: inputFixtures.email.accessibilityLabel,
    });

    expect(input).toHaveAttribute("data-testid", inputFixtures.email.testId);
    expect(input).toHaveAttribute("id", inputFixtures.email.id);
  });
});
