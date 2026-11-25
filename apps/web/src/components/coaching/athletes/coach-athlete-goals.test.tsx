// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.load }));
vi.mock("../../../lib/coaching/athlete-goals-server-functions", () => ({
  loadCoachAthleteGoals: {},
}));

import { CoachAthleteGoals } from "./coach-athlete-goals";

const ids = {
  actorProfileId: "actor-a",
  athleteId: "22222222-2222-4222-8222-222222222222",
  organizationId: "11111111-1111-4111-8111-111111111111",
};
const goal = (id: string, name: string) => ({
  id,
  name,
  targetDate: "2026-04-01",
  category: "run",
  priority: 3,
  status: "in_progress",
});
const granted = (items = [goal("a", "Spring 10K")], nextCursor: string | null = null) => ({
  status: "granted" as const,
  items,
  nextCursor,
});
function view(overrides: Partial<React.ComponentProps<typeof CoachAthleteGoals>> = {}) {
  return (
    <CoachAthleteGoals {...ids} loaderRevision="revision-a" result={granted()} {...overrides} />
  );
}

afterEach(() => {
  cleanup();
  mocks.load.mockReset();
});

it("suppresses duplicate continuation requests and clears records on a denied response", async () => {
  let resolve!: (value: { status: "forbidden" }) => void;
  mocks.load.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(view({ result: granted([goal("a", "Spring 10K")], "opaque-2") }));
  const button = screen.getByRole("button", { name: "Load more goals" });
  act(() => {
    button.click();
    button.click();
  });
  expect(mocks.load).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ status: "forbidden" }));
  expect(screen.getByRole("heading", { name: "Goals unavailable" })).toBeTruthy();
  expect(screen.queryByText("Spring 10K")).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more goals" })).toBeNull();
});

it("renders literal date-only target dates with a lifecycle label, not readiness or achievement", () => {
  render(view());
  expect(screen.getByText("Target date: 2026-04-01 · run · Priority 3")).toBeTruthy();
  expect(screen.getByText("Lifecycle: in progress")).toBeTruthy();
  expect(screen.queryByText(/readiness|achiev/i)).toBeNull();
});

it("continues with the opaque cursor and deduplicates overlapping pages", async () => {
  mocks.load.mockResolvedValueOnce(granted([goal("a", "Updated 10K"), goal("b", "Autumn 5K")]));
  render(view({ result: granted([goal("a", "Spring 10K")], "opaque-2") }));
  fireEvent.click(screen.getByRole("button", { name: "Load more goals" }));
  await waitFor(() =>
    expect(mocks.load).toHaveBeenCalledWith({
      data: {
        athleteProfileId: ids.athleteId,
        cursor: "opaque-2",
        organizationId: ids.organizationId,
      },
    }),
  );
  await screen.findByText("Autumn 5K");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

it("clears goals when a continuation loses consent and ignores an old completion after a revision change", async () => {
  let resolve!: (value: ReturnType<typeof granted>) => void;
  mocks.load.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const rendered = render(view({ result: granted([goal("a", "Spring 10K")], "opaque-2") }));
  fireEvent.click(screen.getByRole("button", { name: "Load more goals" }));
  rendered.rerender(view({ loaderRevision: "revision-b", result: { status: "forbidden" } }));
  expect(screen.getByRole("heading", { name: "Goals unavailable" })).toBeTruthy();
  expect(screen.queryByText("Spring 10K")).toBeNull();
  resolve(granted([goal("old", "Old goal")]));
  await waitFor(() => expect(screen.queryByText("Old goal")).toBeNull());
});
