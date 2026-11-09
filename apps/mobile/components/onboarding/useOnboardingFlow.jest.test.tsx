import { act, renderHook, waitFor } from "@testing-library/react-native";

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const mockAuthState = {
  completeOnboarding: jest.fn(async () => undefined),
  isAuthenticated: true,
  isFullyLoaded: true,
  onboardingStatus: "provider_selection",
  refreshOnboardingStatus: jest.fn(async () => undefined),
  user: { id: "account-a" as string },
};
const mockCompleteMutation = { isPending: false, mutateAsync: jest.fn() };
const mockProfileQuery = {
  isError: false,
  refetch: jest.fn(async () => undefined),
  data: undefined as
    | {
        full_name: string | null;
        id: string;
        username: string | null;
        planning_timezone?: string | null;
      }
    | undefined,
};
const mockUsernameQuery = { data: undefined, isError: false, isFetching: false };
const mockOverviewQuery = {
  data: undefined,
  error: null,
  isLoading: false,
  refetch: jest.fn(async () => undefined),
};
const mockProgressQuery = { data: undefined, error: null, refetch: jest.fn(async () => undefined) };
const mockInvalidateProfile = jest.fn(async () => undefined);

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    integrations: {
      cancelPendingOAuth: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      getSyncOverview: { useQuery: () => mockOverviewQuery },
    },
    onboarding: {
      checkUsernameAvailability: { useQuery: () => mockUsernameQuery },
      completeLifecycleSetup: { useMutation: () => mockCompleteMutation },
      getProgress: { useQuery: () => mockProgressQuery },
      restartProviderSelection: {
        useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
      },
      retryProviderProcessing: {
        useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
      },
    },
    profiles: { get: { useQuery: () => mockProfileQuery } },
    useUtils: () => ({ profiles: { get: { invalidate: mockInvalidateProfile } } }),
  },
}));

