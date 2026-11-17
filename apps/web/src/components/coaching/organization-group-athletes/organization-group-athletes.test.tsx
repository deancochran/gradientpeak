// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  links: vi.fn(),
  candidates: vi.fn(),
  uuid: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => {
    if (fn === mocks.add) return mocks.add;
    if (fn === mocks.remove) return mocks.remove;
    if (fn === mocks.links) return mocks.links;
    return mocks.candidates;
  },
}));
vi.mock("../../../lib/coaching/organization-group-athletes-server-functions", () => ({
  addOrganizationGroupAthlete: mocks.add,
  removeOrganizationGroupAthlete: mocks.remove,
  loadOrganizationGroupAthleteLinks: mocks.links,
  loadOrganizationGroupAthleteCandidates: mocks.candidates,
}));

import { OrganizationGroupAthletes } from "./organization-group-athletes";

const organizationId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const engagementId = "33333333-3333-4333-8333-333333333333";
const linkId = "44444444-4444-4444-8444-444444444444";
const page = {
  links: { items: [{ id: linkId, engagementId }], nextCursor: null, hasMore: false },
  candidates: {
    items: [
      {
        engagementId,
        identity: { displayName: "Already Assigned", username: "assigned" },
        status: "active" as const,
      },
      {
        engagementId: "55555555-5555-4555-8555-555555555555",
        identity: { displayName: "Alex Athlete", username: "alex" },
        status: "active" as const,
      },
      {
        engagementId: "66666666-6666-4666-8666-666666666666",
        identity: { displayName: "Paused Athlete", username: "paused" },
        status: "paused" as const,
      },
    ],
    nextCursor: null,
    hasMore: false,
  },
};
type LinkPageResponse = {
  status: "granted";
  items: Array<{ id: string; engagementId: string }>;
  nextCursor: string | null;
  hasMore: boolean;
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("OrganizationGroupAthletes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: mocks.uuid });
    mocks.uuid.mockReturnValue("77777777-7777-4777-8777-777777777777");
    mocks.add.mockResolvedValue({ status: "active", id: "77777777-7777-4777-8777-777777777777" });
    mocks.remove.mockResolvedValue({ status: "ended", id: linkId });
    mocks.links.mockResolvedValue({ status: "granted", ...page.links });
    mocks.candidates.mockResolvedValue({ status: "granted", ...page.candidates });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers only active unassigned athletes by meaningful identity label", () => {
    render(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toContain("Alex Athlete (@alex)");
    expect(options).not.toContain("Already Assigned (@assigned)");
    expect(options).not.toContain("Paused Athlete (@paused)");
    expect(screen.queryByText(engagementId)).toBeNull();
  });

  it("reuses a stable link request after uncertain add acknowledgement", async () => {
    mocks.add
      .mockRejectedValueOnce(new Error("network uncertain"))
      .mockResolvedValueOnce({ status: "active", id: "77777777-7777-4777-8777-777777777777" });
    render(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.change(screen.getByLabelText("Eligible athlete"), {
      target: { value: "55555555-5555-4555-8555-555555555555" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign athlete" }));
    expect(await screen.findByText(/could not confirm the assignment/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Assign athlete" }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
    expect(mocks.add.mock.calls[0]?.[0]).toEqual(mocks.add.mock.calls[1]?.[0]);
  });

  it("requires confirmation, retains committed removal when refresh fails, and fences stale links", async () => {
    mocks.links.mockRejectedValueOnce(new Error("refresh unavailable"));
    render(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove athlete" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(await screen.findByText(/was removed from this group/)).toBeTruthy();
    expect(await screen.findByText(/assignments could not be refreshed/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove athlete" })).toBeNull();
    expect(mocks.remove).toHaveBeenCalledWith({ data: { organizationId, groupId, linkId } });
  });

  it("settles concurrent link and candidate pagination independently when responses resolve out of order", async () => {
    const pendingLinks = deferred<{ status: "granted" } & typeof page.links>();
    const pendingCandidates = deferred<{ status: "granted" } & typeof page.candidates>();
    mocks.links.mockReturnValueOnce(pendingLinks.promise);
    mocks.candidates.mockReturnValueOnce(pendingCandidates.promise);
    render(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={{
          links: { ...page.links, hasMore: true, nextCursor: linkId },
          candidates: {
            ...page.candidates,
            hasMore: true,
            nextCursor: "77777777-7777-4777-8777-777777777777",
          },
        }}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more assignments" }));
    fireEvent.click(screen.getByRole("button", { name: "Load more eligible athletes" }));
    expect(screen.getByRole("button", { name: "Loading assignments…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Loading athletes…" })).toBeTruthy();

    pendingLinks.resolve({
      status: "granted",
      ...page.links,
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Loading assignments…" })).toBeNull(),
    );
    expect(screen.getByRole("button", { name: "Loading athletes…" })).toBeTruthy();

    pendingCandidates.resolve({
      status: "granted",
      ...page.candidates,
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Loading athletes…" })).toBeNull(),
    );
  });

  it("preserves an acknowledged removal when a same-group loader snapshot still contains the link", async () => {
    const refresh = deferred<LinkPageResponse>();
    mocks.links.mockReturnValueOnce(refresh.promise);
    const view = render(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove athlete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(await screen.findByText(/was removed from this group/)).toBeTruthy();
    view.rerender(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={{ ...page, links: { ...page.links, items: [...page.links.items] } }}
        organizationId={organizationId}
      />,
    );
    expect(screen.queryByRole("button", { name: "Remove athlete" })).toBeNull();
    refresh.resolve({ status: "granted", ...page.links });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove athlete" })).toBeNull(),
    );
  });

  it("keeps a partial-page add receipt historical until a later page contains its link", async () => {
    const refresh = deferred<LinkPageResponse>();
    const addedLink = {
      id: "77777777-7777-4777-8777-777777777777",
      engagementId: "55555555-5555-4555-8555-555555555555",
    };
    mocks.links.mockReturnValueOnce(refresh.promise).mockResolvedValueOnce({
      status: "granted",
      items: [addedLink],
      nextCursor: null,
      hasMore: false,
    });
    const view = render(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.change(screen.getByLabelText("Eligible athlete"), {
      target: { value: addedLink.engagementId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign athlete" }));
    await waitFor(() => expect(mocks.links).toHaveBeenCalledTimes(1));

    view.rerender(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={{ ...page, links: { ...page.links, items: [...page.links.items] } }}
        organizationId={organizationId}
      />,
    );
    expect(screen.getByText(/Assignment confirmed; not in the loaded page/)).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Assigned athletes" }).querySelectorAll("li"),
    ).toHaveLength(1);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).not.toContain(
      "Alex Athlete (@alex)",
    );

    refresh.resolve({
      status: "granted",
      ...page.links,
      hasMore: true,
      nextCursor: "88888888-8888-4888-8888-888888888888",
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Load more assignments" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more assignments" }));
    await waitFor(() =>
      expect(
        screen.getByRole("list", { name: "Assigned athletes" }).querySelectorAll("li"),
      ).toHaveLength(2),
    );
    expect(screen.queryByText(/Assignment confirmed; not in the loaded page/)).toBeNull();
  });

  it("retire an add receipt on a complete page-one omission and allows that athlete again", async () => {
    const refresh = deferred<{ status: "granted" } & typeof page.links>();
    mocks.links.mockReturnValueOnce(refresh.promise);
    render(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.change(screen.getByLabelText("Eligible athlete"), {
      target: { value: "55555555-5555-4555-8555-555555555555" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign athlete" }));
    refresh.resolve({ status: "granted", ...page.links });
    await waitFor(() =>
      expect(screen.queryByText(/Assignment confirmed; not in the loaded page/)).toBeNull(),
    );
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toContain(
      "Alex Athlete (@alex)",
    );
  });

  it("blocks another add until a partial receipt is reconciled, then permits it", async () => {
    const firstLink = {
      id: "77777777-7777-4777-8777-777777777777",
      engagementId: "55555555-5555-4555-8555-555555555555",
    };
    const secondEngagementId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const initialPage = {
      ...page,
      candidates: {
        ...page.candidates,
        items: [
          ...page.candidates.items,
          {
            engagementId: secondEngagementId,
            identity: { displayName: "Blair Athlete", username: "blair" },
            status: "active" as const,
          },
        ],
      },
    };
    mocks.add
      .mockResolvedValueOnce({ status: "active", id: firstLink.id })
      .mockResolvedValueOnce({ status: "active", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    mocks.links
      .mockResolvedValueOnce({
        status: "granted",
        ...page.links,
        hasMore: true,
        nextCursor: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      })
      .mockResolvedValueOnce({
        status: "granted",
        items: [firstLink],
        nextCursor: null,
        hasMore: false,
      });
    render(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={initialPage}
        organizationId={organizationId}
      />,
    );
    fireEvent.change(screen.getByLabelText("Eligible athlete"), {
      target: { value: firstLink.engagementId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign athlete" }));
    expect(
      await screen.findByText(/Reconcile this assignment before adding another athlete/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Assign athlete" }).hasAttribute("disabled")).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText("Eligible athlete"), {
      target: { value: secondEngagementId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign athlete" }));
    expect(mocks.add).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Load more assignments" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Assign athlete" }).hasAttribute("disabled")).toBe(
        false,
      ),
    );
    expect(screen.getAllByRole("option").map((option) => option.textContent)).not.toContain(
      "Alex Athlete (@alex)",
    );
    fireEvent.change(screen.getByLabelText("Eligible athlete"), {
      target: { value: secondEngagementId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign athlete" }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
  });

  it("fences a pending add when a new organization/group context takes ownership", async () => {
    const pendingAdd = deferred<{ status: "active"; id: string }>();
    mocks.add.mockReturnValueOnce(pendingAdd.promise);
    const view = render(
      <OrganizationGroupAthletes
        groupId={groupId}
        initialPage={page}
        organizationId={organizationId}
      />,
    );
    fireEvent.change(screen.getByLabelText("Eligible athlete"), {
      target: { value: "55555555-5555-4555-8555-555555555555" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign athlete" }));
    const otherOrganizationId = "88888888-8888-4888-8888-888888888888";
    const otherGroupId = "99999999-9999-4999-8999-999999999999";
    view.rerender(
      <OrganizationGroupAthletes
        groupId={otherGroupId}
        initialPage={page}
        organizationId={otherOrganizationId}
      />,
    );
    pendingAdd.resolve({ status: "active", id: "77777777-7777-4777-8777-777777777777" });
    await waitFor(() => expect(screen.queryByText(/was assigned to this group/)).toBeNull());
    expect(
      screen.getByRole("list", { name: "Assigned athletes" }).querySelectorAll("li"),
    ).toHaveLength(1);
  });

  it("restores its mounted fence during StrictMode setup before a removal completes", async () => {
    render(
      <StrictMode>
        <OrganizationGroupAthletes
          groupId={groupId}
          initialPage={page}
          organizationId={organizationId}
        />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove athlete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(await screen.findByText(/was removed from this group/)).toBeTruthy();
  });
});
