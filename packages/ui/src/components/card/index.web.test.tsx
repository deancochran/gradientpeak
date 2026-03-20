import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { cardFixtures } from "./fixtures";
import { Card, CardContent, CardHeader, CardTitle } from "./index.web";

describe("Card web", () => {
  it("maps normalized test props and still exposes semantic content", () => {
    renderWeb(
      <Card {...cardFixtures.profile}>
        <CardHeader>
          <CardTitle>{cardFixtures.profile.title}</CardTitle>
        </CardHeader>
        <CardContent>Details</CardContent>
      </Card>,
    );

    const card = screen.getByRole("article", {
      name: cardFixtures.profile.accessibilityLabel,
    });

    expect(card).toHaveAttribute("data-testid", cardFixtures.profile.testId);
    expect(screen.getByText(cardFixtures.profile.title)).toBeInTheDocument();
  });
});
