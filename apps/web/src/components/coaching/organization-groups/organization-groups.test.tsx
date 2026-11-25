// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  archive: vi.fn(),
  invalidate: vi.fn(),
  uuid: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) =>
    fn === mocks.list ? mocks.list : fn === mocks.create ? mocks.create : mocks.archive,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));
vi.mock("../../../lib/coaching/organization-groups-server-functions", () => ({
  loadOrganizationGroups: mocks.list,
  createOrganizationGroup: mocks.create,
  archiveOrganizationGroup: mocks.archive,
}));

import { useOrganizationGroupAccessLoss } from "./organization-group-access";
import {
  OrganizationGroupDetail,
  OrganizationGroupDetailError,
  OrganizationGroupDetailPending,
} from "./organization-group-detail";
import {
  OrganizationGroupList,
  OrganizationGroupsError,
  OrganizationGroupsPending,
} from "./organization-group-list";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "33333333-3333-4333-8333-333333333333";
const groupId = "22222222-2222-4222-8222-222222222222";
const secondGroupId = "77777777-7777-4777-877777777777";
const createdId = "44444444-4444-4444-8444-444444444444";
const page = {
  items: [{ id: groupId, name: "Tempo", description: "Tuesday", createdAt: new Date() }],
  nextCursor: "55555555-5555-4555-8555-555555555555",
  hasMore: true,
};
const otherPage = {
  items: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      name: "Other tenant",
      description: null,
      createdAt: new Date(),
    },
  ],
  nextCursor: null,
  hasMore: false,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function DeferredChildAccessReporter({ capture }: { capture: (complete: () => void) => void }) {
  const accessLoss = useOrganizationGroupAccessLoss();
  useEffect(() => {
    const completion = deferred<void>();
    capture(() => completion.resolve());
    void completion.promise.then(() => {
      if (accessLoss) accessLoss.reportAccessLost(accessLoss.scope);
    });
  }, [accessLoss, capture]);
  return null;
}
describe("organization group workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: mocks.uuid });
    mocks.uuid.mockReturnValue(createdId);
    mocks.list.mockResolvedValue({ status: "granted", ...page });
    mocks.create.mockResolvedValue({ status: "created", id: createdId });
    mocks.archive.mockResolvedValue({ status: "archived", id: groupId });
    mocks.invalidate.mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  function enterDraft(name = "New Tempo") {
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Race prep" } });
  }
  it("is StrictMode-safe and dispatches only one immediate create with one stable payload", async () => {
    render(
      <StrictMode>
        <OrganizationGroupList initialPage={page} organizationId={organizationId} />
      </StrictMode>,
    );
    enterDraft();
    const form = screen.getByRole("button", { name: "Create group" }).closest("form");
    if (!form) throw new Error("form missing");
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({
      data: { organizationId, groupId: createdId, name: "New Tempo", description: "Race prep" },
    });
  });
  it("retains the same UUID and payload for an uncertain create retry", async () => {
    mocks.create
      .mockRejectedValueOnce(new Error("uncertain"))
      .mockResolvedValueOnce({ status: "created", id: createdId });
    render(<OrganizationGroupList initialPage={page} organizationId={organizationId} />);
    enterDraft();
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(await screen.findByText(/could not confirm whether the group was created/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[0]?.[0]).toEqual(mocks.create.mock.calls[1]?.[0]);
  });
  it("keeps a committed create visible when refresh fails without a second create", async () => {
    mocks.list.mockRejectedValueOnce(new Error("refresh unavailable"));
    render(<OrganizationGroupList initialPage={page} organizationId={organizationId} />);
    enterDraft();
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(await screen.findByText("New Tempo was created.")).toBeTruthy();
    expect(await screen.findByText(/Groups could not be refreshed/)).toBeTruthy();
    expect(screen.getByText("New Tempo")).toBeTruthy();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("fails closed rather than showing cached groups after unauthorized refresh", async () => {
    mocks.list.mockResolvedValueOnce({ status: "forbidden" });
    render(<OrganizationGroupList initialPage={page} organizationId={organizationId} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more groups" }));
    expect(await screen.findByText("Coaching access required")).toBeTruthy();
    expect(screen.queryByText("Tempo")).toBeNull();
  });
  it("ignores a pending old-tenant read and create after a tenant switch", async () => {
    const oldRead = deferred<{
      status: "granted";
      items: typeof page.items;
      nextCursor: string | null;
      hasMore: boolean;
    }>();
    const oldCreate = deferred<{ status: "created"; id: string }>();
    mocks.list.mockReturnValueOnce(oldRead.promise);
    mocks.create.mockReturnValueOnce(oldCreate.promise);
    const view = render(
      <OrganizationGroupList initialPage={page} organizationId={organizationId} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more groups" }));
    enterDraft();
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    view.rerender(
      <OrganizationGroupList initialPage={otherPage} organizationId={otherOrganizationId} />,
    );
    oldRead.resolve({ status: "granted", ...page });
    oldCreate.resolve({ status: "created", id: createdId });
    await waitFor(() => expect(screen.getByText("Other tenant")).toBeTruthy());
    expect(screen.queryByText("New Tempo")).toBeNull();
    expect(screen.queryByText("Tempo")).toBeNull();
  });
  it("keeps the receipt on successful archive without revalidating the now-ineligible detail route", async () => {
    render(
      <StrictMode>
        <OrganizationGroupDetail
          group={page.items[0] as (typeof page.items)[number]}
          organizationId={organizationId}
        >
          <div>nested child</div>
        </OrganizationGroupDetail>
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive group" }));
    const confirm = screen.getByRole("button", { name: "Confirm archive" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Tempo archived")).toBeTruthy();
    expect(mocks.archive).toHaveBeenCalledWith({ data: { organizationId, groupId } });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("ignores stale old-tenant archive acknowledgement and does not invalidate or navigate", async () => {
    const oldArchive = deferred<{ status: "archived"; id: string }>();
    mocks.archive.mockReturnValueOnce(oldArchive.promise);
    const view = render(
      <OrganizationGroupDetail
        group={page.items[0] as (typeof page.items)[number]}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive group" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    view.rerender(
      <OrganizationGroupDetail
        group={otherPage.items[0] as (typeof otherPage.items)[number]}
        organizationId={otherOrganizationId}
      />,
    );
    oldArchive.resolve({ status: "archived", id: groupId });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Other tenant" })).toBeTruthy());
    expect(screen.queryByText("Tempo archived")).toBeNull();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("fences a pending archive by group identity when the same organization opens another group", async () => {
    const oldArchive = deferred<{ status: "archived"; id: string }>();
    mocks.archive.mockReturnValueOnce(oldArchive.promise);
    const secondGroup = {
      id: secondGroupId,
      name: "Threshold",
      description: null,
      createdAt: new Date(),
    };
    const view = render(
      <OrganizationGroupDetail
        group={page.items[0] as (typeof page.items)[number]}
        organizationId={organizationId}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive group" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    view.rerender(<OrganizationGroupDetail group={secondGroup} organizationId={organizationId} />);
    oldArchive.resolve({ status: "archived", id: groupId });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Threshold" })).toBeTruthy());
    expect(screen.queryByText("Tempo archived")).toBeNull();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("fails closed for archive authorization loss under StrictMode", async () => {
    mocks.archive.mockResolvedValueOnce({ status: "forbidden" });
    render(
      <StrictMode>
        <OrganizationGroupDetail
          group={page.items[0] as (typeof page.items)[number]}
          organizationId={organizationId}
        >
          <div>nested child</div>
        </OrganizationGroupDetail>
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive group" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    expect(await screen.findByRole("heading", { name: "Group access required" })).toBeTruthy();
    expect(screen.queryByText("Tempo archived")).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive group" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Tempo" })).toBeNull();
    expect(screen.queryByText("nested child")).toBeNull();
  });
  it.each([
    "coach",
    "athlete",
  ])("does not let a stale %s child completion redact a replacement parent, but redacts its current scope", async (_child) => {
    const initial = page.items[0] as (typeof page.items)[number];
    const replacement = {
      id: secondGroupId,
      name: "Threshold",
      description: "Destination detail",
      createdAt: new Date(),
    };
    const completions: Array<() => void> = [];
    const capture = (complete: () => void) => completions.push(complete);
    const view = render(
      <OrganizationGroupDetail
        actorProfileId="profile-1"
        group={initial}
        organizationId={organizationId}
      >
        <DeferredChildAccessReporter capture={capture} />
      </OrganizationGroupDetail>,
    );
    await waitFor(() => expect(completions).toHaveLength(1));
    const staleCompletion = completions[0];
    if (!staleCompletion) throw new Error("stale child completion missing");

    view.rerender(
      <OrganizationGroupDetail
        actorProfileId="profile-2"
        group={replacement}
        organizationId={otherOrganizationId}
      >
        <DeferredChildAccessReporter capture={capture} />
      </OrganizationGroupDetail>,
    );
    await waitFor(() => expect(completions).toHaveLength(2));
    staleCompletion();
    await Promise.resolve();
    expect(screen.getByRole("heading", { name: "Threshold" })).toBeTruthy();
    expect(screen.getByText("Destination detail")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive group" })).toBeTruthy();

    const currentCompletion = completions[1];
    if (!currentCompletion) throw new Error("current child completion missing");
    currentCompletion();
    expect(await screen.findByRole("heading", { name: "Group access required" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Threshold" })).toBeNull();
    expect(screen.queryByText("Destination detail")).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive group" })).toBeNull();
  });
  it("does not let an ABA actor-scope child completion redact the restored parent", async () => {
    const initial = page.items[0] as (typeof page.items)[number];
    const completions: Array<() => void> = [];
    const capture = (complete: () => void) => completions.push(complete);
    const view = render(
      <OrganizationGroupDetail
        actorProfileId="profile-1"
        group={initial}
        organizationId={organizationId}
      >
        <DeferredChildAccessReporter capture={capture} />
      </OrganizationGroupDetail>,
    );
    await waitFor(() => expect(completions).toHaveLength(1));
    const firstCompletion = completions[0];
    if (!firstCompletion) throw new Error("initial child completion missing");
    view.rerender(
      <OrganizationGroupDetail
        actorProfileId="profile-2"
        group={initial}
        organizationId={organizationId}
      >
        <DeferredChildAccessReporter capture={capture} />
      </OrganizationGroupDetail>,
    );
    await waitFor(() => expect(completions).toHaveLength(2));
    view.rerender(
      <OrganizationGroupDetail
        actorProfileId="profile-1"
        group={initial}
        organizationId={organizationId}
      >
        <DeferredChildAccessReporter capture={capture} />
      </OrganizationGroupDetail>,
    );
    await waitFor(() => expect(completions).toHaveLength(3));
    firstCompletion();
    await Promise.resolve();
    expect(screen.getByRole("heading", { name: "Tempo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive group" })).toBeTruthy();
    const currentCompletion = completions[2];
    if (!currentCompletion) throw new Error("restored child completion missing");
    currentCompletion();
    expect(await screen.findByRole("heading", { name: "Group access required" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Tempo" })).toBeNull();
  });
  it("accepts a current child access-loss report after StrictMode replays its parent lifetime", async () => {
    const completions: Array<() => void> = [];
    const capture = (complete: () => void) => completions.push(complete);
    render(
      <StrictMode>
        <OrganizationGroupDetail
          actorProfileId="profile-1"
          group={page.items[0] as (typeof page.items)[number]}
          organizationId={organizationId}
        >
          <DeferredChildAccessReporter capture={capture} />
        </OrganizationGroupDetail>
      </StrictMode>,
    );
    await waitFor(() => expect(completions.length).toBeGreaterThanOrEqual(2));
    const currentCompletion = completions.at(-1);
    if (!currentCompletion) throw new Error("current StrictMode child completion missing");
    currentCompletion();
    expect(await screen.findByRole("heading", { name: "Group access required" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Tempo" })).toBeNull();
  });
  it("clears a denied actor scope when a different actor opens the same group", async () => {
    const completions: Array<() => void> = [];
    const capture = (complete: () => void) => completions.push(complete);
    const group = page.items[0] as (typeof page.items)[number];
    const view = render(
      <OrganizationGroupDetail
        actorProfileId="profile-1"
        group={group}
        organizationId={organizationId}
      >
        <DeferredChildAccessReporter capture={capture} />
      </OrganizationGroupDetail>,
    );
    await waitFor(() => expect(completions).toHaveLength(1));
    const deniedCompletion = completions[0];
    if (!deniedCompletion) throw new Error("denied actor child completion missing");
    deniedCompletion();
    expect(await screen.findByRole("heading", { name: "Group access required" })).toBeTruthy();

    view.rerender(
      <OrganizationGroupDetail
        actorProfileId="profile-2"
        group={group}
        organizationId={organizationId}
      >
        <DeferredChildAccessReporter capture={capture} />
      </OrganizationGroupDetail>,
    );
    expect(await screen.findByRole("heading", { name: "Tempo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive group" })).toBeTruthy();
  });
  it.each([
    ["groups", OrganizationGroupsPending, "Loading organization groups"],
    ["group detail", OrganizationGroupDetailPending, "Loading organization group"],
  ])("keeps %s controls hidden while the route read is pending", (_name, Pending, label) => {
    render(<Pending />);
    expect(screen.getByRole("status", { name: label })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /archive|create/i })).toBeNull();
  });
  it.each([
    ["groups", OrganizationGroupsError, "Retry organization groups"],
    ["group detail", OrganizationGroupDetailError, "Retry organization group"],
  ])("keeps failed %s reads visible and retries synchronously", async (_name, ErrorComponent, retryName) => {
    render(<ErrorComponent />);
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: retryName }));
    expect(mocks.invalidate).toHaveBeenCalledWith({ sync: true });
    await waitFor(() => expect(screen.getByRole("button", { name: retryName })).toBeTruthy());
    mocks.invalidate.mockRejectedValueOnce(new Error("read failed"));
    const retry = screen.getByRole("button", { name: retryName });
    fireEvent.click(retry);
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
