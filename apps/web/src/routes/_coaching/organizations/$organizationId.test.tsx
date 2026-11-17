// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: { status: "forbidden" } as
    | { status: "forbidden" }
    | { status: "granted"; organization: { id: string; name: string; slug: string } },
  loadAccess: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => mocks.access,
  }),
}));

vi.mock("../../../components/coaching/coach-access-denied", () => ({
  CoachAccessDenied: () => <div>Coaching access required</div>,
}));

vi.mock("../../../components/coaching/coach-shell", () => ({
  CoachShell: ({ organization }: { organization: { name: string } }) => (
    <div>Coach shell for {organization.name}</div>
  ),
}));

vi.mock("../../../lib/coaching/server-functions", () => ({
  loadOrganizationCoachingAccess: mocks.loadAccess,
}));

import { Route } from "./$organizationId";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.access = { status: "forbidden" };
});

describe("organization coaching boundary", () => {
  it("loads access using only the organization route parameter", async () => {
    mocks.loadAccess.mockResolvedValue({ status: "forbidden" });
    const loader = (Route as unknown as { loader: (input: unknown) => Promise<unknown> }).loader;

    await loader({ params: { organizationId: "11111111-1111-4111-8111-111111111111" } });

    expect(mocks.loadAccess).toHaveBeenCalledWith({
      data: { organizationId: "11111111-1111-4111-8111-111111111111" },
    });
  });

  it("renders no coaching shell when access is forbidden", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);

    expect(screen.getByText("Coaching access required")).toBeTruthy();
    expect(screen.queryByText(/Coach shell/)).toBeNull();
  });

  it("renders the separate coaching shell for an authorized profile", () => {
    mocks.access = {
      status: "granted",
      organization: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Summit Coaching",
        slug: "summit-coaching",
      },
    };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);

    expect(screen.getByText("Coach shell for Summit Coaching")).toBeTruthy();
    expect(screen.queryByText("Coaching access required")).toBeNull();
  });
});
