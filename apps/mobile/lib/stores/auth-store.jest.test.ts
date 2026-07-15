import type { AuthProfile } from "./auth-store";

jest.mock("react-native", () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock("@/lib/auth/client", () => ({
  getMobileAuthSession: jest.fn(async () => null),
  refreshMobileAuthSession: jest.fn(async () => null),
  signOutMobileAuth: jest.fn(async () => undefined),
  subscribeToMobileAuthSession: jest.fn(() => jest.fn()),
}));

const profile: AuthProfile = {
  id: "profile-1",
  created_at: "2026-07-13T00:00:00.000Z",
  updated_at: "2026-07-13T00:00:00.000Z",
  email: "athlete@example.com",
  full_name: null,
  avatar_url: null,
  cover_url: null,
  bio: null,
  dob: null,
  gender: null,
  onboarded: false,
  is_public: false,
  username: null,
  preferred_units: null,
  planning_timezone: null,
  language: null,
  ftp: null,
  threshold_hr: null,
  weight_kg: null,
};

describe("auth store profile state", () => {
  beforeEach(async () => {
    jest.resetModules();
    const { useAuthStore } = await import("./auth-store");
    useAuthStore.setState({
      session: null,
      user: null,
      profile: null,
      onboardingStatus: null,
    });
  });

  it("stores the profiles.get shape without changing nullable fields", async () => {
    const { useAuthStore } = await import("./auth-store");

    useAuthStore.getState().setProfile(profile);

    expect(useAuthStore.getState().profile).toEqual(profile);
    expect(useAuthStore.getState().profile?.bio).toBeNull();
    expect(useAuthStore.getState().profile?.dob).toBeNull();
  });

  it("preserves null and clears a loaded profile when the authenticated user changes", async () => {
    const { useAuthStore } = await import("./auth-store");

    useAuthStore.getState().setProfile(profile);
    useAuthStore.getState().setSession({
      bearerToken: "token",
      sessionId: "session-2",
      transport: "bearer",
      user: {
        id: "user-2",
        email: "next@example.com",
        emailVerified: true,
      },
    });

    expect(useAuthStore.getState().profile).toBeNull();
    useAuthStore.getState().setProfile(null);
    expect(useAuthStore.getState().profile).toBeNull();
  });
});
