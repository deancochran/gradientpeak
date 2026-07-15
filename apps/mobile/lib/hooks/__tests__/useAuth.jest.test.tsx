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
  onboarded: true,
  is_public: false,
  username: null,
  preferred_units: null,
  planning_timezone: null,
  language: null,
  ftp: null,
  threshold_hr: null,
  weight_kg: null,
  ...overrides,
});

const authStoreState = {
  session: { user: { id: "user-1" } },
  user: { id: "user-1", email: "athlete@test.com", emailVerified: true },
  ready: true,
  loading: false,
  error: null,
  onboardingStatus: true as boolean | null,
  profile: createProfile({
    full_name: "Optimistic Name",
  }) as AuthProfile | null,
  setProfile: setProfileMock,
  setOnboardingStatus: setOnboardingStatusMock,
};

const profileQueryResult = {
  data: createProfile({
    onboarded: false,
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

jest.mock("react-native/Libraries/AppState/AppState", () => ({
  __esModule: true,
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock("@/lib/auth/account-management", () => ({
  __esModule: true,
  deleteMobileAccount: jest.fn(async () => ({ error: null })),
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
        useQuery: (...args: any[]) => profileQueryUseQueryMock(...args),
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
    invalidateProfileMock.mockClear();
    refreshMobileAuthSessionMock.mockClear();
    profileQueryUseQueryMock.mockReset();
    profileQueryUseQueryMock.mockReturnValue(profileQueryResult);
    setProfileMock.mockImplementation((profile: AuthProfile | null) => {
      authStoreState.profile = profile;
    });
    setOnboardingStatusMock.mockImplementation((status: boolean | null) => {
      authStoreState.onboardingStatus = status;
    });
    authStoreState.user = { id: "user-1", email: "athlete@test.com", emailVerified: true };
    authStoreState.onboardingStatus = true;
    authStoreState.profile = createProfile({ full_name: "Optimistic Name" });
  });

  it("keeps optimistic onboarding and profile over stale profile query data", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.onboardingStatus).toBe(true);
    expect(result.current.profile).toEqual(
      expect.objectContaining({
        id: "profile-1",
        onboarded: true,
        full_name: "Optimistic Name",
        updated_at: "2026-04-23T00:00:00.000Z",
        bio: null,
        dob: null,
      }),
    );
    expect(setOnboardingStatusMock).not.toHaveBeenCalled();
    expect(setProfileMock).not.toHaveBeenCalled();
  });

  it("does not fetch the profile for unverified users", () => {
    authStoreState.user = { id: "user-1", email: "athlete@test.com", emailVerified: false };

    renderHook(() => useAuth());

    expect(profileQueryUseQueryMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false }),
    );
  });

  it("syncs fresh profile data when only updated_at changes", () => {
    authStoreState.onboardingStatus = false;
    authStoreState.profile = createProfile({
      onboarded: false,
      avatar_url: "https://old.example/avatar.png",
      updated_at: "2026-04-22T00:00:00.000Z",
    });
    profileQueryUseQueryMock.mockReturnValue({
      ...profileQueryResult,
      data: createProfile({
        onboarded: false,
        avatar_url: null,
        bio: null,
        dob: null,
        updated_at: "2026-04-23T00:00:00.000Z",
      }),
    });

    renderHook(() => useAuth());

    expect(setProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "profile-1",
        onboarded: false,
        avatar_url: null,
        bio: null,
        dob: null,
        updated_at: "2026-04-23T00:00:00.000Z",
      }),
    );
  });

  it("completes onboarding against the typed existing profile and invalidates the query", async () => {
    authStoreState.onboardingStatus = false;
    authStoreState.profile = createProfile({
      onboarded: false,
      bio: null,
      dob: null,
    });
    const { result } = renderHook(() => useAuth());
    authStoreState.onboardingStatus = false;
    authStoreState.profile = createProfile({
      onboarded: false,
      bio: null,
      dob: null,
    });
    setProfileMock.mockClear();
    setOnboardingStatusMock.mockClear();
    invalidateProfileMock.mockClear();

    await act(async () => {
      await result.current.completeOnboarding();
    });

    expect(setOnboardingStatusMock).toHaveBeenCalledWith(true);
    expect(authStoreState.onboardingStatus).toBe(true);
    expect(setProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "profile-1",
        onboarded: true,
        bio: null,
        dob: null,
      }),
    );
    expect(authStoreState.profile).toEqual(
      expect.objectContaining({ id: "profile-1", onboarded: true, bio: null, dob: null }),
    );
    expect(invalidateProfileMock).toHaveBeenCalledTimes(1);
  });

  it("completes onboarding with a null profile without creating a partial profile", async () => {
    authStoreState.onboardingStatus = null;
    authStoreState.profile = null;
    const { result } = renderHook(() => useAuth());
    authStoreState.onboardingStatus = null;
    authStoreState.profile = null;
    setProfileMock.mockClear();
    setOnboardingStatusMock.mockClear();
    invalidateProfileMock.mockClear();

    await act(async () => {
      await result.current.completeOnboarding();
    });

    expect(setOnboardingStatusMock).toHaveBeenCalledWith(true);
    expect(authStoreState.onboardingStatus).toBe(true);
    expect(setProfileMock).not.toHaveBeenCalled();
    expect(authStoreState.profile).toBeNull();
    expect(invalidateProfileMock).toHaveBeenCalledTimes(1);
  });
});
