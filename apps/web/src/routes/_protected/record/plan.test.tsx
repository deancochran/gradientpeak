// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordPlanPage } from "./plan";

const mocks = vi.hoisted(() => ({ getToday: vi.fn(), navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => ({ category: "run" }),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/record">{children}</a>,
}));

vi.mock("../../../lib/api/client", () => ({
  api: { events: { getToday: { useQuery: () => mocks.getToday() } } },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecordPlanPage search", () => {
  it("keeps local filtering and shared search clear semantics", () => {
    mocks.getToday.mockReturnValue({
      data: [
        {
          activity_plan: {
            activity_category: "run",
            description: "Steady aerobic work",
            name: "Tempo run",
          },
          id: "event-1",
          scheduled_date: "2026-07-14T12:00:00.000Z",
        },
        {
          activity_plan: {
            activity_category: "cycling",
            description: "Easy spin",
            name: "Recovery ride",
          },
          id: "event-2",
          scheduled_date: "2026-07-14T13:00:00.000Z",
        },
      ],
      error: null,
      isLoading: false,
    });
    render(<RecordPlanPage />);

    const search = screen.getByRole("searchbox", { name: "Search today's plans" });
    expect(search.getAttribute("name")).toBe("planSearch");
    fireEvent.change(search, { target: { value: "tempo" } });
    expect(screen.getByText("Tempo run")).toBeTruthy();
    expect(screen.queryByText("Recovery ride")).toBeNull();

    fireEvent.click(screen.getByTestId("record-plan-search-clear"));
    expect(screen.getByText("Recovery ride")).toBeTruthy();
  });
});
