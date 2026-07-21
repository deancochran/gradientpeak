// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordPlanPage } from "./plan";

const mocks = vi.hoisted(() => ({ getToday: vi.fn(), navigate: vi.fn() }));

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

function structure(...categories: Array<"run" | "bike" | "swim">) {
  return {
    version: 3,
    segments: categories.flatMap((category, index) => [
      ...(index === 0
        ? []
        : [
            {
              duration: { seconds: 30, type: "time" },
              id: id(index * 10),
              name: "Transition",
              role: "transition",
            },
          ]),
      {
        category,
        id: id(index * 10 + 1),
        intervals: [
          {
            id: id(index * 10 + 2),
            name: "Work",
            repetitions: 1,
            steps: [
              {
                duration: { seconds: 60, type: "time" },
                id: id(index * 10 + 3),
                name: "Step",
                targets: [{ intensity: 5, type: "RPE" }],
              },
            ],
          },
        ],
        name: category,
        role: "activity",
      },
    ]),
  };
}

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

vi.mock("../../../lib/recording/provider", () => ({
  useTimerOnlyRecording: () => ({ state: { reducer: { snapshot: null } } }),
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
            description: "Steady aerobic work",
            name: "Tempo run",
            structure: structure("run"),
          },
          id: "event-1",
          scheduled_date: "2026-07-14T12:00:00.000Z",
        },
        {
          activity_plan: {
            description: "Easy spin",
            name: "Recovery ride",
            structure: structure("bike"),
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

  it("uses compiled primary categories for filtering and preserves repeated category composition", () => {
    mocks.getToday.mockReturnValue({
      data: [
        {
          activity_plan: {
            description: "Transition practice",
            name: "Duathlon brick",
            structure: structure("run", "bike", "run"),
          },
          id: "event-1",
          scheduled_date: "2026-07-14T12:00:00.000Z",
        },
      ],
      error: null,
      isLoading: false,
    });
    render(<RecordPlanPage />);

    expect(screen.getByText("run")).toBeTruthy();
    expect(screen.getByText("bike")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Bike" }));
    expect(screen.queryByText("Duathlon brick")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getByText("Duathlon brick")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Attach plan" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      search: { category: "run", eventId: "event-1" },
      to: "/record",
    });
  });
});
