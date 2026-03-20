import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { badgeFixtures } from "./fixtures";
import { Badge } from "./index.web";

describe("Badge web", () => {
  it("maps normalized test props and renders its label", () => {
    renderWeb(
      <Badge testId={badgeFixtures.featured.testId}>
        {badgeFixtures.featured.children}
      </Badge>,
    );

    expect(screen.getByTestId(badgeFixtures.featured.testId)).toHaveTextContent(
      badgeFixtures.featured.children,
    );
  });
});
