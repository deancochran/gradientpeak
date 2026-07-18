import { waitFor } from "@testing-library/react-native";
import React from "react";
import { createHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";

const replaceMock = jest.fn();
const cleanupStreamRecordingsMock = jest.fn(async () => undefined);
const cleanupFitRecordingsMock = jest.fn(async () => undefined);
const cleanupLocationTrackingMock = jest.fn(async () => undefined);
type AuthStoreState = {
  clearSession: () => Promise<void>;
  initialize: () => Promise<void>;
  ready: boolean;
  profile: { id: string };
};
type LocalFileReference = {
  activityFilePath?: string | null;
  streamArtifactPaths?: string[];
};
type QueueFileReference = {
  localActivityFilePath?: string | null;
  streamArtifactPaths?: string[];
  status: string;
};
const loadPendingFinalizedArtifactMock = jest.fn(
  async (): Promise<LocalFileReference | null> => null,
);
const loadActivitySubmissionQueueJobsMock = jest.fn(async (): Promise<QueueFileReference[]> => []);

const authState = {
  authState: "authenticated-verified",
  userStatus: "verified",
  onboardingStatus: true,
  isAuthenticated: true,
  isFullyLoaded: true,
  user: { id: "user-1", email: "athlete@example.com" },
  profileLoading: false,
  profileError: null,
  refreshProfile: jest.fn(async () => undefined),
};

const themeState = {
  theme: "light",
  resolvedTheme: "light",
  isLoaded: true,
};

let segmentsValue: string[] = ["(internal)", "(tabs)"];

jest.mock("@/global.css", () => ({}), { virtual: true });

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  View: createHost("View"),
}));

jest.mock("@react-navigation/native", () => ({
  __esModule: true,
  ThemeProvider: ({ children }: React.PropsWithChildren) => children,
}));

jest.mock("react-native-gesture-handler", () => ({
  __esModule: true,
  GestureHandlerRootView: createHost("GestureHandlerRootView"),
}));

jest.mock("react-native-css/components/react-native-safe-area-context", () => ({
  __esModule: true,
  SafeAreaProvider: createHost("SafeAreaProvider"),
  SafeAreaView: createHost("SafeAreaView"),
}));

jest.mock("@rn-primitives/portal", () => ({
  __esModule: true,
  PortalHost: createHost("PortalHost"),
}));

