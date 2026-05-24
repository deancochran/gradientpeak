import React from "react";

import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

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
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/input", () => ({ __esModule: true, Input: createHost("Input") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Check: createHost("Check"),
  Ellipsis: createHost("Ellipsis"),
  UserPlus: createHost("UserPlus"),
  UserMinus: createHost("UserMinus"),
  Clock: createHost("Clock"),
  MessageCircle: createHost("MessageCircle"),
  Users: createHost("Users"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (url: string) => url,
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
    groups: {
      forProfile: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "group-1",
                name: "Public Paceline",
                slug: "public-paceline",
                description: "Open weekly rides",
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
  });

  it("redirects own profile detail requests to profile settings", () => {
    localSearchParamsMock.userId = authState.user.id;
    authState.profile.username = "Owner";
    profileQueryState.data.username = "Owner";

    renderNative(<UserDetailScreenWithErrorBoundary />);

    expect(replaceMock).toHaveBeenCalledWith("/(internal)/(tabs)/profile");
    expect(screen.getByText("Opening profile settings...")).toBeTruthy();
    expect(screen.queryByTestId("user-detail-options-trigger")).toBeNull();
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

    expect(screen.queryByTestId("user-detail-options-trigger")).toBeNull();
    expect(screen.queryByTestId("account-section")).toBeNull();
    expect(screen.getByText("Public Paceline")).toBeTruthy();
  });

  it("hides private profile details and graph navigation until access is accepted", () => {
    localSearchParamsMock.userId = "33333333-3333-4333-8333-333333333333";
    profileQueryState.data = {
      id: "33333333-3333-4333-8333-333333333333",
      username: "Private Athlete",
      avatar_url: null,
      bio: "Do not leak this bio",
      dob: "1988-06-01",
      followers_count: 12,
      following_count: 8,
      follow_status: "pending",
      gender: "female",
      is_public: false,
      language: "en",
      preferred_units: "imperial",
    };

    renderNative(<UserDetailScreenWithErrorBoundary />);

    expect(screen.getByText("This account is private")).toBeTruthy();
    expect(screen.getByTestId("user-detail-requested-button")).toBeTruthy();
    expect(screen.queryByText("Do not leak this bio")).toBeNull();
    expect(screen.queryByText("Age")).toBeNull();
    expect(screen.getByTestId("user-detail-summary-followers").props.disabled).toBe(true);
    expect(screen.getByTestId("user-detail-summary-following").props.disabled).toBe(true);
  });

  it("shows private profile details after follow access is accepted", () => {
    localSearchParamsMock.userId = "44444444-4444-4444-8444-444444444444";
    profileQueryState.data = {
      id: "44444444-4444-4444-8444-444444444444",
      username: "Accepted Athlete",
      avatar_url: null,
      bio: "Visible after access",
      dob: "1988-06-01",
      followers_count: 12,
      following_count: 8,
      follow_status: "accepted",
      gender: "female",
      is_public: false,
      language: "en",
      preferred_units: "imperial",
    };

    renderNative(<UserDetailScreenWithErrorBoundary />);

    expect(screen.queryByText("This account is private")).toBeNull();
    expect(screen.getByText("Visible after access")).toBeTruthy();
    expect(screen.getByText("Gender")).toBeTruthy();
    expect(screen.getByTestId("user-detail-summary-followers").props.disabled).toBe(false);
    expect(screen.getByTestId("user-detail-summary-following").props.disabled).toBe(false);
  });
});
