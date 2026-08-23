import { act, renderHook } from "@testing-library/react-native";
import type { AuthProfile } from "@/lib/stores/auth-store";

const setProfileMock = jest.fn();
const setOnboardingStatusMock = jest.fn();
const refetchProfileMock = jest.fn();
const invalidateProfileMock = jest.fn();
const refreshMobileAuthSessionMock = jest.fn(async () => null);
const profileQueryUseQueryMock = jest.fn();

const createProfile = (overrides: Partial<AuthProfile> = {}): AuthProfile => ({
  id: "profile-1",
  created_at: "2026-04-20T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  email: "athlete@test.com",
  full_name: null,
  avatar_url: null,
  cover_url: null,
  bio: null,
  dob: null,
  gender: null,
  onboarding_status: "completed",
  is_public: false,
  username: null,
  preferred_units: null,
  planning_timezone: null,
  language: null,
  weight_kg: null,
  ...overrides,
});

const authStoreState = {
  session: { user: { id: "user-1" } },
  user: { id: "user-1", email: "athlete@test.com", emailVerified: true },
  ready: true,
  loading: false,
  error: null,
  onboardingStatus: "completed" as AuthProfile["onboarding_status"] | null,
  profile: createProfile({
    full_name: "Optimistic Name",
  }) as AuthProfile | null,
  setProfile: setProfileMock,
  setOnboardingStatus: setOnboardingStatusMock,
};

const profileQueryResult = {
  data: createProfile({
    onboarding_status: "processing",
    full_name: "Stale Name",
    updated_at: "2026-04-22T00:00:00.000Z",
  }),
  isLoading: false,
  isError: false,
  error: null,
  refetch: refetchProfileMock,
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock("@/lib/auth/account-management", () => ({
  __esModule: true,
  updateMobileEmail: jest.fn(async () => ({ error: null })),
  updateMobilePassword: jest.fn(async () => ({ error: null })),
}));

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  refreshMobileAuthSession: () => refreshMobileAuthSessionMock(),
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: Object.assign(() => authStoreState, {
    getState: () => authStoreState,
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      profiles: {
        get: { invalidate: invalidateProfileMock },
      },
    }),
    profiles: {
      get: {
        useQuery: (...args: Parameters<typeof profileQueryUseQueryMock>) =>
          profileQueryUseQueryMock(...args),
      },
    },
  },
}));

import { useAuth } from "../useAuth";

describe("useAuth optimistic onboarding precedence", () => {
  beforeEach(() => {
    setProfileMock.mockClear();
    setOnboardingStatusMock.mockClear();
    refetchProfileMock.mockClear();
    refetchProfileMock.mockResolvedValue({ data: profileQueryResult.data });
    invalidateProfileMock.mockClear();
    refreshMobileAuthSessionMock.mockClear();
    profileQueryUseQueryMock.mockReset();
    profileQueryUseQueryMock.mockReturnValue(profileQueryResult);
    setProfileMock.mockImplementation((profile: AuthProfile | null) => {
      authStoreState.profile = profile;
    });
    setOnboardingStatusMock.mockImplementation(
      (status: AuthProfile["onboarding_status"] | null) => {
        authStoreState.onboardingStatus = status;
      },
    );
    authStoreState.user = { id: "user-1", email: "athlete@test.com", emailVerified: true };
    authStoreState.onboardingStatus = "completed";
    authStoreState.profile = createProfile({ full_name: "Optimistic Name" });
  });

  it("uses the explicit status returned by the profile query", async () => {
    const { result } = await renderHook(() => useAuth());

    expect(result.current.onboardingStatus).toBe("processing");
    expect(result.current.profile).toEqual(
      expect.objectContaining({
        id: "profile-1",
        onboarding_status: "completed",
        full_name: "Optimistic Name",
        updated_at: "2026-04-23T00:00:00.000Z",
        bio: null,
        dob: null,
      }),
    );
    expect(setOnboardingStatusMock).toHaveBeenCalledWith("processing");
    expect(setProfileMock).toHaveBeenCalled();
  });

  it("does not fetch the profile for unverified users", async () => {
    authStoreState.user = { id: "user-1", email: "athlete@test.com", emailVerified: false };

    await renderHook(() => useAuth());

    expect(profileQueryUseQueryMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false }),
    );
  });

  it("syncs fresh profile data when only updated_at changes", async () => {
    authStoreState.onboardingStatus = "processing";
    authStoreState.profile = createProfile({
      onboarding_status: "processing",
      avatar_url: "https://old.example/avatar.png",
      updated_at: "2026-04-22T00:00:00.000Z",
    });
    profileQueryUseQueryMock.mockReturnValue({
      ...profileQueryResult,
      data: createProfile({
        onboarding_status: "processing",
        avatar_url: null,
        bio: null,
        dob: null,
        updated_at: "2026-04-23T00:00:00.000Z",
      }),
    });

    await renderHook(() => useAuth());

    expect(setProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "profile-1",
        onboarding_status: "processing",
        avatar_url: null,
        bio: null,
        dob: null,
        updated_at: "2026-04-23T00:00:00.000Z",
      }),
    );
  });

  it("refreshes onboarding status from the authoritative profile query", async () => {
    authStoreState.onboardingStatus = "processing";
    authStoreState.profile = createProfile({
      onboarding_status: "processing",
      bio: null,
      dob: null,
    });
    const { result } = await renderHook(() => useAuth());
    authStoreState.onboardingStatus = "processing";
    authStoreState.profile = createProfile({
      onboarding_status: "processing",
      bio: null,
      dob: null,
    });
    setProfileMock.mockClear();
    setOnboardingStatusMock.mockClear();
    invalidateProfileMock.mockClear();

    await act(async () => {
      await result.current.refreshOnboardingStatus();
    });

    expect(setOnboardingStatusMock).toHaveBeenCalledWith("processing");
    expect(setProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "profile-1",
        onboarding_status: "processing",
        bio: null,
        dob: null,
      }),
    );
    expect(authStoreState.profile).toEqual(
      expect.objectContaining({ id: "profile-1", onboarding_status: "processing" }),
    );
    expect(invalidateProfileMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes a null local profile from the query without creating a partial profile", async () => {
    authStoreState.onboardingStatus = null;
    authStoreState.profile = null;
    const { result } = await renderHook(() => useAuth());
    authStoreState.onboardingStatus = null;
    authStoreState.profile = null;
    setProfileMock.mockClear();
    setOnboardingStatusMock.mockClear();
    invalidateProfileMock.mockClear();

    await act(async () => {
      await result.current.refreshOnboardingStatus();
    });

    expect(setOnboardingStatusMock).toHaveBeenCalledWith("processing");
    expect(setProfileMock).toHaveBeenCalled();
    expect(invalidateProfileMock).toHaveBeenCalledTimes(1);
  });
});
