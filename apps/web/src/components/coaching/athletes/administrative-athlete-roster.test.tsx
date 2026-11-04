// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), end: vi.fn(), uuid: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => (fn === mocks.load ? mocks.load : mocks.end),
}));
vi.mock("../../../lib/coaching/athletes-server-functions", () => ({
  loadAdministrativeAthleteRoster: mocks.load,
  terminateAthleteEngagement: mocks.end,
}));
vi.mock("../organization-coaching-assignments/organization-coaching-assignments", () => ({
  OrganizationCoachingAssignments: ({ onAccessLost }: { onAccessLost: () => void }) => (
    <button type="button" onClick={onAccessLost}>
      Lose coaching responsibility access
    </button>
  ),
}));

import { AdministrativeAthleteRoster } from "./administrative-athlete-roster";

const organizationId = "11111111-1111-4111-8111-111111111111";
const engagementId = "22222222-2222-4222-8222-222222222222";
const correlationId = "33333333-3333-4333-8333-333333333333";
const page = {
  items: [
    {
      engagementId,
      identity: { displayName: "Alex Athlete", username: "alex" },
      status: "paused" as const,
    },
  ],
  nextCursor: "44444444-4444-4444-8444-444444444444",
  hasMore: true,
};
const otherOrganizationId = "55555555-5555-4555-8555-555555555555";
const otherPage = {
  items: [
    {
      engagementId: "66666666-6666-4666-8666-666666666666",
      identity: { displayName: "Blair Athlete", username: "blair" },
      status: "active" as const,
    },
  ],
  nextCursor: null,
  hasMore: false,
};
const twoAthletePage = {
  ...page,
  items: [
    ...page.items,
    {
      engagementId: "77777777-7777-4777-8777-777777777777",
      identity: { displayName: "Blair Athlete", username: "blair" },
      status: "active" as const,
    },
  ],
};
type RosterResponse = {
  status: "granted";
  items: Array<{
    engagementId: string;
    identity: { displayName: string | null; username: string | null };
    status: "active" | "paused";
  }>;
  nextCursor: string | null;
  hasMore: boolean;
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Deferred promise was not initialized");
  };
  let reject: (reason?: unknown) => void = () => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AdministrativeAthleteRoster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: mocks.uuid });
    mocks.uuid.mockReturnValue(correlationId);
    mocks.load.mockResolvedValue({ status: "granted", ...page });
    mocks.end.mockResolvedValue({ status: "ended", engagementId });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows identity and paused status without private training data, and pages by cursor", async () => {
    render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    expect(screen.getByRole("list", { name: "Athletes" }).textContent).toContain("Alex Athlete");
    expect(screen.getByText("paused")).toBeTruthy();
    expect(screen.getByText(/does not provide access to private athlete training/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more athletes" }));
    await waitFor(() =>
      expect(mocks.load).toHaveBeenCalledWith({
        data: { organizationId, limit: 20, cursor: page.nextCursor },
      }),
    );
  });

  it("requires explicit destructive confirmation and safely reuses the correlation ID for the same retry", async () => {
    mocks.end
      .mockRejectedValueOnce(new Error("network uncertain"))
      .mockResolvedValueOnce({ status: "ended", engagementId });
    render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "End engagement" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm end engagement" }));
    expect(await screen.findByText("Confirm that you want to end this engagement.")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm end engagement" }));
    await waitFor(() => expect(mocks.end).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/termination was not confirmed/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm end engagement" }));
    await waitFor(() => expect(mocks.end).toHaveBeenCalledTimes(2));
    expect(mocks.end.mock.calls[0]?.[0]).toEqual(mocks.end.mock.calls[1]?.[0]);
    expect(mocks.end.mock.calls[0]?.[0]).toMatchObject({
      data: { organizationId, engagementId, correlationId, reason: "administrative_termination" },
    });
  });

  it("allows only one immediate submit while a termination request is pending", async () => {
    const pendingEnd = deferred<{ status: "ended"; engagementId: string }>();
    mocks.end.mockReturnValueOnce(pendingEnd.promise);
    render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "End engagement" }));
    fireEvent.click(screen.getByRole("checkbox"));
    const form = screen.getByRole("button", { name: "Confirm end engagement" }).closest("form");
    if (!form) throw new Error("Termination form was not rendered");
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.end).toHaveBeenCalledTimes(1));
    expect(mocks.end).toHaveBeenCalledWith({
      data: { organizationId, engagementId, correlationId, reason: "administrative_termination" },
    });
  });

  it("does not allow choosing another athlete while a termination command is pending", async () => {
    const pendingEnd = deferred<{ status: "ended"; engagementId: string }>();
    mocks.end.mockReturnValueOnce(pendingEnd.promise);
    render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={twoAthletePage}
        organizationId={organizationId}
      />,
    );
    const [firstRowAction, secondRowAction] = screen.getAllByRole("button", {
      name: "End engagement",
    });
    if (!firstRowAction || !secondRowAction) throw new Error("Expected two athlete actions");
    fireEvent.click(firstRowAction);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm end engagement" }));
    await waitFor(() => expect(mocks.end).toHaveBeenCalledTimes(1));
    expect(secondRowAction.hasAttribute("disabled")).toBe(true);
    fireEvent.click(secondRowAction);
    expect(screen.getByText("End engagement with Alex Athlete")).toBeTruthy();
    expect(screen.queryByText("End engagement with Blair Athlete")).toBeNull();
  });

  it("removes stale roster data when current tenant access is lost", async () => {
    mocks.load.mockResolvedValue({ status: "forbidden" });
    render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more athletes" }));
    expect(await screen.findByText("Coaching access required")).toBeTruthy();
    expect(screen.queryByText("Alex Athlete")).toBeNull();
  });

  it("redacts the entire roster when responsibility management loses access", () => {
    render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage coaches" }));
    fireEvent.click(screen.getByRole("button", { name: "Lose coaching responsibility access" }));
    expect(screen.getByText("Coaching access required")).toBeTruthy();
    expect(screen.queryByText("Alex Athlete")).toBeNull();
    expect(screen.queryByRole("button", { name: "Manage coaches" })).toBeNull();
  });

  it("immediately redacts the prior actor and organization roster on identity scope replacement", () => {
    const view = render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    view.rerender(
      <AdministrativeAthleteRoster
        actorProfileId="profile-2"
        initialPage={otherPage}
        organizationId={otherOrganizationId}
      />,
    );
    expect(screen.getByText("Blair Athlete")).toBeTruthy();
    expect(screen.queryByText("Alex Athlete")).toBeNull();
    expect(screen.queryByText("End engagement with Alex Athlete")).toBeNull();
  });

  it("does not retain identities or apply a pending old-organization page after an organization change", async () => {
    const oldLoad = deferred<RosterResponse>();
    mocks.load.mockReturnValueOnce(oldLoad.promise);
    const view = render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more athletes" }));
    view.rerender(
      <AdministrativeAthleteRoster
        actorProfileId="profile-2"
        initialPage={otherPage}
        organizationId={otherOrganizationId}
      />,
    );
    await waitFor(() => expect(screen.getByText("Blair Athlete")).toBeTruthy());
    expect(screen.queryByText("Alex Athlete")).toBeNull();
    oldLoad.resolve({ status: "granted", ...page });
    await waitFor(() => expect(screen.queryByText("Alex Athlete")).toBeNull());
  });

  it("keeps a newer same-organization loader snapshot when an older page request resolves", async () => {
    const oldLoad = deferred<RosterResponse>();
    mocks.load.mockReturnValueOnce(oldLoad.promise);
    const view = render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more athletes" }));
    view.rerender(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={otherPage}
        organizationId={organizationId}
      />,
    );
    await waitFor(() => expect(screen.getByText("Blair Athlete")).toBeTruthy());
    oldLoad.resolve({ status: "granted", ...page });
    await waitFor(() => expect(screen.getByText("Blair Athlete")).toBeTruthy());
    expect(screen.queryByText("Alex Athlete")).toBeNull();
  });

  it("keeps a committed termination visible when its refresh fails, without repeating the operation", async () => {
    mocks.load.mockRejectedValueOnce(new Error("refresh unavailable"));
    render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "End engagement" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm end engagement" }));
    expect(await screen.findByText("Alex Athlete's engagement has ended.")).toBeTruthy();
    expect(await screen.findByText(/roster could not be refreshed/)).toBeTruthy();
    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Alex Athlete")).toBeNull();
  });

  it("preserves an acknowledged termination across a stale loader snapshot and its later refresh", async () => {
    const pendingEnd = deferred<{ status: "ended"; engagementId: string }>();
    const postCommandRefresh = deferred<RosterResponse>();
    mocks.end.mockReturnValueOnce(pendingEnd.promise);
    mocks.load.mockReturnValueOnce(postCommandRefresh.promise);
    const view = render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "End engagement" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm end engagement" }));
    await waitFor(() => expect(mocks.end).toHaveBeenCalledTimes(1));
    pendingEnd.resolve({ status: "ended", engagementId });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Alex Athlete's engagement has ended.")).toBeTruthy();

    view.rerender(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={{ ...page, items: [...page.items] }}
        organizationId={organizationId}
      />,
    );
    expect(screen.queryByText("Alex Athlete")).toBeNull();
    expect(screen.getByText("Alex Athlete's engagement has ended.")).toBeTruthy();

    postCommandRefresh.resolve({ status: "granted", ...otherPage });
    await waitFor(() => expect(screen.queryByText("Alex Athlete")).toBeNull());
    expect(screen.queryByText("Blair Athlete")).toBeNull();
    expect(screen.getByText("Alex Athlete's engagement has ended.")).toBeTruthy();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });

  it("keeps a newer same-organization loader page over later ordinary pagination after termination", async () => {
    const ordinaryPagination = deferred<RosterResponse>();
    mocks.load
      .mockResolvedValueOnce({
        status: "granted",
        items: [],
        nextCursor: page.nextCursor,
        hasMore: true,
      })
      .mockReturnValueOnce(ordinaryPagination.promise);
    const view = render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "End engagement" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm end engagement" }));
    expect(await screen.findByText("Alex Athlete's engagement has ended.")).toBeTruthy();

    const loadMore = screen.getByRole("button", { name: "Load more athletes" });
    await waitFor(() => expect(loadMore.hasAttribute("disabled")).toBe(false));
    fireEvent.click(loadMore);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));

    view.rerender(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={otherPage}
        organizationId={organizationId}
      />,
    );
    expect(await screen.findByText("Blair Athlete")).toBeTruthy();
    ordinaryPagination.resolve({ status: "granted", ...page });
    await waitFor(() => expect(screen.getByText("Blair Athlete")).toBeTruthy());
    expect(screen.queryByText("Alex Athlete")).toBeNull();
    expect(screen.getByText("Alex Athlete's engagement has ended.")).toBeTruthy();
  });

  it("ignores an out-of-order pre-termination page so it cannot resurrect an ended athlete", async () => {
    const oldPage = deferred<RosterResponse>();
    const refresh = deferred<RosterResponse>();
    mocks.load.mockReturnValueOnce(oldPage.promise).mockReturnValueOnce(refresh.promise);
    render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more athletes" }));
    fireEvent.click(screen.getByRole("button", { name: "End engagement" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm end engagement" }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    refresh.resolve({ status: "granted", items: [], nextCursor: null, hasMore: false });
    expect(await screen.findByText("Alex Athlete's engagement has ended.")).toBeTruthy();
    oldPage.resolve({ status: "granted", ...page });
    await waitFor(() => expect(screen.queryByText("Alex Athlete")).toBeNull());
  });

  it("ignores an old page and stale termination completion after newer organization context takes ownership", async () => {
    const oldLoad = deferred<RosterResponse>();
    const oldEnd = deferred<{ status: "ended"; engagementId: string }>();
    mocks.load.mockReturnValueOnce(oldLoad.promise);
    mocks.end.mockReturnValueOnce(oldEnd.promise);
    const view = render(
      <AdministrativeAthleteRoster
        actorProfileId="profile-1"
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more athletes" }));
    fireEvent.click(screen.getByRole("button", { name: "End engagement" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm end engagement" }));
    view.rerender(
      <AdministrativeAthleteRoster
        actorProfileId="profile-2"
        initialPage={otherPage}
        organizationId={otherOrganizationId}
      />,
    );
    await waitFor(() => expect(screen.getByText("Blair Athlete")).toBeTruthy());
    oldEnd.resolve({ status: "ended", engagementId });
    oldLoad.resolve({ status: "granted", ...page });
    await waitFor(() => expect(screen.getByText("Blair Athlete")).toBeTruthy());
    expect(screen.queryByText("Alex Athlete")).toBeNull();
    expect(screen.queryByText(/engagement has ended/)).toBeNull();
  });
});
