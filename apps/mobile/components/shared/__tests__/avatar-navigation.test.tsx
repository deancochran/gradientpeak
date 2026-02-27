import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ActivityHeader } from "@/components/activity/shared/ActivityHeader";
import { AppHeader } from "../AppHeader";

const { pushMock, authState } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  authState: {
    user: { id: "11111111-1111-4111-8111-111111111111", email: "own@test.com" },
    profile: {
      username: "Owner",
      avatar_url: null,
    },
  },
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("react-native", () => ({
  TouchableOpacity: createHost("TouchableOpacity"),
  Pressable: createHost("Pressable"),
  View: createHost("View"),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

vi.mock("@/components/ui/text", () => ({ Text: createHost("Text") }));
vi.mock("@/components/ui/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: createHost("Icon") }));
vi.mock("@/components/ui/input", () => ({ Input: createHost("Input") }));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: createHost("Textarea"),
}));

vi.mock("lucide-react-native", () => {
  const Icon = createHost("LucideIcon");
  return {
    Activity: Icon,
    Bike: Icon,
    Dumbbell: Icon,
    Footprints: Icon,
    Waves: Icon,
  };
});

describe("avatar profile navigation", () => {
  it("routes app header avatar to canonical own user route", () => {
    pushMock.mockReset();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<AppHeader />);
    });

    const avatarTouch = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        typeof node.props.onPress === "function",
    );

    act(() => {
      avatarTouch.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/user/[userId]",
      params: { userId: authState.user.id },
    });
  });

  it("routes activity avatar taps to target user route", () => {
    pushMock.mockReset();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <ActivityHeader
          user={{
            id: "22222222-2222-4222-8222-222222222222",
            username: "Other",
            avatarUrl: null,
          }}
          activity={{
            type: "run",
            name: "Morning Run",
            startedAt: "2026-01-01T10:00:00.000Z",
          }}
        />,
      );
    });

    const pressables = renderer.root.findAll(
      (node: any) =>
        node.type === "Pressable" && typeof node.props.onPress === "function",
    );

    act(() => {
      pressables[0].props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/user/[userId]",
      params: { userId: "22222222-2222-4222-8222-222222222222" },
    });
  });
});
