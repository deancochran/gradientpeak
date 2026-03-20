import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Card, CardContent, CardHeader, CardTitle } from "./index.web";

describe("Card web", () => {
  it("maps normalized test props and still exposes semantic content", () => {
    renderWeb(
      <Card
        accessibilityLabel="Profile summary"
        role="article"
        testId="profile-card"
      >
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>Details</CardContent>
      </Card>,
    );

    const card = screen.getByRole("article", { name: "Profile summary" });

    expect(card).toHaveAttribute("data-testid", "profile-card");
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });
});
