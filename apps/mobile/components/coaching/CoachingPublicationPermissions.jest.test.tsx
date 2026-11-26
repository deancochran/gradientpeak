import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createHost } from "../../test/mock-components";
import { act, cleanup, fireEvent, renderNative, screen, waitFor } from "../../test/render-native";

const query = jest.fn();
const grant = jest.fn();
const revoke = jest.fn();
let actorId: string | null = "athlete-a";
let sessionId = "session-a";
class MockActorBoundRequestError extends Error {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

jest.mock("@/lib/api/actor-bound-client", () => ({
  __esModule: true,
  isActorBoundRequestError: (error: unknown) => error instanceof MockActorBoundRequestError,
  withActorBoundApiClient: async (
    _actorId: string,
    operation: (client: unknown) => Promise<unknown>,
  ) =>
    operation({
      coachingPublication: {
        grant: { mutate: grant },
        permissionOptions: { query },
        revoke: { mutate: revoke },
      },
    }),
}));
jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: Object.assign(
    (
      selector: (state: { user: { id: string } | null; session: { sessionId: string } }) => unknown,
    ) => selector({ user: actorId ? { id: actorId } : null, session: { sessionId } }),
    { getState: () => ({ user: actorId ? { id: actorId } : null, session: { sessionId } }) },
  ),
}));
jest.mock("@repo/ui/components/switch", () => ({
  __esModule: true,
  Switch: ({
    onCheckedChange,
    testId,
    ...props
  }: {
    onCheckedChange: (value: boolean) => void;
    testId?: string;
  }) => React.createElement("Switch", { ...props, onValueChange: onCheckedChange, testID: testId }),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

const { CoachingPublicationPermissions } = require("./CoachingPublicationPermissions");
const option: {
  coach: { membershipId: string; name: string };
  currentGrant: { id: string } | null;
  organization: { id: string; name: string };
} = {
  coach: { membershipId: "coach-membership", name: "Taylor Coach" },
  currentGrant: null,
  organization: { id: "organization", name: "Summit Club" },
};
const grantedOption = { ...option, currentGrant: { id: "grant-1" } };

function createClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  });
  clients.push(client);
  return client;
}

const clients: QueryClient[] = [];

function screenTree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <CoachingPublicationPermissions />
    </QueryClientProvider>
  );
}

async function waitForPermission() {
  await waitFor(() =>
    expect(screen.getByTestId("coaching-permission-coach-membership")).toBeTruthy(),
  );
}

