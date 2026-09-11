// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecordPlanPage } from "./plan";

const mocks = vi.hoisted(() => ({ detailInputs: [] as unknown[], navigate: vi.fn() }));
const PLAN_ID = "00000000-0000-4000-8000-000000000010";
const EVENT_ID = "00000000-0000-4000-8000-000000000020";
const structure = {
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      name: "Main",
      role: "activity",
      intervals: [
        {
          id: "00000000-0000-4000-8000-000000000102",
          name: "Set",
          repetitions: 1,
          steps: [
            {
              id: "00000000-0000-4000-8000-000000000103",
              name: "Tempo",
              duration: { type: "time", seconds: 60 },
              targets: [{ type: "%ThresholdHR", intensity: 80 }],
            },
            {
              id: "00000000-0000-4000-8000-000000000104",
              name: "Perceived effort",
              duration: { type: "time", seconds: 60 },
              targets: [{ type: "RPE", intensity: 7 }],
            },
          ],
        },
      ],
    },
  ],
} as const;
const plans = [
  {
    id: PLAN_ID,
    name: "Tempo run",
    description: "Steady work",
    activityCategory: "run",
    capabilities: { canRecord: true },
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    name: "Recovery ride",
    description: "Easy spin",
    activityCategory: "bike",
    capabilities: { canRecord: true },
  },
];

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => mocks.navigate,
    useSearch: () => ({ activity_category: "run", gps: "off" }),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/record">{children}</a>,
}));

vi.mock("../../../lib/api/client", () => ({
  api: {
    calendar: {
      day: {
        useQuery: () => ({
          data: {
            projection: {
              items: [
                {
                  id: EVENT_ID,
                  kind: "planned_activity",
                  status: "scheduled",
                  calendarDate: "2026-08-19",
                  timing: { startsAt: null },
                  plan: plans[0],
                },
              ],
            },
          },
          isLoading: false,
        }),
      },
    },
    activityPlans: {
      list: {
        useInfiniteQuery: (input: { search?: string }) => ({
          data: {
            pages: [
              {
                items: input.search
                  ? plans.filter((plan) =>
                      plan.name.toLowerCase().includes((input.search ?? "").toLowerCase()),
                    )
                  : plans,
                nextCursor: undefined,
              },
            ],
          },
          isFetching: false,
          isFetchingNextPage: false,
          hasNextPage: false,
          fetchNextPage: vi.fn(),
        }),
      },
      getById: {
        useQuery: (input: { id: string }) => {
          mocks.detailInputs.push(input);
          return {
            data:
              input.id === PLAN_ID
                ? {
                    detail: {
                      ...plans[0],
                      activityPlanRevision: 2,
                      structure,
                      structureHash: `v1:sha256:${"a".repeat(64)}`,
                      defaultVariantId: PLAN_ID,
                      defaultVariantName: "Base",
                      variants: [
                        { id: PLAN_ID, name: "Base" },
                        {
                          id: "00000000-0000-4000-8000-000000000012",
                          name: "Build",
                        },
                      ],
                      resolvedVariant: { id: PLAN_ID, name: "Base", selection: "default" },
                      metrics: [
                        {
                          key: "elapsed_duration",
                          label: "Duration",
                          status: "available",
                          value: 60,
                          unit: "seconds",
                        },
                      ],
                    },
                  }
                : undefined,
            isLoading: false,
            isError: false,
          };
        },
      },
    },
  },
}));

vi.mock("../../../lib/recording/provider", () => ({
  useTimerOnlyRecording: () => ({ state: { reducer: { snapshot: null } } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.detailInputs = [];
});

describe("RecordPlanPage", () => {
  it("searches all visible recordable plans", () => {
    render(<RecordPlanPage />);
    const search = screen.getByRole("searchbox", { name: "Search all activity plans" });
    fireEvent.change(search, { target: { value: "tempo" } });
    expect(screen.getAllByText("Tempo run").length).toBeGreaterThan(0);
    expect(screen.queryByText("Recovery ride")).toBeNull();
  });

  it("records missing-fact and RPE targets as authored without an independent personalization choice", () => {
    render(<RecordPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: /Tempo run.*Scheduled instance/i }));

    expect(screen.queryByRole("switch", { name: "Calculated targets" })).toBeNull();
    expect(screen.getByText("80% Threshold HR")).toBeTruthy();
    expect(screen.getByText("7 RPE")).toBeTruthy();
    expect(screen.getByText(/Recording uses the plan's authored targets/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Use this plan" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/record",
      search: {
        activity_category: "run",
        gps: "off",
        activityPlanId: PLAN_ID,
        eventId: EVENT_ID,
        variantId: PLAN_ID,
      },
    });
    expect(mocks.detailInputs).toContainEqual({ id: PLAN_ID, personalize: false });
  });
});
