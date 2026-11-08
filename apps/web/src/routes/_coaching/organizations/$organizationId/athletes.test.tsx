// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  roster: { status: "granted" as const, items: [], nextCursor: null, hasMore: false } as unknown,
  load: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.roster,
    useParams: () => ({ organizationId: "11111111-1111-4111-8111-111111111111" }),
    useRouteContext: () => ({ actorProfileId: "profile-1" }),
  }),
}));
vi.mock("../../../../lib/coaching/athletes-server-functions", () => ({
  loadAdministrativeAthleteRoster: state.load,
}));
vi.mock("../../../../components/coaching/coach-access-denied", () => ({
  CoachAccessDenied: () => <p>Coaching access required</p>,
}));
vi.mock("../../../../components/coaching/athletes/administrative-athlete-roster", () => ({
  AdministrativeAthleteRoster: () => <p>Athlete roster content</p>,
}));

import { Route } from "./athletes";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.roster = { status: "granted", items: [], nextCursor: null, hasMore: false };
});
describe("athlete roster route", () => {
  it("loads the explicit route organization and initial cursor", async () => {
    const loader = (Route as unknown as { loader: (input: unknown) => Promise<unknown> }).loader;
    await loader({ params: { organizationId: "11111111-1111-4111-8111-111111111111" } });
    expect(state.load).toHaveBeenCalledWith({
      data: { organizationId: "11111111-1111-4111-8111-111111111111", limit: 20, cursor: null },
    });
  });
  it("fails closed when the loader reports lost access", () => {
    state.roster = { status: "forbidden" };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByText("Coaching access required")).toBeTruthy();
    expect(screen.queryByText("Athlete roster content")).toBeNull();
  });
});
