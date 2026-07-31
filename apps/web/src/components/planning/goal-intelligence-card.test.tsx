// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoalIntelligenceCard } from "./goal-intelligence-card";

afterEach(() => cleanup());

describe("GoalIntelligenceCard", () => {
  it("offers an observable retry when intelligence loading fails", () => {
    const onRetry = vi.fn();

    render(<GoalIntelligenceCard isError isLoading={false} onRetry={onRetry} />);

    expect(screen.getByTestId("goal-intelligence")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/could not be refreshed/i);
    fireEvent.click(screen.getByTestId("goal-intelligence-retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps stale intelligence visible and names empty explainability sections", () => {
    render(
      <GoalIntelligenceCard
        intelligence={{
          explainability: {
            assessment: { at: "2026-07-10T12:00:00.000Z", state: "unknown", uncertainty: "high" },
            evidence: [],
            limits: [],
            coverage: [],
            collectionPrompts: [],
          },
        }}
        isError
        isLoading={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/as of 2026-07-10/i)).toBeTruthy();
    expect(screen.getByText(/no evidence was used/i)).toBeTruthy();
    expect(screen.getByText(/no assessment limits/i)).toBeTruthy();
    expect(screen.getByText(/no coverage details/i)).toBeTruthy();
    expect(screen.getByText(/no collection prompts/i)).toBeTruthy();
  });
});
