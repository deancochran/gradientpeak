// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoalIntelligenceCard } from "./goal-intelligence-card";

afterEach(() => cleanup());

describe("GoalIntelligenceCard", () => {
  it("offers an observable retry when intelligence loading fails", () => {
    const onRetry = vi.fn();

    render(<GoalIntelligenceCard isError isLoading={false} onRetry={onRetry} />);

    expect(screen.getByRole("alert").textContent).toMatch(/could not be refreshed/i);
    fireEvent.click(screen.getByRole("button", { name: /retry intelligence/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
