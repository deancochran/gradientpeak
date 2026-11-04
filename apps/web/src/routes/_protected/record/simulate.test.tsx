// @vitest-environment jsdom
import { createHash } from "node:crypto";
import {
  activityPlanStructureSchema,
  compileActivityPlan,
  getCanonicalActivityPlanStructureHashInput,
} from "@repo/core/activity-plan";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordingLauncherSearch } from "../../../lib/recording-web";
import { SimulationPage } from "./simulate";

const PLAN = "10000000-0000-4000-8000-000000000001";
const ROUTE = "10000000-0000-4000-8000-000000000002";
const OLDER_ROUTE = "10000000-0000-4000-8000-000000000003";
const SESSION = "10000000-0000-4000-8000-000000000004";
const mocks = vi.hoisted(() => ({
  search: {} as RecordingLauncherSearch,
  navigate: vi.fn(),
  plan: undefined as unknown,
  calendar: undefined as unknown,
  route: undefined as unknown,
  planLoading: false,
  routeError: false,
  page: vi.fn(),
  planRead: vi.fn(),
  geometryRead: vi.fn(),
  retryPlan: vi.fn(),
  retryRoute: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useSearch: () => mocks.search,
    useNavigate: () => mocks.navigate,
  }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("../../../lib/recording/provider", () => {
  throw new Error("Simulator imported the real recorder");
});
vi.mock("../../../lib/api/client", () => ({
  api: {
    activityPlans: {
      getById: {
        useQuery: (input: unknown, options: unknown) => {
          mocks.planRead(input, options);
          return {
            data: mocks.plan,
            isLoading: mocks.planLoading,
            isError: false,
            refetch: mocks.retryPlan,
          };
        },
      },
    },
    calendar: {
      day: {
        useQuery: () => ({
          data: mocks.calendar,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
    },
    routes: {
      loadFull: {
        useQuery: (input: unknown) => {
          mocks.geometryRead(input);
          return {
            data: mocks.route,
            isLoading: false,
            isError: mocks.routeError,
            refetch: mocks.retryRoute,
          };
        },
      },
      list: {
        useQuery: (input: { cursor?: string }) => {
          mocks.page(input);
          return {
            data: input.cursor
              ? { items: [{ id: OLDER_ROUTE, name: "Older route" }] }
              : { items: [{ id: ROUTE, name: "Selected route" }], nextCursor: "index:20" },
            isLoading: false,
            isError: false,
            refetch: vi.fn(),
          };
        },
      },
    },
  },
}));
const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "40000000-0000-4000-8000-000000000001",
      name: "Warm up",
      duration: { type: "time", seconds: 10 },
      targets: [{ type: "%FTP", intensity: 80 }],
    },
    {
      type: "step",
      id: "40000000-0000-4000-8000-000000000002",
      name: "Travel",
      duration: { type: "distance", meters: 100 },
      targets: [{ type: "RPE", intensity: 5 }],
    },
    {
      type: "step",
      id: "40000000-0000-4000-8000-000000000003",
      name: "Open finish",
      duration: { type: "untilFinished" },
      targets: [{ type: "RPE", intensity: 4 }],
    },
  ],
});
const hash = `v1:sha256:${createHash("sha256").update(getCanonicalActivityPlanStructureHashInput(structure)).digest("hex")}`;
let wall = 0;
let request = 0;
const frames = new Map<number, FrameRequestCallback>();
beforeEach(() => {
  vi.clearAllMocks();
  wall = 0;
  request = 0;
  frames.clear();
  mocks.search = { activity_category: "bike", gps: "off", activityPlanId: PLAN, routeId: ROUTE };
  mocks.plan = {
    detail: {
      id: PLAN,
      name: "Canonical intervals",
      description: null,
      activityPlanRevision: 2,
      structureHash: hash,
      structure,
    },
  };
  mocks.route = {
    id: ROUTE,
    name: "Full route",
    coordinates: [
      { latitude: 0, longitude: 0, altitude: 100 },
      { latitude: 0, longitude: 0.001 },
    ],
    totalDistance: 99999,
  };
  mocks.calendar = undefined;
  mocks.planLoading = false;
  mocks.routeError = false;
  vi.spyOn(performance, "now").mockImplementation(() => wall);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++request;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function tick(ms: number) {
  wall += ms;
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => {
    callbacks.forEach((callback) => {
      callback(wall);
    });
  });
}
async function startSimulation() {
  fireEvent.change(screen.getByLabelText(/Virtual speed assumption/), { target: { value: "36" } });
  fireEvent.click(screen.getByRole("button", { name: "10×" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start simulation" })));
}
describe("separate simulation route", () => {
  it("runs actual compiled time/distance/manual guidance, clamps full geometry, pauses and restarts without real recording access", async () => {
    const view = render(<SimulationPage />);
    expect(mocks.geometryRead).toHaveBeenCalledWith({ id: ROUTE });
    expect(compileActivityPlan(structure).occurrences).toHaveLength(3);
    await startSimulation();
    expect(screen.getByRole("button", { name: "Pause simulation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Complete manual step" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText("Target guidance: %FTP 80")).toBeTruthy();
    tick(2500);
    expect(screen.getByTestId("simulation-elapsed").textContent).toContain("25.0 s");
    expect(screen.getByText("Open finish")).toBeTruthy();
    expect(screen.getByTestId("simulation-route-progress").textContent).toContain(
      "111.2 / 111.2 m",
    );
    expect(screen.getByTestId("simulation-marker").getAttribute("data-longitude")).toBe("0.001");
    expect(screen.getByTestId("simulation-terrain").textContent).toContain("Unknown");
    fireEvent.click(screen.getByRole("button", { name: "Pause simulation" }));
    tick(5000);
    expect(screen.getByTestId("simulation-elapsed").textContent).toContain("25.0 s");
    fireEvent.click(screen.getByRole("button", { name: "Resume simulation" }));
    tick(500);
    expect(screen.getByTestId("simulation-elapsed").textContent).toContain("30.0 s");
    fireEvent.click(screen.getByRole("button", { name: "Complete manual step" }));
    expect(screen.getByRole("status").textContent).toContain("Plan processed");
    expect(
      screen.queryByRole("button", { name: /Save activity|Save review|Connect sensor/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restart simulation" }));
    expect(screen.getByTestId("simulation-elapsed").textContent).toContain("0.0 s");
    view.unmount();
    expect(frames.size).toBe(0);
  });
  it("reaches older route pages and retains all launcher context", () => {
    mocks.search = { ...mocks.search, plannedSessionId: SESSION, plannedSessionDate: "2026-09-20" };
    render(<SimulationPage />);
    fireEvent.click(screen.getByRole("button", { name: "More routes" }));
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "index:20", limit: 20 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Older route" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/record/simulate",
      search: { ...mocks.search, routeId: OLDER_ROUTE },
      replace: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Previous routes" }));
    expect(mocks.page.mock.calls.at(-1)?.[0]).not.toHaveProperty("cursor");
  });
  it("shows loading and geometry failures honestly and requires an explicit speed", async () => {
    mocks.planLoading = true;
    const view = render(<SimulationPage />);
    expect(screen.getByText("Loading simulation resources…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start simulation" })).toHaveProperty(
      "disabled",
      true,
    );
    mocks.planLoading = false;
    mocks.routeError = true;
    view.rerender(<SimulationPage />);
    expect(screen.getByRole("alert").textContent).toContain("Full route geometry");
    fireEvent.click(screen.getByRole("button", { name: "Retry route geometry" }));
    expect(mocks.retryRoute).toHaveBeenCalledOnce();
    mocks.routeError = false;
    view.rerender(<SimulationPage />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Start simulation" })),
    );
    expect(screen.queryByRole("button", { name: "Pause simulation" })).toBeNull();
    const speedInput = screen.getByLabelText(/Virtual speed assumption/);
    expect(speedInput.getAttribute("aria-invalid")).toBe("true");
    const errorId = speedInput.getAttribute("aria-describedby");
    expect(errorId && document.getElementById(errorId)?.textContent).toBeTruthy();
  });
  it("loads a new-style calendar session through its current plan", async () => {
    mocks.search = { ...mocks.search, plannedSessionId: SESSION, plannedSessionDate: "2026-09-20" };
    mocks.calendar = {
      projection: {
        items: [
          {
            plannedSession: {
              id: SESSION,
              sessionRevision: 9,
              source: { kind: "direct", operationId: "simulation-calendar-operation-123456789" },
              activityPlanId: PLAN,
            },
          },
        ],
      },
    };
    const view = render(<SimulationPage />);
    expect(mocks.planRead).toHaveBeenLastCalledWith(
      { id: PLAN, personalize: false },
      expect.objectContaining({ enabled: true }),
    );
    await startSimulation();
    tick(500);
    expect(screen.getAllByText(/Canonical intervals/).length).toBeGreaterThan(0);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    wall += 60000;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getByRole("status").textContent).toContain("paused");
    expect(screen.getByTestId("simulation-elapsed").textContent).toContain("5.0 s");
    mocks.calendar = undefined;
    view.rerender(<SimulationPage />);
    expect(screen.getAllByText(/Canonical intervals/).length).toBeGreaterThan(0);
  });
});
