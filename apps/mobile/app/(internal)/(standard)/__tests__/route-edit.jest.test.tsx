import type React from "react";
import { act } from "react";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const backMock = jest.fn();
const invalidateRoutesMock = jest.fn();
const updateRouteMock = jest.fn();
const authState = { user: { id: "profile-1" } };

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) =>
      options.headerRight?.() ?? null,
  },
  useLocalSearchParams: () => ({ id: "route-1" }),
  useRouter: () => ({ back: backMock }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ routes: { invalidate: invalidateRoutesMock } }),
    routes: {
      get: {
        useQuery: () => ({
          data: {
            id: "route-1",
            profile_id: "profile-1",
            name: "Ridge loop",
            description: "Original notes",
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        }),
      },
      update: {
        useMutation: () => ({ isPending: false, mutateAsync: updateRouteMock }),
      },
    },
  },
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

describe("route edit screen", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";
    backMock.mockReset();
    invalidateRoutesMock.mockReset().mockResolvedValue(undefined);
    updateRouteMock.mockReset().mockResolvedValue({ id: "route-1" });
    authState.user.id = "profile-1";
  });

  async function renderScreen() {
    const RouteEditScreen = (await import("../route-edit")).default;
    return await renderNative(<RouteEditScreen />);
  }

  it("hydrates, validates, and persists editable route metadata", async () => {
    await renderScreen();

    expect(screen.getByTestId("route-edit-name-input").props.value).toBe("Ridge loop");
    expect(screen.getByTestId("route-edit-name-input").props.selectTextOnFocus).toBe(true);
    await fireEvent.changeText(
      screen.getByTestId("route-edit-name-input"),
      "  Updated ridge loop  ",
    );
    await fireEvent.changeText(screen.getByTestId("route-edit-description-input"), "   ");

    await act(async () => {
      await fireEvent.press(screen.getByTestId("route-edit-submit-button"));
    });

    await waitFor(() =>
      expect(updateRouteMock).toHaveBeenCalledWith({
        id: "route-1",
        name: "Updated ridge loop",
        description: null,
      }),
    );
    expect(invalidateRoutesMock).toHaveBeenCalledTimes(1);
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it("blocks an empty route name", async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId("route-edit-name-input"), "");

    await act(async () => {
      await fireEvent.press(screen.getByTestId("route-edit-submit-button"));
    });

    expect(await screen.findByText("Route name is required")).toBeTruthy();
    expect(updateRouteMock).not.toHaveBeenCalled();
  });

  it("does not expose editing controls to a non-owner deep link", async () => {
    authState.user.id = "profile-2";

    await renderScreen();

    expect(screen.getByText("Route cannot be edited")).toBeTruthy();
    expect(screen.queryByTestId("route-edit-submit-button")).toBeNull();
    expect(screen.queryByTestId("route-edit-name-input")).toBeNull();
    expect(updateRouteMock).not.toHaveBeenCalled();
  });
});
