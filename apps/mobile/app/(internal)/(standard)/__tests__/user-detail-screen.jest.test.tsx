import React from "react";

import { ROUTES } from "@/lib/constants/routes";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const localSearchParamsMock = { userId: "11111111-1111-4111-8111-111111111111" };
const pushMock = jest.fn();
const replaceMock = jest.fn();
const authState = {
  user: { id: "11111111-1111-4111-8111-111111111111", email: "own@test.com" },
  profile: {
    id: "11111111-1111-4111-8111-111111111111",
    username: "Owner",
    avatar_url: null,
    dob: "1990-01-01",
    gender: null,
    preferred_units: "metric",
    language: "en",
    bio: "Own profile",
  },
};
const profileQueryState = {
  data: {
    id: "11111111-1111-4111-8111-111111111111",
    username: "Owner",
    avatar_url: null,
    bio: "Own profile",
    gender: null,
    preferred_units: "metric",
    language: "en",
  } as any,
  isLoading: false,
  error: null as any,
};
const themeState = {
  theme: "light",
  resolvedTheme: "light",
  setTheme: jest.fn(),
};

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: any) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useLocalSearchParams: () => localSearchParamsMock,
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@repo/ui/components/settings-group", () => ({
  __esModule: true,
  SettingsGroup: createHost("SettingsGroup"),
  SettingItem: createHost("SettingItem"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/input", () => ({ __esModule: true, Input: createHost("Input") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@repo/ui/components/toggle-group", () => {
  const React = require("react");

  return {
    __esModule: true,
    ToggleGroup: ({ children, onValueChange, ...props }: any) => {
      const { testId, ...restProps } = props;
      const enhancedChildren = React.Children.map(children, (child: any) => {
        if (!React.isValidElement(child)) {
          return child;
        }

        return React.cloneElement(child, {
          onPress: () => onValueChange?.(child.props.value),
        });
      });

      return React.createElement("ToggleGroup", { ...restProps, testID: testId }, enhancedChildren);
    },
    ToggleGroupItem: ({ testId, ...props }: any) =>
      React.createElement("ToggleGroupItem", { ...props, testID: testId }, props.children),
  };
});

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Check: createHost("Check"),
  UserPlus: createHost("UserPlus"),
  UserMinus: createHost("UserMinus"),
  Clock: createHost("Clock"),
  MessageCircle: createHost("MessageCircle"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: () => ({ clearSession: jest.fn() }),
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => themeState,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      profiles: { invalidate: jest.fn() },
    }),
    profiles: {
      getPublicById: { useQuery: () => profileQueryState },
    },
    social: {
      followUser: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      unfollowUser: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
    integrations: {
      list: { useQuery: () => ({ data: [{ provider: "strava" }] }) },
    },
    messaging: {
      getOrCreateDM: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
  },
}));

const UserDetailScreenWithErrorBoundary = require("../user/[userId]").default;

describe("user detail own vs other controls", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    themeState.theme = "light";
    themeState.resolvedTheme = "light";
    themeState.setTheme.mockReset();
  });

  it("shows own-only controls on own profile", () => {
    localSearchParamsMock.userId = authState.user.id;
    authState.profile.username = "Owner";
    profileQueryState.data.username = "Owner";

    renderNative(<UserDetailScreenWithErrorBoundary />);

    expect(screen.getByTestId("user-detail-edit-trigger")).toBeTruthy();
    expect(screen.getByTestId("account-section")).toBeTruthy();
    expect(screen.getByText("Your account")).toBeTruthy();
    expect(screen.getByText("Quick Links")).toBeTruthy();
    expect(screen.getByText("Manage Third-Party Integrations")).toBeTruthy();

    fireEvent.press(screen.getByTestId("my-training-plans"));
    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.LIST);
  });

  it("hides own-only controls on other user profile", () => {
    localSearchParamsMock.userId = "22222222-2222-4222-8222-222222222222";
    profileQueryState.data = {
      id: "22222222-2222-4222-8222-222222222222",
      username: "Other",
      avatar_url: null,
      bio: "Other profile",
      gender: null,
      preferred_units: null,
      language: null,
    };

    renderNative(<UserDetailScreenWithErrorBoundary />);

    expect(screen.queryByTestId("user-detail-edit-trigger")).toBeNull();
    expect(screen.queryByTestId("account-section")).toBeNull();
  });

  it("reflects resolved dark mode when the preference is system", () => {
    localSearchParamsMock.userId = authState.user.id;
    themeState.theme = "system" as any;
    themeState.resolvedTheme = "dark" as any;

    renderNative(<UserDetailScreenWithErrorBoundary />);

    expect(screen.getByTestId("dark-mode")).toBeTruthy();
    expect(screen.getByTestId("theme-option-system")).toBeTruthy();
    expect(screen.getByTestId("theme-option-light")).toBeTruthy();
    expect(screen.getByTestId("theme-option-dark")).toBeTruthy();
    expect(screen.getByText("System")).toBeTruthy();
    expect(screen.getByText("Light")).toBeTruthy();
    expect(screen.getByText("Dark")).toBeTruthy();
  });

  it("updates the theme preference when an option is selected", () => {
    localSearchParamsMock.userId = authState.user.id;

    renderNative(<UserDetailScreenWithErrorBoundary />);

    fireEvent.press(screen.getByTestId("theme-option-dark"));

    expect(themeState.setTheme).toHaveBeenCalledWith("dark");
  });
});
