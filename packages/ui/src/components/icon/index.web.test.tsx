import { CircleAlertIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Icon } from "./index.web";

describe("Icon web", () => {
  it("renders the requested icon component", () => {
    renderWeb(
      <Icon as={CircleAlertIcon} data-testid="status-icon" size={18} />,
    );

    expect(screen.getByTestId("status-icon")).toHaveAttribute("width", "18");
  });
});
