import { CircleAlertIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { emptyStateCardFixtures } from "./fixtures";
import { EmptyStateCard } from "./index.web";

describe("EmptyStateCard web", () => {
  it("renders content and action from fixtures", () => {
    const onAction = vi.fn();

    renderWeb(
      <EmptyStateCard
        {...emptyStateCardFixtures.generic}
        icon={CircleAlertIcon}
        onAction={onAction}
      />,
    );

    expect(screen.getByText(emptyStateCardFixtures.generic.title)).toBeInTheDocument();
    expect(screen.getByText(emptyStateCardFixtures.generic.description)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: emptyStateCardFixtures.generic.actionLabel }),
    );
    expect(onAction).toHaveBeenCalled();
  });

  it("keeps icon, content, and action in the native-aligned vertical order for long text", () => {
    const { container } = renderWeb(
      <EmptyStateCard
        {...emptyStateCardFixtures.longText}
        icon={CircleAlertIcon}
        onAction={vi.fn()}
      />,
    );

    const content = container.querySelector(".flex.flex-col.items-center");
    expect(content?.className).toContain("flex-col");
    expect(content?.textContent).toContain(emptyStateCardFixtures.longText.title);
    expect(content?.textContent).toContain(emptyStateCardFixtures.longText.description);
    expect(content?.textContent).toContain(emptyStateCardFixtures.longText.actionLabel);
  });

  it("announces recoverable unavailable errors without treating them as empty", () => {
    renderWeb(<EmptyStateCard {...emptyStateCardFixtures.unavailable} onAction={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });
});
