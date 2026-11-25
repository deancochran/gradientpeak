// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  links: vi.fn(),
  candidates: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
  uuid: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: mocks.invalidate }) }));
vi.mock("../../../lib/coaching/organization-group-coaches-server-functions", () => ({
  assignOrganizationGroupCoach: mocks.assign,
  loadOrganizationGroupCoachLinks: mocks.links,
  loadOrganizationGroupCoachCandidates: mocks.candidates,
  removeOrganizationGroupCoach: mocks.remove,
}));
vi.mock("@repo/ui/components/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  AlertDialogCancel: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import { OrganizationGroupAccessLossProvider } from "../organization-groups/organization-group-access";
import {
  OrganizationGroupCoaches,
  OrganizationGroupCoachesError,
  OrganizationGroupCoachesPending,
} from "./organization-group-coaches";

const organizationId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const linkId = "33333333-3333-4333-8333-333333333333";
const retryLinkId = "44444444-4444-4444-8444-444444444444";
const membershipId = "55555555-5555-4555-8555-555555555555";
const otherMembershipId = "66666666-6666-4666-8666-666666666666";
const freshLinkCursor = "77777777-7777-4777-877777777777";
const candidates = [
  { membershipId, label: "Coach Ada" },
  { membershipId: otherMembershipId, label: "Coach Lin" },
];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
function isDisabled(element: HTMLElement) {
  return element.matches(":disabled");
}

describe("organization group coaches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: mocks.uuid });
    mocks.uuid.mockReturnValue(retryLinkId);
    mocks.assign.mockResolvedValue({ status: "active", id: retryLinkId });
    mocks.remove.mockResolvedValue({ status: "ended", id: linkId });
    mocks.links.mockResolvedValue({
      status: "granted",
      page: { items: [{ id: retryLinkId, membershipId }], nextCursor: null, hasMore: false },
    });
    mocks.invalidate.mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  function view(links = [{ id: linkId, membershipId }]) {
    return render(
      <OrganizationGroupCoaches
        candidatePage={{ items: candidates, nextCursor: null, hasMore: false }}
        groupId={groupId}
        linkPage={{ items: links, nextCursor: null, hasMore: false }}
        organizationId={organizationId}
      />,
    );
  }

  it("labels candidates without exposing a raw UUID input and assigns once under StrictMode", async () => {
    render(
      <StrictMode>
        <OrganizationGroupCoaches
          candidatePage={{ items: candidates, nextCursor: null, hasMore: false }}
          groupId={groupId}
          linkPage={{ items: [], nextCursor: null, hasMore: false }}
          organizationId={organizationId}
        />
      </StrictMode>,
    );
    expect(screen.getByRole("option", { name: "Coach Ada" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Coach"), { target: { value: membershipId } });
    const button = screen.getByRole("button", { name: "Assign coach" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(mocks.assign).toHaveBeenCalledWith({
      data: { organizationId, groupId, membershipId, linkId: retryLinkId },
    });
  });

  it("retains one stable assign payload for an uncertain retry", async () => {
    mocks.assign
      .mockRejectedValueOnce(new Error("unknown"))
      .mockResolvedValueOnce({ status: "active", id: retryLinkId });
    view([]);
    fireEvent.change(screen.getByLabelText("Coach"), { target: { value: membershipId } });
    fireEvent.click(screen.getByRole("button", { name: "Assign coach" }));
    expect(await screen.findByText(/could not confirm the assignment/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Assign coach" }));
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(2));
    expect(mocks.assign.mock.calls[0]?.[0]).toEqual(mocks.assign.mock.calls[1]?.[0]);
  });

  it("keeps an acknowledged add when a late initial page does not yet contain it", async () => {
    const rendered = view([]);
    fireEvent.change(screen.getByLabelText("Coach"), { target: { value: membershipId } });
    fireEvent.click(screen.getByRole("button", { name: "Assign coach" }));
    expect(await screen.findByText("Coach assigned.")).toBeTruthy();
    rendered.rerender(
      <OrganizationGroupCoaches
        candidatePage={{ items: candidates, nextCursor: null, hasMore: false }}
        groupId={groupId}
        linkPage={{ items: [], nextCursor: null, hasMore: false }}
        organizationId={organizationId}
      />,
    );
    expect(
      within(screen.getByRole("list", { name: "Assigned coaches" })).getByText("Coach Ada"),
    ).toBeTruthy();
  });

  it("retires a bounded-page overlay without tombstoning a valid later-page link", async () => {
    mocks.links
      .mockResolvedValueOnce({
        status: "granted",
        page: { items: [], nextCursor: freshLinkCursor, hasMore: true },
      })
      .mockResolvedValueOnce({
        status: "granted",
        page: { items: [{ id: retryLinkId, membershipId }], nextCursor: null, hasMore: false },
      });
    const rendered = render(
      <OrganizationGroupCoaches
        candidatePage={{ items: candidates, nextCursor: null, hasMore: false }}
        groupId={groupId}
        linkPage={{ items: [], nextCursor: linkId, hasMore: true }}
        organizationId={organizationId}
      />,
    );
    fireEvent.change(screen.getByLabelText("Coach"), { target: { value: membershipId } });
    fireEvent.click(screen.getByRole("button", { name: "Assign coach" }));
    await waitFor(() =>
      expect(mocks.links).toHaveBeenCalledWith({
        data: { organizationId, groupId, limit: 20, cursor: null },
      }),
    );
    expect(
      within(screen.getByRole("list", { name: "Assigned coaches" })).queryByText("Coach Ada"),
    ).toBeNull();
    rendered.rerender(
      <OrganizationGroupCoaches
        candidatePage={{ items: candidates, nextCursor: null, hasMore: false }}
        groupId={groupId}
        linkPage={{ items: [{ id: retryLinkId, membershipId }], nextCursor: null, hasMore: false }}
        organizationId={organizationId}
      />,
    );
    expect(
      within(screen.getByRole("list", { name: "Assigned coaches" })).queryByText("Coach Ada"),
    ).toBeNull();
    expect(screen.getByText("Coach assigned.")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Coach Ada" })).toBeNull();
    expect(isDisabled(screen.getByRole("button", { name: "Assign coach" }))).toBe(true);
    expect(
      screen.getByText("Confirming the coach assignment before another assignment."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more assigned coaches" }));
    expect(mocks.links).toHaveBeenLastCalledWith({
      data: { organizationId, groupId, limit: 20, cursor: freshLinkCursor },
    });
    expect(
      await within(screen.getByRole("list", { name: "Assigned coaches" })).findByText("Coach Ada"),
    ).toBeTruthy();
    await waitFor(() =>
      expect(isDisabled(screen.getByRole("button", { name: "Assign coach" }))).toBe(false),
    );
    expect(screen.getByRole("option", { name: "Coach Lin" })).toBeTruthy();
  });

  it("retires the receipt after a complete first page confirms absence", async () => {
    mocks.links.mockReset().mockResolvedValue({
      status: "granted",
      page: { items: [], nextCursor: null, hasMore: false },
    });
    view([]);
    fireEvent.change(screen.getByLabelText("Coach"), { target: { value: membershipId } });
    fireEvent.click(screen.getByRole("button", { name: "Assign coach" }));
    await waitFor(() => expect(mocks.links).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Coach Ada" })).toBeTruthy();
      expect(isDisabled(screen.getByRole("button", { name: "Assign coach" }))).toBe(false);
      expect(
        within(screen.getByRole("list", { name: "Assigned coaches" })).queryByText("Coach Ada"),
      ).toBeNull();
    });
  });

  it("keeps a receipt through terminal later-page omission until explicit first-page refresh", async () => {
    mocks.links
      .mockResolvedValueOnce({
        status: "granted",
        page: { items: [], nextCursor: linkId, hasMore: true },
      })
      .mockResolvedValueOnce({
        status: "granted",
        page: { items: [], nextCursor: null, hasMore: false },
      })
      .mockResolvedValueOnce({
        status: "granted",
        page: { items: [], nextCursor: null, hasMore: false },
      });
    render(
      <OrganizationGroupCoaches
        candidatePage={{ items: candidates, nextCursor: null, hasMore: false }}
        groupId={groupId}
        linkPage={{ items: [], nextCursor: linkId, hasMore: true }}
        organizationId={organizationId}
      />,
    );
    fireEvent.change(screen.getByLabelText("Coach"), { target: { value: membershipId } });
    fireEvent.click(screen.getByRole("button", { name: "Assign coach" }));
    await waitFor(() => expect(mocks.links).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Load more assigned coaches" }));
    await waitFor(() => expect(mocks.links).toHaveBeenCalledTimes(2));
    expect(
      within(screen.getByRole("list", { name: "Assigned coaches" })).queryByText("Coach Ada"),
    ).toBeNull();
    expect(screen.queryByRole("option", { name: "Coach Ada" })).toBeNull();
    expect(isDisabled(screen.getByRole("button", { name: "Assign coach" }))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refresh assignments" }));
    await waitFor(() => expect(mocks.links).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("option", { name: "Coach Ada" })).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: "Assign coach" }))).toBe(false);
    expect(screen.queryByRole("button", { name: "Load more assigned coaches" })).toBeNull();
  });

  it("loads candidate and assignment pages through independent bounded requests", async () => {
    const nextLinkId = "77777777-7777-4777-877777777777";
    const nextCandidateId = "88888888-8888-4888-888888888888";
    mocks.links.mockResolvedValue({
      status: "granted",
      page: {
        items: [{ id: nextLinkId, membershipId: otherMembershipId }],
        nextCursor: null,
        hasMore: false,
      },
    });
    mocks.candidates.mockResolvedValue({
      status: "granted",
      page: {
        items: [{ membershipId: nextCandidateId, label: "Coach Page Two" }],
        nextCursor: null,
        hasMore: false,
      },
    });
    render(
      <OrganizationGroupCoaches
        candidatePage={{ items: candidates, nextCursor: otherMembershipId, hasMore: true }}
        groupId={groupId}
        linkPage={{ items: [{ id: linkId, membershipId }], nextCursor: linkId, hasMore: true }}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more assigned coaches" }));
    fireEvent.click(screen.getByRole("button", { name: "Load more coaches" }));
    await waitFor(() => expect(mocks.links).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.candidates).toHaveBeenCalledTimes(1));
    expect(mocks.links).toHaveBeenCalledWith({
      data: { organizationId, groupId, limit: 20, cursor: linkId },
    });
    expect(mocks.candidates).toHaveBeenCalledWith({
      data: { organizationId, groupId, limit: 20, cursor: otherMembershipId },
    });
    expect(screen.getByRole("option", { name: "Coach Page Two" })).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Assigned coaches" })).getByText("Coach Lin"),
    ).toBeTruthy();
  });

  it("cleans up a late candidate-page request independently when the group context changes", async () => {
    const laterCandidates = deferred<{
      status: "granted";
      page: {
        items: Array<{ membershipId: string; label: string }>;
        nextCursor: null;
        hasMore: false;
      };
    }>();
    mocks.candidates.mockReturnValue(laterCandidates.promise);
    const rendered = render(
      <OrganizationGroupCoaches
        candidatePage={{ items: candidates, nextCursor: otherMembershipId, hasMore: true }}
        groupId={groupId}
        linkPage={{ items: [], nextCursor: null, hasMore: false }}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more coaches" }));
    rendered.rerender(
      <OrganizationGroupCoaches
        candidatePage={{ items: [], nextCursor: null, hasMore: false }}
        groupId="99999999-9999-4999-8999-999999999999"
        linkPage={{ items: [], nextCursor: null, hasMore: false }}
        organizationId={organizationId}
      />,
    );
    laterCandidates.resolve({
      status: "granted",
      page: {
        items: [{ membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", label: "Late coach" }],
        nextCursor: null,
        hasMore: false,
      },
    });
    await Promise.resolve();
    expect(screen.queryByRole("option", { name: "Late coach" })).toBeNull();
  });

  it("fences a pre-command candidate request when assignment begins", async () => {
    const latePage = deferred<{
      status: "granted";
      page: {
        items: Array<{ membershipId: string; label: string }>;
        nextCursor: null;
        hasMore: false;
      };
    }>();
    mocks.candidates.mockReturnValue(latePage.promise);
    render(
      <OrganizationGroupCoaches
        candidatePage={{ items: candidates, nextCursor: otherMembershipId, hasMore: true }}
        groupId={groupId}
        linkPage={{ items: [], nextCursor: null, hasMore: false }}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more coaches" }));
    fireEvent.change(screen.getByLabelText("Coach"), { target: { value: membershipId } });
    fireEvent.click(screen.getByRole("button", { name: "Assign coach" }));
    latePage.resolve({
      status: "granted",
      page: {
        items: [{ membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", label: "Late coach" }],
        nextCursor: null,
        hasMore: false,
      },
    });
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("option", { name: "Late coach" })).toBeNull();
  });

  it("retains an acknowledged removal when refresh fails and does not resurrect it from stale props", async () => {
    mocks.invalidate.mockRejectedValue(new Error("refresh unavailable"));
    const rendered = view();
    fireEvent.click(screen.getByRole("button", { name: "Remove coach" }));
    const removeButtons = screen.getAllByRole("button", { name: "Remove coach" });
    const confirmRemove = removeButtons[1];
    if (!confirmRemove) throw new Error("remove confirmation missing");
    fireEvent.click(confirmRemove);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/Coach removed\. The assignments could not refresh/),
    ).toBeTruthy();
    rendered.rerender(
      <OrganizationGroupCoaches
        candidatePage={{ items: candidates, nextCursor: null, hasMore: false }}
        groupId={groupId}
        linkPage={{ items: [{ id: linkId, membershipId }], nextCursor: null, hasMore: false }}
        organizationId={organizationId}
      />,
    );
    expect(
      within(screen.getByRole("list", { name: "Assigned coaches" })).queryByText("Coach Ada"),
    ).toBeNull();
    expect(screen.getByText("Refresh this page before another change.")).toBeTruthy();
  });

  it("fails closed on authorization loss without changing assignments", async () => {
    mocks.assign.mockResolvedValue({ status: "forbidden" });
    view([]);
    fireEvent.change(screen.getByLabelText("Coach"), { target: { value: membershipId } });
    fireEvent.click(screen.getByRole("button", { name: "Assign coach" }));
    expect(await screen.findByText(/access changed/)).toBeTruthy();
    expect(screen.queryByText("Coach assigned.")).toBeNull();
    expect(screen.queryByRole("list", { name: "Assigned coaches" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign coach" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Coach Ada" })).toBeNull();
  });
  it("redacts existing links and candidates when a pagination read loses access", async () => {
    mocks.links.mockResolvedValueOnce({ status: "forbidden" });
    render(
      <OrganizationGroupCoaches
        candidatePage={{ items: candidates, nextCursor: otherMembershipId, hasMore: true }}
        groupId={groupId}
        linkPage={{ items: [{ id: linkId, membershipId }], nextCursor: linkId, hasMore: true }}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more assigned coaches" }));
    expect(await screen.findByRole("heading", { name: "Group access required" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Assigned coaches" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Coach Ada" })).toBeNull();
  });
  it("signals the scoped parent to redact group detail after a forbidden mutation", async () => {
    mocks.assign.mockResolvedValueOnce({ status: "forbidden" });
    function Parent() {
      const [lost, setLost] = useState(false);
      return lost ? (
        <h1>Group access required</h1>
      ) : (
        <OrganizationGroupAccessLossProvider
          value={{
            scope: { organizationId, groupId, actorProfileId: "profile-1", generation: 0 },
            reportAccessLost: () => setLost(true),
          }}
        >
          <h1>Visible group detail</h1>
          <OrganizationGroupCoaches
            candidatePage={{ items: candidates, nextCursor: null, hasMore: false }}
            groupId={groupId}
            linkPage={{ items: [{ id: linkId, membershipId }], nextCursor: null, hasMore: false }}
            organizationId={organizationId}
          />
        </OrganizationGroupAccessLossProvider>
      );
    }
    render(<Parent />);
    fireEvent.change(screen.getByLabelText("Coach"), { target: { value: otherMembershipId } });
    fireEvent.click(screen.getByRole("button", { name: "Assign coach" }));
    expect(await screen.findByRole("heading", { name: "Group access required" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Visible group detail" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign coach" })).toBeNull();
  });
  it("names pending coach reads and retries a failed child loader synchronously", async () => {
    render(<OrganizationGroupCoachesPending />);
    expect(screen.getByRole("status", { name: "Loading coach assignments" })).toBeTruthy();
    cleanup();
    render(<OrganizationGroupCoachesError />);
    fireEvent.click(screen.getByRole("button", { name: "Retry coach assignments" }));
    expect(mocks.invalidate).toHaveBeenCalledWith({ sync: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry coach assignments" })).toBeTruthy(),
    );
  });
});