jest.mock("expo-status-bar", () => ({
  __esModule: true,
  StatusBar: createHost("StatusBar"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Redirect: ({ href }: { href: unknown }) =>
    React.createElement("Text", { testID: "redirect-target" }, JSON.stringify(href)),
  Slot: () => React.createElement("Text", null, "Internal app content"),
  router: { replace: replaceMock },
  useSegments: () => segmentsValue,
}));

jest.mock("nativewind", () => ({
  __esModule: true,
  vars: <T extends Record<string, string | number>>(value: T) => value,
  VariableContextProvider: ({ children }: React.PropsWithChildren) => children,
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@repo/ui/components/loading", () => ({
  __esModule: true,
  Spinner: createHost("Spinner"),
}));

jest.mock(
  "@repo/tailwindcss/native",
  () => ({
    __esModule: true,
    NATIVE_THEME_VARIABLES: { light: {}, dark: {} },
  }),
  { virtual: true },
);

jest.mock("@/lib/theme", () => ({
  __esModule: true,
  getNavigationTheme: () => ({ colors: {} }),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@/lib/providers/QueryProvider", () => ({
  __esModule: true,
  QueryProvider: ({ children }: React.PropsWithChildren) => children,
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  initializeServerConfig: jest.fn(async () => undefined),
  useServerConfig: () => ({ initialized: true }),
}));

jest.mock("@/lib/services/ActivityRecorder/StreamBuffer", () => ({
  __esModule: true,
  StreamBuffer: { cleanupOrphanedRecordings: cleanupStreamRecordingsMock },
}));

jest.mock("@/lib/services/ActivityRecorder/location", () => ({
  __esModule: true,
  LocationManager: { cleanupOrphanedBackgroundTracking: cleanupLocationTrackingMock },
}));

jest.mock("@/lib/services/ActivityRecorder/finalizedArtifactStorage", () => ({
  __esModule: true,
  loadPendingFinalizedArtifact: loadPendingFinalizedArtifactMock,
  finalizedArtifactReferencesLocalFiles: (artifact: LocalFileReference | null) =>
    Boolean(artifact?.activityFilePath || artifact?.streamArtifactPaths?.length),
}));

jest.mock("@/lib/services/activitySubmissionQueue", () => ({
  __esModule: true,
  loadActivitySubmissionQueueJobs: loadActivitySubmissionQueueJobsMock,
  incompleteQueueJobReferencesLocalFiles: (job: QueueFileReference) =>
    job.status !== "complete" &&
    Boolean(job.localActivityFilePath || job.streamArtifactPaths?.length),
}));

jest.mock("@/lib/services/activitySubmissionQueue/migration-only-v3", () => ({
  __esModule: true,
  migrateSingleSportLocalStateToV3Once: jest.fn(async () => undefined),
}));

jest.mock("@/lib/services/ActivityRecorder/checkpointStorage", () => ({
  __esModule: true,
  loadAndClaimRecordingCheckpoint: jest.fn(async () => ({ status: "none" })),
}));

jest.mock("@/lib/hooks/useStartupActivitySubmissionRecovery", () => ({
  __esModule: true,
  useStartupActivitySubmissionRecovery: jest.fn(),
}));

jest.mock("@/lib/services/mobileRecordingStartup", () => ({
  __esModule: true,
  prepareMobileRecordingStartup: jest.fn(async () => {
    const [pendingArtifact, queueJobs] = await Promise.all([
      loadPendingFinalizedArtifactMock(),
      loadActivitySubmissionQueueJobsMock(),
    ]);
    return {
      checkpoint: { status: "none" },
      hasQuarantinedEvidence: false,
      queueJobs: pendingArtifact
        ? [
            ...queueJobs,
            {
              status: "queued",
              localActivityFilePath: pendingArtifact.activityFilePath,
              streamArtifactPaths: pendingArtifact.streamArtifactPaths,
            },
          ]
        : queueJobs,
    };
  }),
}));

jest.mock("@/lib/services/fit/GarminFitEncoder", () => ({
  __esModule: true,
  GarminFitEncoder: { cleanupOrphanedRecordings: cleanupFitRecordingsMock },
}));

jest.mock("@/lib/services/sentry", () => ({
  __esModule: true,
  initSentry: jest.fn(),
  Sentry: { wrap: (component: unknown) => component },
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: <T,>(selector: (state: AuthStoreState) => T) =>
    selector({
      clearSession: jest.fn(async () => undefined),
      initialize: jest.fn(async () => undefined),
      ready: true,
      profile: { id: "profile-1" },
    }),
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => themeState,
}));

const RootLayout = require("../_layout").default;

describe("root layout auth guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadPendingFinalizedArtifactMock.mockResolvedValue(null);
    loadActivitySubmissionQueueJobsMock.mockResolvedValue([]);
    Object.assign(authState, {
      authState: "authenticated-verified",
      userStatus: "verified",
      onboardingStatus: true,
      isAuthenticated: true,
      isFullyLoaded: true,
      user: { id: "user-1", email: "athlete@example.com" },
      profileLoading: false,
      profileError: null,
    });
    themeState.isLoaded = true;
    segmentsValue = ["(internal)", "(tabs)"];
  });

  it("redirects unauthenticated users to sign in", () => {
    authState.authState = "anonymous";
    authState.isAuthenticated = false;
    segmentsValue = ["(internal)", "(tabs)"];

    renderNative(<RootLayout />);

    expect(screen.getByTestId("redirect-target").props.children).toContain("sign-in");
  });

  it("redirects unverified users to verify with their email", () => {
    authState.authState = "authenticated-unverified";
    authState.userStatus = "pending";
    segmentsValue = ["(internal)", "(tabs)"];

    renderNative(<RootLayout />);

    expect(screen.getByTestId("redirect-target").props.children).toContain("verify");
    expect(screen.getByTestId("redirect-target").props.children).toContain("athlete@example.com");
  });

  it("redirects signed-in users away from sign-up and into verify until confirmed", () => {
    authState.authState = "authenticated-unverified";
    authState.userStatus = "unverified";
    segmentsValue = ["(external)", "sign-up"];

    renderNative(<RootLayout />);

    expect(screen.getByTestId("redirect-target").props.children).toContain("verify");
    expect(screen.getByTestId("redirect-target").props.children).toContain("athlete@example.com");
  });

  it("redirects verified users without onboarding to onboarding", async () => {
    authState.onboardingStatus = false;
    segmentsValue = ["(internal)", "(tabs)"];

    renderNative(<RootLayout />);

    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toContain("onboarding"),
    );
  });

  it("renders the internal app slot for fully eligible users", async () => {
    renderNative(<RootLayout />);

    await waitFor(() => expect(screen.getByText("Internal app content")).toBeTruthy());
  });

  it("exposes an accessible shared loading state while the theme initializes", async () => {
    themeState.isLoaded = false;

    renderNative(<RootLayout />);

    await waitFor(() =>
      expect(screen.getByTestId("app-theme-loading").props).toMatchObject({
        accessibilityLiveRegion: "polite",
        accessibilityState: { busy: true },
        label: "Loading app theme",
        size: "large",
      }),
    );
  });

  it("preserves finalized files when a pending artifact references them", async () => {
    loadPendingFinalizedArtifactMock.mockResolvedValue({
      activityFilePath: "file:///pending.fit",
      streamArtifactPaths: ["file:///pending-streams"],
    });

    renderNative(<RootLayout />);

    await waitFor(() => expect(loadPendingFinalizedArtifactMock).toHaveBeenCalledTimes(1));
    expect(cleanupStreamRecordingsMock).not.toHaveBeenCalled();
    expect(cleanupFitRecordingsMock).not.toHaveBeenCalled();
    expect(cleanupLocationTrackingMock).not.toHaveBeenCalled();
  });

  it("preserves finalized files when an incomplete queue job references them", async () => {
    loadActivitySubmissionQueueJobsMock.mockResolvedValue([
      {
        status: "failed",
        localActivityFilePath: "file:///retry.fit",
        streamArtifactPaths: [],
      },
    ]);

    renderNative(<RootLayout />);

    await waitFor(() => expect(loadActivitySubmissionQueueJobsMock).toHaveBeenCalledTimes(1));
    expect(cleanupStreamRecordingsMock).not.toHaveBeenCalled();
    expect(cleanupFitRecordingsMock).not.toHaveBeenCalled();
  });

  it("allows orphan cleanup when only completed queue jobs reference local files", async () => {
    loadActivitySubmissionQueueJobsMock.mockResolvedValue([
      {
        status: "complete",
        localActivityFilePath: "file:///completed.fit",
        streamArtifactPaths: ["file:///completed-streams"],
      },
    ]);

    renderNative(<RootLayout />);

    await waitFor(() => expect(cleanupStreamRecordingsMock).toHaveBeenCalledTimes(1));
    expect(cleanupFitRecordingsMock).toHaveBeenCalledTimes(1);
  });
});
