// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: null as null | Record<string, unknown>,
  loaderData: null as unknown,
  params: {
    organizationId: "11111111-1111-4111-8111-111111111111",
    groupId: "22222222-2222-4222-8222-222222222222",
  },
  load: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => {
    mocks.config = config;
    return {
      useLoaderData: () => mocks.loaderData,
      useParams: () => mocks.params,
    };
  },
}));
vi.mock("../../../../../../components/coaching/coach-access-denied", () => ({
  CoachAccessDenied: () => <p>Coaching access required</p>,
}));
vi.mock(
  "../../../../../../components/coaching/organization-group-coaches/organization-group-coaches",
  () => ({
    OrganizationGroupCoaches: (props: { candidatePage: { items: Array<{ label: string }> } }) => (
      <p>{props.candidatePage.items[0]?.label}</p>
    ),
    OrganizationGroupCoachesError: () => <p>load error</p>,
    OrganizationGroupCoachesPending: () => <p>loading</p>,
  }),
);
vi.mock("../../../../../../lib/coaching/organization-group-coaches-server-functions", () => ({
  loadOrganizationGroupCoaches: mocks.load,
}));

import { Route } from "./coaches";

describe("organization group coaches route", () => {
  it("loads the child scope and fails closed when its independent server boundary denies access", async () => {
    const config = mocks.config as {
      loader: (input: { params: typeof mocks.params }) => Promise<unknown>;
      component: () => ReactNode;
    };
    mocks.load.mockResolvedValue({ status: "granted" });
    await config.loader({ params: mocks.params });
    expect(mocks.load).toHaveBeenCalledWith({
      data: { ...mocks.params, limit: 20, linkCursor: null, candidateCursor: null },
    });
    mocks.loaderData = { status: "forbidden" };
    render(config.component());
    expect(screen.getByText("Coaching access required")).toBeTruthy();
  });

  it("passes the scoped assignment page into child composition", () => {
    const config = mocks.config as { component: () => ReactNode };
    mocks.loaderData = {
      status: "granted",
      links: { items: [], nextCursor: null, hasMore: false },
      candidates: {
        items: [{ membershipId: "33333333-3333-4333-8333-333333333333", label: "Coach Ada" }],
        nextCursor: null,
        hasMore: false,
      },
    };
    render(config.component());
    expect(screen.getByText("Coach Ada")).toBeTruthy();
    expect(Route).toBeTruthy();
  });
});
