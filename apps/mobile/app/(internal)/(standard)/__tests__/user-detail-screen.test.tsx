import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import UserDetailScreenWithErrorBoundary from "../user/[userId]";

const {
  localSearchParamsMock,
  pushMock,
  replaceMock,
  authState,
  profileQueryState,
} = vi.hoisted(() => ({
  localSearchParamsMock: { userId: "11111111-1111-4111-8111-111111111111" },
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  authState: {
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
  },
  profileQueryState: {
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
  },
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useLocalSearchParams: () => localSearchParamsMock,
}));

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

vi.mock("@/components/settings", () => ({
  SettingsGroup: createHost("SettingsGroup"),
  SettingItem: createHost("SettingItem"),
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

vi.mock("@/components/ui/button", () => ({ Button: createHost("Button") }));
vi.mock("@/components/ui/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: createHost("Icon") }));
vi.mock("@/components/ui/input", () => ({ Input: createHost("Input") }));
vi.mock("@/components/ui/text", () => ({ Text: createHost("Text") }));

vi.mock("lucide-react-native", () => ({ Edit3: createHost("Edit3") }));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: () => ({ clearSession: vi.fn() }),
}));

vi.mock("@/lib/stores/theme-store", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      profiles: { invalidate: vi.fn() },
      auth: { getUser: { invalidate: vi.fn() } },
    }),
    profiles: {
      getPublicById: {
        useQuery: () => profileQueryState,
      },
    },
    auth: {
      signOut: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      deleteAccount: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updateEmail: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updatePassword: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

describe("user detail own vs other controls", () => {
  it("shows own-only controls on own profile", () => {
    localSearchParamsMock.userId = authState.user.id;
    authState.profile.username = "Owner";
    profileQueryState.data.username = "Owner";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<UserDetailScreenWithErrorBoundary />);
    });

    const ownEdit = renderer.root.findAll(
      (node: any) => node.props?.testID === "edit-profile-action",
    );
    const accountSections = renderer.root.findAll(
      (node: any) => node.props?.testID === "account-section",
    );

    expect(ownEdit.length).toBeGreaterThan(0);
    expect(accountSections.length).toBeGreaterThan(0);
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

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<UserDetailScreenWithErrorBoundary />);
    });

    const ownEdit = renderer.root.findAll(
      (node: any) => node.props?.testID === "edit-profile-action",
    );
    const accountSections = renderer.root.findAll(
      (node: any) => node.props?.testID === "account-section",
    );

    expect(ownEdit.length).toBe(0);
    expect(accountSections.length).toBe(0);
  });
});
