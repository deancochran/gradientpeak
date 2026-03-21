import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { avatarStackFixtures } from "./fixtures";
import { AvatarStack } from "./index.web";

describe("AvatarStack web", () => {
  it("renders shown avatars and hidden count from fixtures", () => {
    renderWeb(<AvatarStack {...avatarStackFixtures.team} />);

    expect(screen.getByText("AM")).toBeInTheDocument();
    expect(screen.getByText("JL")).toBeInTheDocument();
    expect(screen.getByText("SP")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
