import type React from "react";
import { act } from "react";
import { Alert } from "react-native";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const backMock = jest.fn();
const invalidateRoutesMock = jest.fn();
const updateRouteMock = jest.fn();
const authState = { user: { id: "profile-1" } };
const dispatchMock = jest.fn();
const preventRemoveMock = jest.fn();
const refetchMock = jest.fn();
let routeId = "route-1";
let routeData:
  | { id: string; profile_id: string; name: string; description: string | null }
  | undefined;
let queryError: (Error & { data?: { code: string } }) | null = null;
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (...args: unknown[]) => preventRemoveMock(...args),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) =>
      options.headerRight?.() ?? null,
  },
  useLocalSearchParams: () => ({ id: routeId }),
  useNavigation: () => ({ dispatch: dispatchMock }),
  useRouter: () => ({ back: backMock }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ routes: { invalidate: invalidateRoutesMock } }),
    routes: {
      get: {
        useQuery: () => ({
          data: routeData,
          isError: Boolean(queryError),
          error: queryError,
          isLoading: false,
          refetch: refetchMock,
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
  const RouteEditScreen = require("../route-edit").default;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";
    backMock.mockReset();
    invalidateRoutesMock.mockReset().mockResolvedValue(undefined);
    updateRouteMock.mockReset().mockResolvedValue({ id: "route-1" });
    authState.user.id = "profile-1";
    routeId = "route-1";
    routeData = {
      id: routeId,
      profile_id: "profile-1",
      name: "Ridge loop",
      description: "Original notes",
    };
    queryError = null;
    dispatchMock.mockReset();
    preventRemoveMock.mockReset();
    refetchMock.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

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

  it("merges a same-route refresh into untouched fields while keeping dirty name and cleared description", async () => {
    const view = await renderScreen();
    await fireEvent.changeText(screen.getByTestId("route-edit-name-input"), "Local route");
    if (!routeData) throw new Error("Missing route fixture");
    routeData = { ...routeData, name: "Server route", description: "New server notes" };
    await view.rerender(<RouteEditScreen />);
    expect(screen.getByTestId("route-edit-name-input").props.value).toBe("Local route");
    expect(screen.getByTestId("route-edit-description-input").props.value).toBe("New server notes");
    await fireEvent.changeText(screen.getByTestId("route-edit-description-input"), "");
    routeData = { ...routeData, description: "Another refresh" };
    await view.rerender(<RouteEditScreen />);
    expect(screen.getByTestId("route-edit-description-input").props.value).toBe("");
    await fireEvent.press(screen.getByTestId("route-edit-submit-button"));
    expect(updateRouteMock).toHaveBeenCalledWith({
      id: "route-1",
      name: "Local route",
      description: null,
    });
  });

  it("keeps drafts on query error/retry and distinguishes a missing route", async () => {
    const view = await renderScreen();
    await fireEvent.changeText(screen.getByTestId("route-edit-name-input"), "Keep this route");
    queryError = new Error("Offline");
    await view.rerender(<RouteEditScreen />);
    expect(screen.queryByText("Route not found")).toBeNull();
    await fireEvent.press(screen.getByText("Retry route"));
    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("route-edit-name-input").props.value).toBe("Keep this route");
    queryError = null;
    await view.rerender(<RouteEditScreen />);
    expect(screen.getByTestId("route-edit-name-input").props.value).toBe("Keep this route");
    queryError = Object.assign(new Error("Missing"), { data: { code: "NOT_FOUND" } });
    await view.rerender(<RouteEditScreen />);
    expect(screen.getByText("Route not found")).toBeTruthy();
  });

  it("offers retry for an initial transport failure instead of rendering not found", async () => {
    routeData = undefined;
    queryError = new Error("Offline");
    await renderScreen();
    expect(screen.getByText("Unable to load route")).toBeTruthy();
    expect(screen.queryByText("Route not found")).toBeNull();
    await fireEvent.press(screen.getByText("Try again"));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    "success",
    "failure",
  ])("resets for a different route and ignores the old save's late %s", async (outcome) => {
    let resolve!: (value: { id: string }) => void;
    let reject!: (error: Error) => void;
    updateRouteMock.mockReturnValueOnce(
      new Promise((done, fail) => {
        resolve = done;
        reject = fail;
      }),
    );
    const view = await renderScreen();
    await fireEvent.changeText(screen.getByTestId("route-edit-name-input"), "Old draft");
    const submit = screen.getByTestId("route-edit-submit-button").props.onPress;
    await act(async () => {
      void submit();
      void submit();
    });
    expect(updateRouteMock).toHaveBeenCalledTimes(1);
    routeId = "route-2";
    routeData = { id: routeId, profile_id: "profile-1", name: "Second route", description: null };
    await view.rerender(<RouteEditScreen />);
    expect(screen.getByTestId("route-edit-name-input").props.value).toBe("Second route");
    await act(async () => {
      if (outcome === "success") resolve({ id: "route-1" });
      else reject(new Error("Old save failed"));
    });
    expect(backMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Old save failed")).toBeNull();
    expect(screen.getByTestId("route-edit-name-input").props.value).toBe("Second route");
  });

  it("retains a rejected draft and keeps owner Back cancellation behind the existing guard", async () => {
    updateRouteMock.mockRejectedValueOnce(new Error("Save unavailable"));
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId("route-edit-name-input"), "Keep route draft");
    await fireEvent.press(screen.getByTestId("route-edit-submit-button"));
    expect(screen.getByTestId("route-edit-root-error").props.children).toBe("Save unavailable");
    const [enabled, remove] = preventRemoveMock.mock.calls.at(-1) ?? [];
    expect(enabled).toBe(true);
    await act(() => remove({ data: { action: { type: "GO_BACK" } } }));
    const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    expect(buttons?.find((button) => button.text === "Keep editing")).toBeTruthy();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("route-edit-name-input").props.value).toBe("Keep route draft");
    await act(() => buttons?.find((button) => button.text === "Discard")?.onPress?.());
    expect(dispatchMock).toHaveBeenCalledWith({ type: "GO_BACK" });
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
