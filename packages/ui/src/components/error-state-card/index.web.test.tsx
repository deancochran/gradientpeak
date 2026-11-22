import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { errorStateCardFixtures } from "./fixtures";
import { ErrorMessage, ErrorStateCard } from "./index.web";

afterEach(cleanup);

describe("ErrorStateCard web", () => {
  it("renders retryable card content from fixtures", () => {
    const onRetry = vi.fn();

    renderWeb(<ErrorStateCard {...errorStateCardFixtures.generic} onRetry={onRetry} />);

    expect(screen.getByText(errorStateCardFixtures.generic.title)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: errorStateCardFixtures.generic.retryLabel }),
    );
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders inline message content", () => {
    renderWeb(<ErrorMessage {...errorStateCardFixtures.inline} />);

    expect(screen.getByText(errorStateCardFixtures.inline.message)).toBeInTheDocument();
  });

  it("announces failures with vertical content and can explicitly withhold retry", () => {
    renderWeb(
      <ErrorStateCard
        title="Unable to load"
        message="Your draft is unchanged."
        onRetry={vi.fn()}
        showRetryButton={false}
      />,
    );
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Your draft is unchanged.")).toBeInTheDocument();
  });
});
