import { renderHook } from "@testing-library/react-native";

const setProfileMock = jest.fn();
const setOnboardingStatusMock = jest.fn();
const refetchProfileMock = jest.fn();
const invalidateProfileMock = jest.fn();
const refreshMobileAuthSessionMock = jest.fn(async () => null);
const profileQueryUseQueryMock = jest.fn();

const authStoreState = {
  session: { user: { id: "user-1" } },
  user: { id: "user-1", email: "athlete@test.com", emailVerified: true },
  ready: true,
  loading: false,
  error: null,
  onboardingStatus: true,
  profile: {
    id: "profile-1",
    onboarded: true,
    full_name: "Optimistic Name",
    updated_at: "2026-04-23T00:00:00.000Z",
  },
  setProfile: setProfileMock,
  setOnboardingStatus: setOnboardingStatusMock,
};

const profileQueryResult = {
  data: {
    id: "profile-1",
    onboarded: false,
    full_name: "Stale Name",
    updated_at: "2026-04-22T00:00:00.000Z",
  },
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
  useAuthStore: () => authStoreState,
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
    authStoreState.user = { id: "user-1", email: "athlete@test.com", emailVerified: true };
  });

  it("keeps optimistic onboarding and profile over stale profile query data", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.onboardingStatus).toBe(true);
    expect(result.current.profile).toEqual({
      id: "profile-1",
      onboarded: true,
      full_name: "Optimistic Name",
      updated_at: "2026-04-23T00:00:00.000Z",
    });
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
    authStoreState.profile = {
      id: "profile-1",
      onboarded: false,
      avatar_url: "https://old.example/avatar.png",
      updated_at: "2026-04-22T00:00:00.000Z",
    } as any;
    profileQueryUseQueryMock.mockReturnValue({
      ...profileQueryResult,
      data: {
        id: "profile-1",
        onboarded: false,
        avatar_url: "https://new.example/avatar.png",
        updated_at: "2026-04-23T00:00:00.000Z",
      },
    });

    renderHook(() => useAuth());

    expect(setProfileMock).toHaveBeenCalledWith({
      id: "profile-1",
      onboarded: false,
      avatar_url: "https://new.example/avatar.png",
      updated_at: "2026-04-23T00:00:00.000Z",
    });
  });
});
