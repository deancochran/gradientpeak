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
      screen.getByRole("button", { name: emptyStateCardFixtures.generic.actionLabel! }),
    );
    expect(onAction).toHaveBeenCalled();
  });
});
