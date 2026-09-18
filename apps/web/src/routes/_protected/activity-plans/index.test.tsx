// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./index";

const navigation = vi.hoisted(() => ({ navigate: vi.fn(), search: {} as Record<string, unknown> }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => navigation.navigate,
    useSearch: () => ({ activity_category: "run" }),
  }),
}));

vi.mock("../../../lib/api/client", () => ({
  api: {
    activityPlans: {
      create: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
      list: {
        useInfiniteQuery: () => ({
          data: {
            pages: [
              {
                items: [
                  {
                    id: "plan-1",
                    name: "Tempo bike",
                    description: "A structured ride",
                    activityCategory: "bike",
                    owner: { id: "owner-1", username: "avery", avatarUrl: null },
                    isSystemTemplate: false,
                    engagement: { likes: 3, viewerHasLiked: false },
                    metrics: [
                      {
                        key: "distance",
                        label: "Distance",
                        status: "available",
                        value: 10_000,
                        unit: "meters",
                        reason: null,
                        provenance: "authored",
                      },
                      {
                        key: "elapsed_duration",
                        label: "Duration",
                        status: "available",
                        value: 1_800,
                        unit: "seconds",
                        reason: null,
                        provenance: "authored",
                      },
                      {
                        key: "common_load",
                        label: "Personalized load",
                        status: "available",
                        value: 72,
                        unit: "score",
                        reason: null,
                        provenance: "estimated",
                      },
                      {
                        key: "objective_intensity",
                        label: "Intensity",
                        status: "available",
                        value: 0.8,
                        unit: "ratio",
                        reason: null,
                        provenance: "estimated",
                      },
                    ],
                    structure: {
                      version: 3,
                      activity_category: "bike",
                      segments: [
                        {
                          role: "activity",
                          name: "Ride",
                          id: "00000000-0000-4000-8000-000000000001",
                          intervals: [
                            {
                              id: "00000000-0000-4000-8000-000000000002",
                              name: "Work",
                              repetitions: 1,
                              steps: [
                                {
                                  id: "00000000-0000-4000-8000-000000000003",
                                  name: "Authored step",
                                  duration: { type: "time", seconds: 1_800 },
                                  targets: [{ type: "%FTP", intensity: 80 }],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  },
                  {
                    id: "plan-2",
                    name: "Open duration plan",
                    description: null,
                    activityCategory: "run",
                    owner: { id: "owner-1", username: "avery", avatarUrl: null },
                    isSystemTemplate: false,
                    engagement: { likes: 0, viewerHasLiked: false },
                    metrics: [],
                    structure: {
                      version: 3,
                      activity_category: "run",
                      segments: [],
                    },
                  },
                ],
              },
            ],
          },
          error: null,
          fetchNextPage: vi.fn(),
          hasNextPage: false,
          isError: false,
          isFetching: false,
          isFetchingNextPage: false,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
    },
    useUtils: () => ({ activityPlans: { invalidate: vi.fn() } }),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(cleanup);

describe("ActivityPlansPage cards", () => {
  it("does not restore a stale category when search follows an All selection", () => {
    navigation.search = { activity_category: "run" };
    navigation.navigate.mockImplementation(({ search }) => {
      navigation.search = typeof search === "function" ? search(navigation.search) : search;
    });
    const Page = (Route as unknown as { component: React.ComponentType }).component;
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Tempo" } });
    expect(navigation.search).toEqual({ activity_category: undefined, q: "Tempo" });
  });
  it("renders authored duration and calculated headline metrics on plan cards", () => {
    const ActivityPlansPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<ActivityPlansPage />);

    expect(screen.getByText("Tempo bike")).toBeTruthy();
    expect(screen.getAllByText("@avery").length).toBeGreaterThan(0);
    expect(screen.getByText("Ride")).toBeTruthy();
    expect(screen.getByText("3 likes")).toBeTruthy();
    expect(screen.getAllByText("Distance").length).toBeGreaterThan(0);
    expect(screen.getByText("10 km")).toBeTruthy();
    expect(screen.getAllByText("Duration").length).toBeGreaterThan(0);
    expect(screen.getByText("30m")).toBeTruthy();
    expect(screen.getAllByText("Load").length).toBeGreaterThan(0);
    expect(screen.getByText("~72")).toBeTruthy();
    expect(screen.getAllByText("Intensity").length).toBeGreaterThan(0);
    expect(screen.getByText("~0.80")).toBeTruthy();
    expect(screen.getByLabelText("Distance, 10 km, Authored")).toBeTruthy();
    expect(screen.getByLabelText("Duration, 30m, Authored")).toBeTruthy();
    expect(screen.getByLabelText("Load, ~72, Estimated")).toBeTruthy();
    expect(screen.getByLabelText("Intensity, ~0.80, Estimated")).toBeTruthy();
    expect(screen.queryByText(/~30m|approximately 30m/i)).toBeNull();
    expect(screen.getByText("Activity prescription")).toBeTruthy();
    expect(
      screen.getByRole("figure", {
        name: /widths are normalized.*height and color reflect authored intensity/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("activity-plan-card-timeline-plan-1-bar-0").getAttribute("data-intensity"),
    ).toBe("%FTP 80");
    expect(
      screen.getByTestId("activity-plan-card-timeline-plan-1-bar-0").getAttribute("data-duration"),
    ).toBe("1800 seconds");
    expect(screen.queryByText(/recorded signal pattern|effort profile/i)).toBeNull();
    expect(screen.queryByTestId("activity-plan-card-timeline-plan-2")).toBeNull();
  });
});
