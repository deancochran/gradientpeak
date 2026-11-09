const signOutMobileAuthMock = jest.fn(async () => undefined);

jest.mock("react-native", () => ({
  __esModule: true,
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  getMobileAuthSession: jest.fn(async () => null),
  refreshMobileAuthSession: jest.fn(async () => null),
  signOutMobileAuth: signOutMobileAuthMock,
  subscribeToMobileAuthSession: jest.fn(() => jest.fn()),
}));

const { useAuthStore } =
  require("../../../lib/stores/auth-store") as typeof import("../../../lib/stores/auth-store");

describe("P0 mobile auth recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      session: null,
      user: null,
      profile: null,
      userStatus: null,
      onboardingStatus: null,
      loading: false,
      ready: true,
      error: null,
    });
  });

  it("clears the local session even when signing out remotely succeeds", async () => {
    useAuthStore.getState().setSession({
      session: {
        id: "session-1",
        userId: "user-1",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        token: "session-token",
        createdAt: new Date("2029-01-01T00:00:00.000Z"),
        updatedAt: new Date("2029-01-01T00:00:00.000Z"),
      },
      user: {
        id: "user-1",
        email: "athlete@example.com",
        name: "Athlete",
        image: null,
        emailVerified: true,
        createdAt: new Date("2029-01-01T00:00:00.000Z"),
        updatedAt: new Date("2029-01-01T00:00:00.000Z"),
      },
    } as never);
    await useAuthStore.getState().clearSession();

    expect(signOutMobileAuthMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ session: null, user: null, loading: false });
  });
});
