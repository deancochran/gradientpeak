import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import StandardLayout from "../_layout";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("expo-router", () => ({
  useRouter: () => ({
    back: vi.fn(),
  }),
  Stack: Object.assign(createHost("Stack"), {
    Screen: createHost("StackScreen"),
  }),
}));

vi.mock("react-native", () => ({
  TouchableOpacity: createHost("TouchableOpacity"),
}));

vi.mock("@/components/ui/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("lucide-react-native", () => ({
  ChevronLeft: createHost("ChevronLeft"),
}));

describe("standard layout user route declarations", () => {
  it("registers canonical user route and excludes settings route", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<StandardLayout />);
    });

    const routeNames = renderer.root
      .findAll((node: any) => node.type === "StackScreen")
      .map((node: any) => node.props.name as string);

    expect(routeNames).toContain("user/[userId]");
    expect(routeNames).not.toContain("settings");
    expect(routeNames).not.toContain("me");
  });
});
