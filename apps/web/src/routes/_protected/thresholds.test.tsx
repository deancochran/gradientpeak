// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: null as unknown,
  isError: false,
  olderData: null as unknown,
  olderIsError: false,
  olderRefetch: vi.fn(),
  requestedInputs: [] as unknown[],
  refetch: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/activity">{children}</a>,
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    athleteIntelligence: {
      getThresholdOverview: {
        useQuery: (input: unknown, options?: { enabled?: boolean }) => {
          if (options && "enabled" in options) {
            state.requestedInputs.push(input);
            return {
              data: state.olderData,
              isError: state.olderIsError,
              isLoading: false,
              refetch: state.olderRefetch,
            };
          }
          return {
            data: state.data,
            isError: state.isError,
            isLoading: false,
            refetch: state.refetch,
          };
        },
      },
    },
  },
}));

import { Route } from "./thresholds";

afterEach(cleanup);
afterEach(() => {
  state.isError = false;
  state.olderData = null;
  state.olderIsError = false;
  state.olderRefetch.mockReset();
  state.requestedInputs = [];
  state.refetch.mockReset();
});

it("formats current and historical swim speeds as pace per 100m", () => {
  state.data = {
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: {
          status: "available",
          effectiveAt: "2026-04-01T00:00:00Z",
          unit: "meters_per_second",
          value: 4,
        },
        swim: {
          status: "available",
          effectiveAt: "2026-04-01T00:00:00Z",
          unit: "meters_per_second",
          value: 1,
        },
      },
    },
    history: {
      items: [
        {
          activityCategory: "run",
          effectiveAt: "2026-04-01T00:00:00Z",
          metric: "speed",
          method: "run_speed_30m",
          policyVersion: "threshold-v1",
          sourceActivities: [],
          thresholdId: "run",
          unit: "meters_per_second",
          value: 4,
        },
        {
          activityCategory: "swim",
          effectiveAt: "2026-04-01T00:00:00Z",
          metric: "speed",
          method: "swim_speed_15m",
          policyVersion: "threshold-v1",
          sourceActivities: [],
          thresholdId: "swim",
          unit: "meters_per_second",
          value: 1,
        },
      ],
    },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  render(<ThresholdsPage />);

  expect(screen.getAllByText(/4:10 \/km/)).toHaveLength(2);
  expect(screen.getAllByText(/1:40 \/100m/)).toHaveLength(2);
});