describe("CoachingPublicationPermissions", () => {
  afterEach(async () => {
    await cleanup();
    for (const client of clients.splice(0)) client.clear();
  });

  it("explains the empty assigned-coach state", async () => {
    const client = createClient();
    query.mockResolvedValueOnce({ options: [] });

    await renderNative(screenTree(client));

    await waitFor(() =>
      expect(
        screen.getByText(
          "You do not have any currently assigned coaches who can receive this permission.",
        ),
      ).toBeTruthy(),
    );
  });

  beforeEach(() => {
    jest.resetAllMocks();
    actorId = "athlete-a";
    sessionId = "session-a";
    query.mockResolvedValue({ options: [option] });
    grant.mockResolvedValue({ grant: { id: "grant-1" } });
    revoke.mockResolvedValue({ grantId: "grant-1", revoked: true });
  });

  it("uses distinct persistent-cache keys for A→B→A and never renders A's late option for B", async () => {
    const client = createClient();
    const firstA = deferred<{ options: (typeof option)[] }>();
    const b = deferred<{ options: (typeof option)[] }>();
    const secondA = deferred<{ options: (typeof option)[] }>();
    query
      .mockReturnValueOnce(firstA.promise)
      .mockReturnValueOnce(b.promise)
      .mockReturnValueOnce(secondA.promise);

    const rendered = await renderNative(screenTree(client));
    actorId = "athlete-b";
    await act(async () => {
      await rendered.rerender(screenTree(client));
      await Promise.resolve();
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));

    await act(async () => {
      firstA.resolve({ options: [option] });
      await Promise.resolve();
    });
    expect(screen.queryByTestId("coaching-permission-coach-membership")).toBeNull();

    await act(async () => {
      b.resolve({ options: [] });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByText(
          "You do not have any currently assigned coaches who can receive this permission.",
        ),
      ).toBeTruthy(),
    );

    actorId = "athlete-a";
    await act(async () => {
      await rendered.rerender(screenTree(client));
      await Promise.resolve();
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(3));
    await act(async () => {
      secondA.resolve({ options: [grantedOption] });
      await Promise.resolve();
    });
    await waitForPermission();

    const keys = client
      .getQueryCache()
      .getAll()
      .map((entry) => entry.queryKey);
    expect(keys).toContainEqual([
      "coaching-publication-permission-options",
      "athlete-a",
      "session-a",
      0,
    ]);
    expect(keys).toContainEqual([
      "coaching-publication-permission-options",
      "athlete-b",
      "session-a",
      1,
    ]);
    expect(keys).toContainEqual([
      "coaching-publication-permission-options",
      "athlete-a",
      "session-a",
      2,
    ]);
  });

  it("does not expose cached options after sign-out", async () => {
    const client = createClient();
    const rendered = await renderNative(screenTree(client));
    await waitForPermission();

    actorId = null;
    await act(async () => {
      await rendered.rerender(screenTree(client));
      await Promise.resolve();
    });

    expect(screen.queryByTestId("coaching-permission-coach-membership")).toBeNull();
    expect(grant).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("synchronously blocks a double grant and waits for an authoritative on refresh", async () => {
    const client = createClient();
    const mutation = deferred<{ grant: { id: string } }>();
    const refreshed = deferred<{ options: (typeof option)[] }>();
    grant.mockReturnValueOnce(mutation.promise);
    query.mockResolvedValueOnce({ options: [option] }).mockReturnValueOnce(refreshed.promise);

    await renderNative(screenTree(client));
    await waitForPermission();
    const toggle = screen.getByTestId("coaching-permission-coach-membership");
    await act(async () => {
      toggle.props.onValueChange(true);
      toggle.props.onValueChange(true);
    });

    expect(grant).toHaveBeenCalledTimes(1);
    expect(grant).toHaveBeenCalledWith({
      coachMembershipId: "coach-membership",
      organizationId: "organization",
    });
    expect(toggle.props.checked).toBe(false);
    expect(screen.getByTestId("coaching-permission-coach-membership").props.disabled).toBe(true);
    expect(screen.getByText("Updating permission and confirming its current status…")).toBeTruthy();

    await act(async () => {
      mutation.resolve({ grant: { id: "grant-1" } });
      await Promise.resolve();
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText("Loading assigned coaches")).toBeTruthy());
    expect(screen.queryByTestId("coaching-permission-coach-membership")).toBeNull();

    await act(async () => {
      refreshed.resolve({ options: [grantedOption] });
      await Promise.resolve();
    });
    await waitForPermission();
    expect(screen.getByTestId("coaching-permission-coach-membership").props.checked).toBe(true);
    expect(screen.queryByText("Updating permission and confirming its current status…")).toBeNull();
  });

  it("sends the exact revoke payload and waits for authoritative off status", async () => {
    const client = createClient();
    const refreshed = deferred<{ options: (typeof option)[] }>();
    query.mockResolvedValue({ options: [grantedOption] });

    await renderNative(screenTree(client));
    await waitForPermission();
    query.mockReturnValueOnce(refreshed.promise);
    await fireEvent(
      screen.getByTestId("coaching-permission-coach-membership"),
      "valueChange",
      false,
    );

    await waitFor(() => expect(revoke).toHaveBeenCalledWith({ grantId: "grant-1" }));
    const pendingControl = screen.queryByTestId("coaching-permission-coach-membership");
    expect(
      screen.queryByLabelText("Loading assigned coaches") ?? pendingControl?.props.disabled,
    ).toBeTruthy();
    if (pendingControl) expect(pendingControl.props.checked).toBe(true);

    await act(async () => {
      refreshed.resolve({ options: [option] });
      await Promise.resolve();
    });
    await waitForPermission();
    expect(screen.getByTestId("coaching-permission-coach-membership").props.checked).toBe(false);
  });

  it("treats a NOT_FOUND revoke as unknown until the read confirms current status", async () => {
    const client = createClient();
    revoke.mockRejectedValueOnce({ data: { code: "NOT_FOUND" } });
    query.mockResolvedValue({ options: [grantedOption] });

    await renderNative(screenTree(client));
    await waitForPermission();
    query.mockResolvedValueOnce({ options: [option] });
    await fireEvent(
      screen.getByTestId("coaching-permission-coach-membership"),
      "valueChange",
      false,
    );

    await waitForPermission();
    expect(revoke).toHaveBeenCalledWith({ grantId: "grant-1" });
    expect(screen.getByTestId("coaching-permission-coach-membership").props.checked).toBe(false);
    expect(
      screen.getByText(
        "The update receipt was uncertain, but current status confirms this permission is off.",
      ),
    ).toBeTruthy();
  });

  it("reports a lost acknowledgement plus failed refresh without automatic writes and retries read-only", async () => {
    const client = createClient();
    grant.mockRejectedValueOnce(new Error("transport failure"));

    await renderNative(screenTree(client));
    await waitForPermission();
    query
      .mockRejectedValueOnce(new Error("refresh unavailable"))
      .mockResolvedValueOnce({ options: [option] });
    await fireEvent(
      screen.getByTestId("coaching-permission-coach-membership"),
      "valueChange",
      true,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "The update may have been saved, but its current status is unavailable. Retry only reloads the status.",
        ),
      ).toBeTruthy(),
    );
    expect(grant).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("coaching-permissions-retry"));
    await waitForPermission();
    expect(grant).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("does not apply a late mutation or refresh completion after unmount", async () => {
    const client = createClient();
    const mutation = deferred<{ grant: { id: string } }>();
    const refreshed = deferred<{ options: (typeof option)[] }>();
    grant.mockReturnValueOnce(mutation.promise);

    const rendered = await renderNative(screenTree(client));
    await waitForPermission();
    query.mockReturnValueOnce(refreshed.promise);
    await fireEvent(
      screen.getByTestId("coaching-permission-coach-membership"),
      "valueChange",
      true,
    );
    await rendered.unmount();
    await act(async () => {
      mutation.resolve({ grant: { id: "grant-1" } });
      refreshed.resolve({ options: [grantedOption] });
      await Promise.resolve();
    });

    expect(grant).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("confirms an on state after a lost grant acknowledgement without claiming a receipt", async () => {
    grant.mockRejectedValueOnce(new Error("lost acknowledgement"));
    query
      .mockResolvedValueOnce({ options: [option] })
      .mockResolvedValueOnce({ options: [grantedOption] });
    await renderNative(screenTree(createClient()));
    await waitForPermission();
    await fireEvent(
      screen.getByTestId("coaching-permission-coach-membership"),
      "valueChange",
      true,
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          "The update receipt was uncertain, but current status confirms this permission is on.",
        ),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId("coaching-permission-coach-membership").props.checked).toBe(true);
    expect(grant).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
  });

  it.each([
    { name: "different current state", options: [option] },
    { name: "disappeared assignment", options: [] },
    {
      name: "different organization",
      options: [{ ...grantedOption, organization: { id: "other-org", name: "Other club" } }],
    },
  ])("does not confirm a lost-ack grant with $name", async ({ options }) => {
    grant.mockRejectedValueOnce(new Error("lost acknowledgement"));
    query.mockResolvedValueOnce({ options: [option] }).mockResolvedValueOnce({ options });
    await renderNative(screenTree(createClient()));
    await waitForPermission();
    await fireEvent(
      screen.getByTestId("coaching-permission-coach-membership"),
      "valueChange",
      true,
    );
    await waitFor(() =>
      expect(
        screen.getByText("The update was not confirmed; the current status is shown."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/current status confirms this permission is on/i)).toBeNull();
    expect(grant).toHaveBeenCalledTimes(1);
  });

  it("reports an acknowledged save with failed refresh and keeps Retry read-only", async () => {
    query
      .mockResolvedValueOnce({ options: [option] })
      .mockRejectedValueOnce(new Error("refresh failed"));
    await renderNative(screenTree(createClient()));
    await waitForPermission();
    await fireEvent(
      screen.getByTestId("coaching-permission-coach-membership"),
      "valueChange",
      true,
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          "Saved, but the current status is unavailable. Retry only reloads the status.",
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByTestId("coaching-permission-coach-membership")).toBeNull();
    query.mockResolvedValueOnce({ options: [grantedOption] });
    await fireEvent.press(screen.getByTestId("coaching-permissions-retry"));
    await waitForPermission();
    expect(screen.getByTestId("coaching-permission-coach-membership").props.checked).toBe(true);
    expect(screen.queryByText(/Saved, but the current status is unavailable/)).toBeNull();
    expect(grant).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("does not expose stale controls when a background status read fails", async () => {
    const client = createClient();
    await renderNative(screenTree(client));
    await waitForPermission();
    query.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["coaching-publication-permission-options"] });
    });
    await waitFor(() => expect(screen.getByTestId("coaching-permissions-retry")).toBeTruthy());
    expect(screen.queryByTestId("coaching-permission-coach-membership")).toBeNull();
    await fireEvent.press(screen.getByTestId("coaching-permissions-retry"));
    await waitForPermission();
    expect(grant).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("exposes initial read failure and recovers without writes", async () => {
    query.mockRejectedValueOnce(new Error("offline"));
    await renderNative(screenTree(createClient()));
    await waitFor(() => expect(screen.getByTestId("coaching-permissions-retry")).toBeTruthy());
    expect(screen.queryByTestId("coaching-permission-coach-membership")).toBeNull();
    await fireEvent.press(screen.getByTestId("coaching-permissions-retry"));
    await waitForPermission();
    expect(grant).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("does not reconcile an actor-bound mutation error after an unrendered A→B→A change", async () => {
    const mutation = deferred<unknown>();
    grant.mockReturnValueOnce(mutation.promise);
    await renderNative(screenTree(createClient()));
    await waitForPermission();
    await fireEvent(
      screen.getByTestId("coaching-permission-coach-membership"),
      "valueChange",
      true,
    );
    // The transport tests separately prove that this precise transition yields
    // the actor-bound error, even when React has not observed either transition.
    actorId = "athlete-b";
    actorId = "athlete-a";
    await act(async () => mutation.reject(new MockActorBoundRequestError()));
    expect(query).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/current status confirms/i)).toBeNull();
    expect(screen.queryByText(/update was not confirmed/i)).toBeNull();
    expect(grant).toHaveBeenCalledTimes(1);
  });

  it("does not let a prior session's mutation reconcile into the new session", async () => {
    const client = createClient();
    const mutation = deferred<unknown>();
    grant.mockReturnValueOnce(mutation.promise);
    const rendered = await renderNative(screenTree(client));
    await waitForPermission();
    await fireEvent(
      screen.getByTestId("coaching-permission-coach-membership"),
      "valueChange",
      true,
    );
    sessionId = "session-a-new";
    await rendered.rerender(screenTree(client));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    await waitForPermission();
    await act(async () => mutation.resolve({ grant: { id: "old-session-grant" } }));
    expect(query).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/current status confirms/i)).toBeNull();
    expect(screen.getByTestId("coaching-permission-coach-membership").props.checked).toBe(false);
  });

  it("requires a fresh read after remount rather than exposing the persistent cached permission", async () => {
    const client = createClient();
    const rendered = await renderNative(screenTree(client));
    await waitForPermission();
    await rendered.unmount();
    const fresh = deferred<{ options: (typeof option)[] }>();
    query.mockReturnValueOnce(fresh.promise);
    await renderNative(screenTree(client));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("coaching-permission-coach-membership")).toBeNull();
    expect(screen.getByLabelText("Loading assigned coaches")).toBeTruthy();
    await act(async () => fresh.reject(new Error("fresh read unavailable")));
    await waitFor(() => expect(screen.getByTestId("coaching-permissions-retry")).toBeTruthy());
    expect(screen.queryByTestId("coaching-permission-coach-membership")).toBeNull();
    expect(grant).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
});
