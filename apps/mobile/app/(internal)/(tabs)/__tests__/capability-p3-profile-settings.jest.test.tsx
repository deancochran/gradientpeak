import React from "react";
import { createHost, createPressableHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateToMock = jest.fn();
const setThemeMock = jest.fn();
const Button = createPressableHost();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/button", () => ({ Button }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/components/form", () => ({
  Form: ({ children }: React.PropsWithChildren) => children,
  FormTextField: createHost("FormTextField"),
}));
jest.mock("@repo/ui/components/avatar", () => ({ Avatar: createHost("Avatar") }));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/settings-group", () => ({
  SettingsGroup: ({ children }: React.PropsWithChildren) => children,
  SettingItem: ({ label, onPress, onValueChange, value, testID }: Record<string, unknown>) =>
    React.createElement("Pressable", {
      accessibilityLabel: label,
      onPress: onPress ?? (() => (onValueChange as (next: boolean) => void)(value !== true)),
      testID,
    }),
}));
jest.mock("@/components/shared", () => ({ AppHeader: createHost("AppHeader") }));
jest.mock("@/components/profile/ProfileGroupsSection", () => ({
  ProfileGroupsSection: createHost("ProfileGroupsSection"),
}));
jest.mock("@/components/profile/ProfileSummaryCard", () => ({
  ProfileSummaryCard: ({ onEdit, onFollowersPress, onFollowingPress }: Record<string, unknown>) =>
    React.createElement("View", null, [
      React.createElement("Pressable", { key: "edit", onPress: onEdit, testID: "profile-edit" }),
      React.createElement("Pressable", {
        key: "followers",
        onPress: onFollowersPress,
        testID: "profile-followers",
      }),
      React.createElement("Pressable", {
        key: "following",
        onPress: onFollowingPress,
        testID: "profile-following",
      }),
    ]),
}));
jest.mock("@/lib/api", () => ({
  api: {
    profiles: {
      getPublicById: { useQuery: () => ({ data: { followers_count: 2, following_count: 3 } }) },
    },
  },
}));
jest.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "athlete@example.com" },
    profile: { username: "Athlete", avatar_url: null, is_public: true },
    canUpdateEmail: true,
    updateEmail: jest.fn(),
    updatePassword: jest.fn(),
  }),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({ useAppNavigate: () => navigateToMock }));
jest.mock("@/lib/performance", () => ({ usePerformanceScreenReady: jest.fn() }));
jest.mock("@/lib/stores/auth-store", () => ({ useAuthStore: () => ({ clearSession: jest.fn() }) }));
jest.mock("@/lib/stores/theme-store", () => ({
  useTheme: () => ({ resolvedTheme: "dark", setTheme: setThemeMock }),
}));
jest.mock("lucide-react-native", () => ({}));

const Profile = require("../profile").default;

describe("P3 profile and settings capabilities", () => {
  beforeEach(() => jest.clearAllMocks());

  it("opens profile editing and preserves the profile hub boundary", () => {
    renderNative(<Profile />);

    fireEvent.press(screen.getByTestId("profile-edit"));

    expect(navigateToMock).toHaveBeenCalledWith("/profile-edit");
  });

  it("opens the active profile's follower lists", () => {
    renderNative(<Profile />);

    fireEvent.press(screen.getByTestId("profile-followers"));
    fireEvent.press(screen.getByTestId("profile-following"));

    expect(navigateToMock).toHaveBeenCalledWith("/followers?userId=user-1");
    expect(navigateToMock).toHaveBeenCalledWith("/following?userId=user-1");
  });

  it("selects the light theme from the dark appearance", () => {
    renderNative(<Profile />);

    fireEvent.press(screen.getByTestId("profile-tab-dark-mode"));

    expect(setThemeMock).toHaveBeenCalledWith("light");
  });
});
