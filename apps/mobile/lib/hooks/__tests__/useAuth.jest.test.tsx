import { renderHook } from "@testing-library/react-native";

const setProfileMock = jest.fn();
const setOnboardingStatusMock = jest.fn();
const refetchProfileMock = jest.fn();
const invalidateProfileMock = jest.fn();
const refreshMobileAuthSessionMock = jest.fn(async () => null);

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
  useAuthStore: () => ({
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
    },
    setProfile: setProfileMock,
    setOnboardingStatus: setOnboardingStatusMock,
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
        useQuery: () => ({
          data: {
            id: "profile-1",
            onboarded: false,
            full_name: "Stale Name",
          },
          isLoading: false,
          isError: false,
          error: null,
          refetch: refetchProfileMock,
        }),
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
  });

  it("keeps optimistic onboarding and profile over stale profile query data", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.onboardingStatus).toBe(true);
    expect(result.current.profile).toEqual({
      id: "profile-1",
      onboarded: true,
      full_name: "Optimistic Name",
    });
    expect(setOnboardingStatusMock).not.toHaveBeenCalled();
    expect(setProfileMock).not.toHaveBeenCalled();
  });
});
