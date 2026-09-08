import React from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { act, fireEvent, renderNative, screen } from "../../../../test/render-native";

const routeData = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "River Loop",
  total_distance: 10200,
  total_ascent: 180,
  total_descent: 175,
  created_at: "2026-03-01T00:00:00.000Z",
  description: "Flat start, climb home.",
  polyline: "encoded",
  has_liked: false,
  likes_count: 4,
  is_public: true,
};

const backMock = jest.fn();
const navigateMock = jest.fn();
const deleteMutateMock = jest.fn();
const toggleLikeMutateMock = jest.fn();
const routeGetInvalidateMock = jest.fn();
const routeGetResetMock = jest.fn();
const loadFullUseQueryMock = jest.fn();
const shareMock = jest.fn();
const alertMock = jest.fn();
const authState = { user: { id: "profile-1" } };
const routeLifecycleState = { storageState: "ready" };
let reliableMutationOptions:
  | {
      invalidate?: Array<() => Promise<unknown> | unknown>;
      onError?: () => Promise<void>;
      onSuccess?: () => void;
      success?: string;
    }
  | undefined;

type StackScreenProps = Record<string, unknown> & {
  options?: { headerRight?: () => React.ReactNode };
};

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: StackScreenProps) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useLocalSearchParams: () => ({ id: routeData.id }),
  useRouter: () => ({ back: backMock, navigate: navigateMock }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: alertMock },
  Share: { share: shareMock },
}));

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: createHost("MapView"),
  Marker: createHost("Marker"),
  Polyline: createHost("Polyline"),
  PROVIDER_DEFAULT: "default",
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createButtonComponent(),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useSessionView: () => null,
}));

jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  __esModule: true,
  useOptionalActivityRecorderService: () => null,
}));

jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));

jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: (
    _mutation: unknown,
    options: {
      invalidate?: Array<() => Promise<unknown> | unknown>;
      onError?: () => Promise<void>;
      onSuccess?: () => void;
      success?: string;
    },
  ) => {
    reliableMutationOptions = options;
    return {
      mutate: deleteMutateMock,
      isPending: false,
    };
  },
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      routes: { get: { invalidate: routeGetInvalidateMock, reset: routeGetResetMock } },
    }),
    routes: {
      get: {
        useQuery: () => ({
          data: {
            ...routeData,
            profile_id: "profile-1",
            storage_state: routeLifecycleState.storageState,
          },
          isLoading: false,
        }),
      },
      loadFull: {
        useQuery: (...args: unknown[]) => {
          loadFullUseQueryMock(...args);
          return {
            data: {
              coordinates: [
                { latitude: 40.0, longitude: -75.0, altitude: 120 },
                { latitude: 40.1, longitude: -75.1, altitude: 180 },
              ],
            },
          };
        },
      },
      delete: {},
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: toggleLikeMutateMock }),
      },
      getComments: {
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [], total: 0, hasMore: false, nextCursor: undefined }] },
          refetch: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: jest.fn(),
        }),
      },
      addComment: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
  },
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  decodePolyline: jest.fn(() => []),
}));

jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  __esModule: true,
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Ellipsis: createHost("Ellipsis"),
  Heart: createHost("Heart"),
}));

const RouteDetailScreen = require("../route-detail").default;
const ReactNative = require("react-native") as typeof import("react-native");
Object.defineProperty(ReactNative, "Share", { configurable: true, value: { share: shareMock } });

