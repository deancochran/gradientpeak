const restoredSession = {
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
};

const getMobileAuthSessionMock = jest.fn(async () => restoredSession);

jest.mock("react-native", () => ({
  __esModule: true,
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  getMobileAuthSession: getMobileAuthSessionMock,
  refreshMobileAuthSession: jest.fn(async () => restoredSession),
  signOutMobileAuth: jest.fn(async () => undefined),
  subscribeToMobileAuthSession: jest.fn(() => jest.fn()),
}));

const { useAuthStore } =
  require("../../lib/stores/auth-store") as typeof import("../../lib/stores/auth-store");

describe("P0 startup session restore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      session: null,
      user: null,
      profile: null,
      userStatus: null,
      onboardingStatus: null,
      loading: true,
      ready: false,
      error: null,
    });
  });

  it("restores the persisted session before marking auth ready", async () => {
    await useAuthStore.getState().initialize();

    expect(getMobileAuthSessionMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      session: restoredSession,
      user: restoredSession.user,
      loading: false,
      ready: true,
    });
  });
});
