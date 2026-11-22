import { cleanup } from "@testing-library/react";
import { CircleAlertIcon } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { emptyStateCardFixtures } from "./fixtures";
import { EmptyStateCard } from "./index.web";

afterEach(cleanup);

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

  it("keeps compact feedback content and its action separate from a surrounding form", () => {
    const onAction = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    renderWeb(
      <form onSubmit={onSubmit}>
        <EmptyStateCard
          compact
          title="Access unavailable"
          tone="denied"
          actionLabel="Choose another"
          onAction={onAction}
          testID="access-state"
        >
          <p>Your unsaved draft is retained.</p>
        </EmptyStateCard>
      </form>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("access-state")).toHaveTextContent("Your unsaved draft is retained.");
    fireEvent.click(screen.getByRole("button", { name: "Choose another" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("contains unbroken title, description, and action labels at compact widths", () => {
    renderWeb(<EmptyStateCard {...emptyStateCardFixtures.unbrokenText} onAction={vi.fn()} />);

    expect(screen.getByText(emptyStateCardFixtures.unbrokenText.title).className).toContain(
      "[overflow-wrap:anywhere]",
    );
    expect(screen.getByText(emptyStateCardFixtures.unbrokenText.description).className).toContain(
      "[overflow-wrap:anywhere]",
    );
    const action = screen.getByRole("button", {
      name: emptyStateCardFixtures.unbrokenText.actionLabel,
    });
    expect(action.className).toContain("whitespace-normal");
    expect(action.className).toContain("[overflow-wrap:anywhere]");
  });
});
