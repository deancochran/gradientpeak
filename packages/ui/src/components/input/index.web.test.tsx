import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { inputFixtures } from "./fixtures";
import { Input, inputVariants } from "./index.web";

describe("Input web", () => {
  it("uses light non-layout-shifting chrome and preserves consumer overrides", () => {
    expect(inputVariants()).toContain("shadow-none");
    expect(inputVariants()).toContain("focus-visible:ring-2");
    expect(inputVariants({ className: "shadow-sm" })).not.toContain("shadow-none");
  });
  it("maps normalized test props onto the DOM input", () => {
    renderWeb(<Input {...inputFixtures.email} />);

    const input = screen.getByRole("textbox", {
      name: inputFixtures.email.accessibilityLabel,
    });

    expect(input).toHaveAttribute("data-testid", inputFixtures.email.testId);
    expect(input).toHaveAttribute("id", inputFixtures.email.id);
  });

  it("forwards a ref to the focusable input", () => {
    const ref = createRef<HTMLInputElement>();
    renderWeb(<Input ref={ref} {...inputFixtures.email} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