jest.mock("@/lib/auth/auth-headers", () => ({
  hasSessionAuthCredentials: () => true,
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

jest.mock("@/lib/calendar/eventSchedule", () => ({ getDeviceTimeZone: () => "America/New_York" }));

const { useOnboardingFlow } =
  require("./useOnboardingFlow") as typeof import("./useOnboardingFlow");

describe("useOnboardingFlow account ownership", () => {
  it("defaults to device timezone, hydrates saved overrides, and preserves a dirty timezone", async () => {
    const hook = await renderFlow();
    expect(hook.result.current.data.planning_timezone).toBe("America/New_York");
    mockProfileQuery.data = {
      id: "account-a",
      full_name: "Athlete",
      username: "athlete",
      planning_timezone: "Pacific/Auckland",
    };
    await rerenderFlow(hook, 1);
    expect(hook.result.current.data.planning_timezone).toBe("Pacific/Auckland");
    await act(async () => hook.result.current.updateData({ planning_timezone: "Asia/Kathmandu" }));
    mockProfileQuery.data = { ...mockProfileQuery.data, planning_timezone: "Europe/London" };
    await rerenderFlow(hook, 2);
    expect(hook.result.current.data.planning_timezone).toBe("Asia/Kathmandu");
    await act(async () => hook.result.current.handleComplete());
    expect(mockCompleteMutation.mutateAsync).toHaveBeenCalledWith({
      profile: expect.objectContaining({ planning_timezone: "Asia/Kathmandu" }),
    });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { id: "account-a" };
    mockAuthState.onboardingStatus = "provider_selection";
    mockAuthState.completeOnboarding.mockResolvedValue(undefined);
    mockAuthState.refreshOnboardingStatus.mockResolvedValue(undefined);
    mockProfileQuery.data = undefined;
    mockProfileQuery.isError = false;
    mockCompleteMutation.mutateAsync.mockReset();
    mockInvalidateProfile.mockResolvedValue(undefined);
  });

  async function renderFlow() {
    const hook = await renderHook(
      ({ revision }: { revision: number }) => {
        // The auth fixture is mutable; revision forces a render without replacing it.
        void revision;
        return useOnboardingFlow();
      },
      { initialProps: { revision: 0 } },
    );
    await act(async () => undefined);
    return hook;
  }

  async function setValidIdentity(flow: ReturnType<typeof useOnboardingFlow>) {
    await act(async () => {
      flow.updateData({ full_name: "Ada Athlete", username: "ada_athlete" });
    });
  }

  async function rerenderFlow(hook: Awaited<ReturnType<typeof renderFlow>>, revision: number) {
    await act(async () => {
      await hook.rerender({ revision });
    });
  }

  it("does not submit a device default over an unread saved profile after a read failure", async () => {
    mockProfileQuery.isError = true;
    const hook = await renderFlow();
    await setValidIdentity(hook.result.current);
    await act(async () => hook.result.current.handleComplete());
    expect(mockCompleteMutation.mutateAsync).not.toHaveBeenCalled();
    expect(hook.result.current.statusModal?.title).toBe("Profile could not be loaded");
    await act(async () => hook.result.current.statusModal?.onPrimary?.());
    expect(mockProfileQuery.refetch).toHaveBeenCalledTimes(1);
  });

  it("isolates a pending completion from a newly authenticated account", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    mockCompleteMutation.mutateAsync
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const hook = await renderFlow();

    await setValidIdentity(hook.result.current);
    expect(hook.result.current).toMatchObject({
      data: { full_name: "Ada Athlete", username: "ada_athlete" },
      lifecycleStatus: "provider_selection",
    });
    let firstAttempt!: Promise<void>;
    await act(() => {
      firstAttempt = hook.result.current.handleComplete();
    });
    expect(mockCompleteMutation.mutateAsync).toHaveBeenCalledTimes(1);

    mockAuthState.user = { id: "account-b" };
    await rerenderFlow(hook, 1);
    await waitFor(() =>
      expect(hook.result.current.data).toMatchObject({ full_name: "", username: "" }),
    );
    expect(hook.result.current.statusModal).toBeNull();

    await setValidIdentity(hook.result.current);
    let secondAttempt!: Promise<void>;
    await act(() => {
      secondAttempt = hook.result.current.handleComplete();
    });
    expect(mockCompleteMutation.mutateAsync).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.reject(new Error("stale completion failure"));
      await firstAttempt;
    });
    expect(mockAuthState.completeOnboarding).not.toHaveBeenCalled();
    expect(hook.result.current.isBusy).toBe(true);
    expect(hook.result.current.statusModal).toBeNull();

    await act(async () => {
      second.resolve();
      await secondAttempt;
    });
    expect(mockAuthState.completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it("does not navigate when the account changes while profile invalidation is pending", async () => {
    const completion = deferred<void>();
    const refresh = deferred<undefined>();
    mockCompleteMutation.mutateAsync.mockReturnValue(completion.promise);
    mockAuthState.refreshOnboardingStatus.mockReturnValue(refresh.promise);
    const hook = await renderFlow();

    await setValidIdentity(hook.result.current);
    let attempt!: Promise<void>;
    await act(() => {
      attempt = hook.result.current.handleComplete();
    });
    await act(async () => {
      completion.resolve();
    });
    await waitFor(() => expect(mockAuthState.refreshOnboardingStatus).toHaveBeenCalledTimes(1));

    mockAuthState.user = { id: "account-b" };
    await rerenderFlow(hook, 1);
    await act(async () => {
      refresh.resolve(undefined);
      await attempt;
    });

    expect(mockAuthState.completeOnboarding).not.toHaveBeenCalled();
  });

  it("starts only one completion for duplicate calls in the same render", async () => {
    const completion = deferred<void>();
    mockCompleteMutation.mutateAsync.mockReturnValue(completion.promise);
    const hook = await renderFlow();

    await setValidIdentity(hook.result.current);
    let attempt!: Promise<void>;
    await act(() => {
      attempt = hook.result.current.handleComplete();
      void hook.result.current.handleComplete();
    });

    expect(mockCompleteMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isBusy).toBe(true);
    await act(async () => {
      completion.resolve();
      await attempt;
    });
  });

  it("retains goal/social selections after rejection and profile refresh, permits retry, and clears ownership on account switch", async () => {
    const completion = deferred<void>();
    mockCompleteMutation.mutateAsync
      .mockReturnValueOnce(completion.promise)
      .mockResolvedValueOnce(undefined);
    const hook = await renderFlow();
    await setValidIdentity(hook.result.current);
    const selections = {
      selected_group_ids: ["group-1"],
      selected_group_actions: [
        { action: "join" as const, action_key: "group:group-1", group_id: "group-1" },
      ],
      selected_follow_profile_ids: ["person-1"],
      should_create_goal: false,
    };
    await act(() => hook.result.current.updateData(selections));
    const oldUpdate = hook.result.current.updateData;
    const oldComplete = hook.result.current.handleComplete;
    let attempt!: Promise<void>;
    await act(() => {
      attempt = hook.result.current.handleComplete();
    });
    expect(hook.result.current.isBusy).toBe(true);
    await act(async () => {
      completion.reject(new Error("offline"));
      await attempt;
    });
    expect(hook.result.current.isBusy).toBe(false);
    expect(hook.result.current.statusModal?.title).toBe("Setup could not be completed");
    mockProfileQuery.data = { full_name: "Refreshed", id: "account-a", username: "refreshed" };
    await rerenderFlow(hook, 1);
    expect(hook.result.current.data).toMatchObject(selections);
    await act(async () => {
      await hook.result.current.handleComplete();
    });
    expect(mockCompleteMutation.mutateAsync).toHaveBeenCalledTimes(2);
    // Initial setup still accepts identity only: optional goal/social policy is unchanged.
    expect(mockCompleteMutation.mutateAsync.mock.calls[1][0].profile).not.toHaveProperty(
      "goal_draft",
    );
    mockAuthState.user = { id: "account-b" };
    await rerenderFlow(hook, 2);
    await act(() => oldUpdate(selections));
    await act(async () => {
      await oldComplete();
    });
    expect(mockCompleteMutation.mutateAsync).toHaveBeenCalledTimes(2);
    expect(hook.result.current.data.selected_group_ids).toEqual([]);
    expect(hook.result.current.data.selected_follow_profile_ids).toEqual([]);
    expect(hook.result.current.data.goal_draft).toBeNull();
  });

  it("does not refill an intentionally cleared profile field on refetch", async () => {
    mockProfileQuery.data = { full_name: "Server Name", id: "account-a", username: "server-name" };
    const hook = await renderFlow();
    await waitFor(() => expect(hook.result.current.data.full_name).toBe("Server Name"));

    await act(async () => {
      hook.result.current.updateData({ full_name: "" });
    });
    mockProfileQuery.data = { full_name: "Server Name", id: "account-a", username: "server-name" };
    await rerenderFlow(hook, 1);

    expect(hook.result.current.data.full_name).toBe("");
  });
});
