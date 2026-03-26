import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { avatarFixtures } from "./fixtures";
import { Avatar, AvatarFallback, AvatarImage } from "./index.web";

describe("Avatar web", () => {
  it("maps normalized test props and renders avatar content", () => {
    renderWeb(
      <Avatar
        accessibilityLabel={avatarFixtures.profile.alt}
        testId={avatarFixtures.profile.testId}
      >
        <AvatarImage alt={avatarFixtures.profile.alt} src={avatarFixtures.profile.imageSrc} />
        <AvatarFallback>{avatarFixtures.profile.fallback}</AvatarFallback>
      </Avatar>,
    );

    expect(screen.getByTestId(avatarFixtures.profile.testId)).toHaveAttribute(
      "aria-label",
      avatarFixtures.profile.alt,
    );
    expect(screen.getByText(avatarFixtures.profile.fallback)).toBeInTheDocument();
  });
});
