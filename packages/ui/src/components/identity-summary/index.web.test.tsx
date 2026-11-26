import { describe, expect, it } from "vitest";
import { renderWeb, screen } from "../../test/render-web";
import { identitySummaryFixtures } from "./fixtures";
import { IdentitySummary } from "./index.web";

describe("IdentitySummary web", () => {
  it("keeps title, supporting identity, status, and action in distinct regions", () => {
    renderWeb(
      <IdentitySummary
        {...identitySummaryFixtures.longIdentity}
        action={<a href="/athletes/avery">Open athlete</a>}
        status={<span>Assigned</span>}
      />,
    );

    expect(screen.getByText(identitySummaryFixtures.longIdentity.title)).toBeInTheDocument();
    expect(screen.getByText(identitySummaryFixtures.longIdentity.supporting)).toBeInTheDocument();
    expect(screen.getByText("Assigned")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open athlete" })).toBeInTheDocument();
  });
});