it("separates bike power and LTHR into independently scaled chronological evidence", () => {
  state.data = {
    current: {
      thresholds: {
        bike: {
          status: "available",
          effectiveAt: "2026-05-01T00:00:00Z",
          unit: "watts",
          value: 260,
        },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: {
      items: [
        {
          activityCategory: "bike",
          effectiveAt: "2026-04-01T00:00:00Z",
          metric: "lthr",
          method: "lthr_30m_final_20m",
          policyVersion: "threshold-v1",
          sourceActivities: [],
          thresholdId: "bike-lthr",
          unit: "bpm",
          value: 163,
        },
        {
          activityCategory: "bike",
          effectiveAt: "2026-03-01T00:00:00Z",
          metric: "power",
          method: "bike_power_30m",
          policyVersion: "threshold-v1",
          sourceActivities: [],
          thresholdId: "bike-power-early",
          unit: "watts",
          value: 240,
        },
        {
          activityCategory: "bike",
          effectiveAt: "2026-05-01T00:00:00Z",
          metric: "power",
          method: "bike_power_30m",
          policyVersion: "threshold-v1",
          sourceActivities: [],
          thresholdId: "bike-power-latest",
          unit: "watts",
          value: 260,
        },
      ],
      nextCursor: {
        createdAt: "2026-01-01T00:00:00Z",
        effectiveAt: "2026-01-01T00:00:00Z",
        thresholdId: "older",
      },
    },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  render(<ThresholdsPage />);

  expect(
    screen.getByRole("img", { name: /bike power history.*2 chronological records/i }),
  ).toBeTruthy();
  expect(
    screen.getByRole("img", { name: /bike LTHR history.*1 chronological records/i }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Load earlier history" })).toBeTruthy();
});

it("retains cached data and exposes retry when a refresh fails", () => {
  state.isError = true;
  state.data = {
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [], nextCursor: null },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  render(<ThresholdsPage />);

  expect(screen.getByText(/showing cached threshold data/i)).toBeTruthy();
  screen.getByRole("button", { name: "Try again" }).click();
  expect(state.refetch).toHaveBeenCalledOnce();
});

it("renders fresh and stale current thresholds with publication metadata", () => {
  state.data = {
    publication: { computedAt: "2026-05-02T00:00:00Z", publishedRevision: 7, status: "stale" },
    current: {
      thresholds: {
        bike: {
          effectiveAt: "2026-05-01T00:00:00Z",
          freshness: "fresh",
          status: "available",
          unit: "watts",
          value: 275,
        },
        run: {
          effectiveAt: "2026-04-01T00:00:00Z",
          freshness: "stale",
          status: "available",
          unit: "meters_per_second",
          value: 4,
        },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [], nextCursor: null },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  render(<ThresholdsPage />);

  expect(screen.getByText("Publication stale · revision 7")).toBeTruthy();
  expect(screen.getByText("fresh · Effective May 1, 2026")).toBeTruthy();
  expect(screen.getByText("stale · Effective Apr 1, 2026")).toBeTruthy();
});

it("loads the advertised cursor, appends chronological history, and retains first-page facts", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00Z",
    effectiveAt: "2026-02-01T00:00:00Z",
    thresholdId: "older-cursor",
  };
  const secondCursor = {
    createdAt: "2026-01-01T00:00:00Z",
    effectiveAt: "2026-01-01T00:00:00Z",
    thresholdId: "oldest-cursor",
  };
  state.data = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    current: {
      thresholds: {
        bike: {
          effectiveAt: "2026-05-01T00:00:00Z",
          freshness: "fresh",
          status: "available",
          unit: "watts",
          value: 250,
        },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: {
      items: [
        {
          activityCategory: "bike",
          confidence: 0.8,
          effectiveAt: "2026-05-01T00:00:00Z",
          metric: "power",
          method: "bike_power_30m",
          policyVersion: "v2",
          sourceActivities: [],
          thresholdId: "current",
          unit: "watts",
          value: 250,
        },
      ],
      nextCursor: cursor,
    },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  const view = render(<ThresholdsPage />);

  fireEvent.click(screen.getByRole("button", { name: "Load earlier history" }));
  expect(state.requestedInputs.at(-1)).toEqual({ historyCursor: cursor, historyLimit: 100 });

  state.olderData = {
    publication: {
      computedAt: "2026-05-01T00:00:00Z",
      publishedRevision: 1,
      status: "available",
    },
    history: {
      items: [
        {
          activityCategory: "bike",
          confidence: 0.1,
          effectiveAt: "2026-01-01T00:00:00Z",
          metric: "power",
          method: "obsolete",
          policyVersion: "v1",
          sourceActivities: [],
          thresholdId: "current",
          unit: "watts",
          value: 999,
        },
        {
          activityCategory: "bike",
          confidence: 0.7,
          effectiveAt: "2026-02-01T00:00:00Z",
          metric: "power",
          method: "bike_power_30m",
          policyVersion: "v1",
          sourceActivities: [],
          thresholdId: "older",
          unit: "watts",
          value: 225,
        },
      ],
      nextCursor: secondCursor,
    },
  };
  view.rerender(<ThresholdsPage />);

  await waitFor(() => expect(screen.getByText("225 W")).toBeTruthy());
  expect(screen.queryByText("999 W")).toBeNull();
  const evidence = within(screen.getByRole("list", { name: /bike power evidence/i }));
  expect(evidence.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    expect.stringContaining("225 W"),
    expect.stringContaining("250 W"),
  ]);
  state.olderData = null;
  fireEvent.click(screen.getByRole("button", { name: "Load earlier history" }));
  expect(state.requestedInputs.at(-1)).toEqual({ historyCursor: secondCursor, historyLimit: 100 });
});

it("keeps loaded history on an older-page failure and retries the same cursor", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00Z",
    effectiveAt: "2026-02-01T00:00:00Z",
    thresholdId: "older-cursor",
  };
  state.data = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: {
      items: [
        {
          activityCategory: "bike",
          confidence: 0.8,
          effectiveAt: "2026-05-01T00:00:00Z",
          metric: "power",
          method: "bike_power_30m",
          policyVersion: "v2",
          sourceActivities: [],
          thresholdId: "current",
          unit: "watts",
          value: 250,
        },
      ],
      nextCursor: cursor,
    },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  const view = render(<ThresholdsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Load earlier history" }));
  state.olderIsError = true;
  view.rerender(<ThresholdsPage />);

  expect(screen.getByText(/loaded history is unchanged/i)).toBeTruthy();
  expect(screen.getByText("250 W")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(state.olderRefetch).toHaveBeenCalledOnce();
  expect(state.requestedInputs.at(-1)).toEqual({ historyCursor: cursor, historyLimit: 100 });

  state.olderIsError = false;
  state.olderData = {
    publication: {
      computedAt: "2026-05-01T00:00:00Z",
      publishedRevision: 1,
      status: "available",
    },
    history: {
      items: [
        {
          activityCategory: "bike",
          confidence: 0.7,
          effectiveAt: "2026-02-01T00:00:00Z",
          metric: "power",
          method: "bike_power_30m",
          policyVersion: "v1",
          sourceActivities: [],
          thresholdId: "older",
          unit: "watts",
          value: 225,
        },
      ],
      nextCursor: null,
    },
  };
  view.rerender(<ThresholdsPage />);
  await waitFor(() => expect(screen.getByText("225 W")).toBeTruthy());
});

it("drops old pages and ignores an in-flight older response after publication changes", async () => {
  const oldCursor = {
    createdAt: "2026-02-01T00:00:00Z",
    effectiveAt: "2026-02-01T00:00:00Z",
    thresholdId: "old-cursor",
  };
  const point = (thresholdId: string, value: number) => ({
    activityCategory: "bike",
    confidence: 0.8,
    effectiveAt: "2026-05-01T00:00:00Z",
    metric: "power",
    method: "bike_power_30m",
    policyVersion: "v2",
    sourceActivities: [],
    thresholdId,
    unit: "watts",
    value,
  });
  state.data = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [point("revision-one", 250)], nextCursor: oldCursor },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  const view = render(<ThresholdsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Load earlier history" }));

  state.data = {
    publication: { computedAt: "2026-05-02T00:00:00Z", publishedRevision: 2, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [point("revision-two", 260)], nextCursor: null },
  };
  state.olderData = {
    publication: {
      computedAt: "2026-05-01T00:00:00Z",
      publishedRevision: 1,
      status: "available",
    },
    history: { items: [point("stale-response", 150)], nextCursor: null },
  };
  view.rerender(<ThresholdsPage />);

  await waitFor(() => expect(screen.getByText("260 W")).toBeTruthy());
  expect(screen.queryByText("250 W")).toBeNull();
  expect(screen.queryByText("150 W")).toBeNull();
});

it("rejects an older response when the server publication changes during the request", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00Z",
    effectiveAt: "2026-02-01T00:00:00Z",
    thresholdId: "cursor",
  };
  const point = {
    activityCategory: "bike" as const,
    confidence: 0.8,
    effectiveAt: "2026-05-01T00:00:00Z",
    metric: "power" as const,
    method: "bike_power_30m",
    policyVersion: "v2",
    sourceActivities: [],
    thresholdId: "current",
    unit: "watts" as const,
    value: 250,
  };
  state.data = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [point], nextCursor: cursor },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  const view = render(<ThresholdsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Load earlier history" }));
  state.olderData = {
    publication: { computedAt: "2026-05-02T00:00:00Z", publishedRevision: 2, status: "available" },
    history: { items: [{ ...point, thresholdId: "unexpected", value: 999 }], nextCursor: null },
  };
  view.rerender(<ThresholdsPage />);

  await waitFor(() => expect(state.refetch).toHaveBeenCalledOnce());
  expect(screen.queryByText("999 W")).toBeNull();
  expect(screen.getByRole("button", { name: "Load earlier history" })).toBeTruthy();
});

it("rejects a cached old-publication response after a new first page reuses its cursor", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00Z",
    effectiveAt: "2026-02-01T00:00:00Z",
    thresholdId: "cursor",
  };
  const point = (thresholdId: string, value: number) => ({
    activityCategory: "bike" as const,
    confidence: 0.8,
    effectiveAt: "2026-05-01T00:00:00Z",
    metric: "power" as const,
    method: "bike_power_30m",
    policyVersion: "v2",
    sourceActivities: [],
    thresholdId,
    unit: "watts" as const,
    value,
  });
  state.data = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [point("revision-one", 250)], nextCursor: cursor },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  const view = render(<ThresholdsPage />);
  state.data = {
    publication: { computedAt: "2026-05-02T00:00:00Z", publishedRevision: 2, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: { items: [point("revision-two", 260)], nextCursor: cursor },
  };
  view.rerender(<ThresholdsPage />);
  await waitFor(() => expect(screen.getByText("Publication available · revision 2")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Load earlier history" }));
  state.olderData = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    history: { items: [point("cached-old", 150)], nextCursor: null },
  };
  view.rerender(<ThresholdsPage />);

  await waitFor(() => expect(state.refetch).toHaveBeenCalledOnce());
  expect(screen.getByText("260 W")).toBeTruthy();
  expect(screen.queryByText("150 W")).toBeNull();
});

it("honors an accepted empty terminal older page instead of offering the original cursor again", async () => {
  const cursor = {
    createdAt: "2026-02-01T00:00:00Z",
    effectiveAt: "2026-02-01T00:00:00Z",
    thresholdId: "cursor",
  };
  state.data = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    current: {
      thresholds: {
        bike: { status: "unavailable" },
        run: { status: "unavailable" },
        swim: { status: "unavailable" },
      },
    },
    history: {
      items: [
        {
          activityCategory: "bike",
          confidence: 0.8,
          effectiveAt: "2026-05-01T00:00:00Z",
          metric: "power",
          method: "bike_power_30m",
          policyVersion: "v2",
          sourceActivities: [],
          thresholdId: "current",
          unit: "watts",
          value: 250,
        },
      ],
      nextCursor: cursor,
    },
  };
  const ThresholdsPage = (Route as unknown as { component: React.ComponentType }).component;
  const view = render(<ThresholdsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Load earlier history" }));
  state.olderData = {
    publication: { computedAt: "2026-05-01T00:00:00Z", publishedRevision: 1, status: "available" },
    history: { items: [], nextCursor: null },
  };
  view.rerender(<ThresholdsPage />);

  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Load earlier history" })).toBeNull(),
  );
});
