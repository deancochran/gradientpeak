import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { checkboxFixtures } from "./fixtures";
import { Checkbox } from "./index.web";

describe("Checkbox web", () => {
  it("maps normalized test props and forwards checked changes", () => {
    const onCheckedChange = vi.fn();

    renderWeb(
      <Checkbox {...checkboxFixtures.terms} checked={false} onCheckedChange={onCheckedChange} />,
    );

    const control = screen.getByRole("checkbox", {
      name: checkboxFixtures.terms.accessibilityLabel,
    });

    expect(control).toHaveAttribute("data-testid", checkboxFixtures.terms.testId);
    expect(control).toHaveAttribute("id", checkboxFixtures.terms.id);

    fireEvent.click(control);

    expect(onCheckedChange).toHaveBeenCalled();
  });
});
