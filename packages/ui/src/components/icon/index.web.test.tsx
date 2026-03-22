import { CircleAlertIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { iconFixtures } from "./fixtures";
import { Icon } from "./index.web";

describe("Icon web", () => {
  it("renders the requested icon component", () => {
    renderWeb(
      <Icon
        as={CircleAlertIcon}
        data-testid={iconFixtures.status.testId}
        size={iconFixtures.status.size}
      />,
    );

    expect(screen.getByTestId(iconFixtures.status.testId)).toHaveAttribute(
      "width",
      String(iconFixtures.status.size),
    );
  });
});
