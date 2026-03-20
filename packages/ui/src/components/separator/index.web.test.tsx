import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Separator } from "./index.web";

describe("Separator web", () => {
  it("maps normalized test props onto the separator root", () => {
    renderWeb(
      <Separator
        accessibilityLabel="Section divider"
        decorative={false}
        id="section-divider"
        testId="section-divider"
      />,
    );

    const separator = screen.getByTestId("section-divider");

    expect(separator).toHaveAttribute("aria-label", "Section divider");
    expect(separator).toHaveAttribute("id", "section-divider");
  });
});
