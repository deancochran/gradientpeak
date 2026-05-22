import React from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateToMock = jest.fn();
const clearSessionMock = jest.fn(async () => undefined);
const updateEmailMock = jest.fn(async () => undefined);
const updatePasswordMock = jest.fn(async () => undefined);
const deleteAccountMock = jest.fn(async () => undefined);
const alertMock = jest.fn();

const ButtonHost = createButtonComponent();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: (...args: any[]) => alertMock(...args) },
  Modal: createHost("Modal"),
  Pressable: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TextInput: ({ value, onChangeText, ...props }: any) =>
    React.createElement("TextInput", { value, onChangeText, ...props }),
  View: createHost("View"),
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: createHost("BottomSheet"),
  BottomSheetBackdrop: createHost("BottomSheetBackdrop"),
  BottomSheetView: createHost("BottomSheetView"),
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: createHost("Svg"),
  Circle: createHost("Circle"),
  Line: createHost("Line"),
  Path: createHost("Path"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  BarChart3: createHost("BarChart3"),
  CalendarDays: createHost("CalendarDays"),
  Flame: createHost("Flame"),
  Gauge: createHost("Gauge"),
  HeartPulse: createHost("HeartPulse"),
  Moon: createHost("Moon"),
  Scale: createHost("Scale"),
  Sparkles: createHost("Sparkles"),
  TrendingDown: createHost("TrendingDown"),
  TrendingUp: createHost("TrendingUp"),
  Users: createHost("Users"),
  X: createHost("X"),
  Zap: createHost("Zap"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ButtonHost,
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: ({ value, onChangeText, ...props }: any) =>
    React.createElement("TextInput", { value, onChangeText, ...props }),
}));

jest.mock("@repo/ui/components/settings-group", () => ({
  __esModule: true,
  SettingsGroup: ({ title, description, children, ...props }: any) =>
    React.createElement("View", props, [
      React.createElement("Text", { key: "title" }, title),
      React.createElement("Text", { key: "description" }, description),
      children,
    ]),
  SettingItem: ({ label, description, buttonLabel, onPress, children, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, [
      React.createElement("Text", { key: "label" }, label),
      React.createElement("Text", { key: "description" }, description),
      React.createElement("Text", { key: "buttonLabel" }, buttonLabel),
      children,
    ]),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: createHost("AppHeader"),
  CompactInsightCard: ({ title, value, onPress, children, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, [
      React.createElement("Text", { key: "title" }, title),
      React.createElement("Text", { key: "value" }, value),
      children,
    ]),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    profiles: {
      getPublicById: {
        useQuery: () => ({ data: { followers_count: 4, following_count: 9 } }),
      },
    },
    groups: {
      forProfile: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "group-1",
                name: "Morning Climbers",
                slug: "morning-climbers",
                description: "Hill repeats before work",
                avatar_url: null,
                cover_url: null,
                access_level: "public",
                join_policy: "open",
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
              },
            ],
            nextCursor: null,
          },
          isError: false,
          isLoading: false,
        }),
      },
    },
  },
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({
    user: { id: "user-1", email: "athlete@example.com" },
    profile: {
      username: "Athlete",
      avatar_url: null,
      is_public: true,
      followers_count: 0,
      following_count: 0,
    },
    updateEmail: updateEmailMock,
    updatePassword: updatePasswordMock,
    deleteAccount: deleteAccountMock,
    canUpdateEmail: true,
    updateEmailUnavailableReason: null,
  }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("@/lib/performance", () => ({
  __esModule: true,
  usePerformanceScreenReady: jest.fn(),
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (url: string) => url,
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: () => ({ clearSession: clearSessionMock }),
}));

const ProfileTabScreen = require("../profile").default;

describe("ProfileTabScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders metric surfaces without embedding analytics trends", () => {
    renderNative(<ProfileTabScreen />);

    expect(screen.queryByTestId("profile-trends-section")).toBeNull();
    expect(screen.queryByText("Analytics & Trends")).toBeNull();
    expect(screen.getByTestId("profile-tab-profile-metrics")).toBeTruthy();
    expect(screen.getByTestId("profile-tab-activity-efforts")).toBeTruthy();
  });

  it("routes content library entry points from the profile hub", () => {
    renderNative(<ProfileTabScreen />);

    expect(screen.queryByTestId("profile-tab-goals")).toBeNull();
    expect(screen.queryByTestId("profile-tab-scheduled-activities")).toBeNull();
    expect(screen.queryByTestId("profile-tab-training-preferences")).toBeNull();

    fireEvent.press(screen.getByTestId("profile-tab-activities"));
    fireEvent.press(screen.getByTestId("profile-tab-activity-plans"));
    fireEvent.press(screen.getByTestId("profile-tab-training-plans"));
    fireEvent.press(screen.getByTestId("profile-tab-routes"));

    expect(navigateToMock).toHaveBeenCalledWith("/activities-list");
    expect(navigateToMock).toHaveBeenCalledWith("/activity-plans-list");
    expect(navigateToMock).toHaveBeenCalledWith("/training-plans-list");
    expect(navigateToMock).toHaveBeenCalledWith("/routes-list");
  });

  it("keeps the active user's identity summary on profile settings", () => {
    renderNative(<ProfileTabScreen />);

    fireEvent.press(screen.getByTestId("profile-tab-summary-identity"));

    expect(navigateToMock).toHaveBeenCalledWith("/(internal)/(tabs)/profile");
  });

  it("shows groups the active profile belongs to", () => {
    renderNative(<ProfileTabScreen />);

    expect(screen.getByTestId("profile-tab-groups")).toBeTruthy();
    expect(screen.getByText("Morning Climbers")).toBeTruthy();
  });

  it("submits account email and password actions", async () => {
    renderNative(<ProfileTabScreen />);

    React.act(() => {
      fireEvent.press(screen.getByTestId("profile-tab-update-email"));
    });
    React.act(() => {
      fireEvent.changeText(screen.getByTestId("profile-tab-email-input"), "new@example.com");
    });
    await React.act(async () => {
      fireEvent.press(screen.getByTestId("profile-tab-email-submit-button"));
    });

    React.act(() => {
      fireEvent.press(screen.getByTestId("profile-tab-change-password"));
    });
    React.act(() => {
      fireEvent.changeText(screen.getByTestId("profile-tab-current-password-input"), "old-pass");
      fireEvent.changeText(screen.getByTestId("profile-tab-new-password-input"), "new-pass");
      fireEvent.changeText(screen.getByTestId("profile-tab-confirm-password-input"), "new-pass");
    });
    await React.act(async () => {
      fireEvent.press(screen.getByTestId("profile-tab-password-submit-button"));
    });

    expect(updateEmailMock).toHaveBeenCalledWith({ newEmail: "new@example.com" });
    expect(updatePasswordMock).toHaveBeenCalledWith({
      currentPassword: "old-pass",
      newPassword: "new-pass",
    });
  });
});