describe("route detail screen", () => {
  beforeEach(() => {
    backMock.mockReset();
    navigateMock.mockReset();
    deleteMutateMock.mockReset();
    toggleLikeMutateMock.mockReset();
    routeGetInvalidateMock.mockReset().mockResolvedValue(undefined);
    loadFullUseQueryMock.mockReset();
    shareMock.mockReset().mockResolvedValue(undefined);
    alertMock.mockReset();
    authState.user.id = "profile-1";
    routeLifecycleState.storageState = "ready";
    reliableMutationOptions = undefined;
  });

  it("shows the new identity-first route layout", async () => {
    await renderNative(<RouteDetailScreen />);

    expect(screen.getByText("River Loop")).toBeTruthy();
    expect(screen.getByText("Flat start, climb home.")).toBeTruthy();
    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("10.2 km")).toBeTruthy();
    expect(screen.getByText("Climb")).toBeTruthy();
    expect(screen.getByText("180.0 m")).toBeTruthy();
    expect(screen.getByText("Descent")).toBeTruthy();
    expect(screen.getByText("175.0 m")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("keeps sharing available for ready routes and reports share-sheet failures", async () => {
    shareMock.mockRejectedValueOnce(new Error("unavailable"));
    await renderNative(<RouteDetailScreen />);

    expect(screen.getByTestId("route-detail-share-button")).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByTestId("route-detail-share-button"));
      await Promise.resolve();
    });

    expect(ReactNative.Alert.alert as jest.Mock).toHaveBeenCalledWith(
      "Share failed",
      "Could not open the share sheet. Please try again.",
    );
  });

  it("uses the configured public web origin for route shares", async () => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.gradientpeak.test";
    process.env.EXPO_PUBLIC_WEB_URL = "https://share.gradientpeak.test";
    await renderNative(<RouteDetailScreen />);

    await fireEvent.press(screen.getByTestId("route-detail-share-button"));

    expect(shareMock).toHaveBeenCalledWith({
      message: "https://share.gradientpeak.test/share/routes/11111111-1111-4111-8111-111111111111",
      url: "https://share.gradientpeak.test/share/routes/11111111-1111-4111-8111-111111111111",
    });
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_WEB_URL;
  });

  it("moves owner management into the header overflow menu", async () => {
    await renderNative(<RouteDetailScreen />);

    await fireEvent.press(screen.getByTestId("route-detail-options-trigger"));
    expect(screen.getByTestId("route-detail-options-edit")).toBeTruthy();
    expect(screen.getByTestId("route-detail-options-delete")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("route-detail-options-edit"));
    expect(navigateMock).toHaveBeenCalledWith(
      "/route-edit?id=11111111-1111-4111-8111-111111111111",
    );
  });

  it("hides owner-only delete action for non-owners", async () => {
    authState.user.id = "profile-2";

    await renderNative(<RouteDetailScreen />);

    await fireEvent.press(screen.getByTestId("route-detail-options-trigger"));
    expect(screen.queryByTestId("route-detail-options-edit")).toBeNull();
    expect(screen.queryByTestId("route-detail-options-delete")).toBeNull();
  });

  it("uses a confirm modal before deleting a route", async () => {
    await renderNative(<RouteDetailScreen />);

    expect(reliableMutationOptions?.invalidate).toBeUndefined();
    expect(reliableMutationOptions?.success).toBeUndefined();

    await fireEvent.press(screen.getByTestId("route-detail-options-trigger"));
    await fireEvent.press(screen.getByTestId("route-detail-options-delete"));

    expect(screen.getByTestId("route-detail-delete-modal")).toBeTruthy();
    expect(deleteMutateMock).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("route-detail-delete-confirm"));

    expect(deleteMutateMock).toHaveBeenCalledWith({ id: "11111111-1111-4111-8111-111111111111" });

    reliableMutationOptions?.onSuccess?.();

    expect(routeGetResetMock).toHaveBeenCalledWith({ id: routeData.id });
    expect(routeGetResetMock.mock.invocationCallOrder[0]).toBeLessThan(
      backMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(routeGetInvalidateMock).toHaveBeenCalledWith({ id: routeData.id });
  });

  it("renders deletion-pending routes as a retry-only owner state", async () => {
    routeLifecycleState.storageState = "deletion_pending";
    await renderNative(<RouteDetailScreen />);

    expect(screen.getByTestId("route-detail-deletion-pending")).toBeTruthy();
    expect(screen.queryByTestId("route-detail-share-button")).toBeNull();
    expect(screen.getByText("Route deletion pending")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("route-detail-options-trigger"));
    expect(screen.queryByTestId("route-detail-options-recording")).toBeNull();
    expect(screen.queryByTestId("route-detail-options-edit")).toBeNull();
    expect(screen.getByTestId("route-detail-options-delete")).toBeTruthy();
    expect(
      loadFullUseQueryMock.mock.calls.every(
        ([, options]) => (options as { enabled?: boolean } | undefined)?.enabled === false,
      ),
    ).toBe(true);

    await fireEvent.press(screen.getByTestId("route-detail-options-delete"));
    expect(screen.getByTestId("route-detail-delete-modal")).toBeTruthy();
    await act(async () => {
      await reliableMutationOptions?.onError?.();
    });
    expect(routeGetInvalidateMock).toHaveBeenCalledWith({ id: routeData.id });
    expect(screen.queryByTestId("route-detail-delete-modal")).toBeNull();
  });

  it("refreshes the deleted route without masking the mutation error", async () => {
    await renderNative(<RouteDetailScreen />);

    await act(async () => {
      await expect(reliableMutationOptions?.onError?.()).resolves.toBeUndefined();
    });
    expect(routeGetInvalidateMock).toHaveBeenCalledWith({ id: routeData.id });
  });
});
