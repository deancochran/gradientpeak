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

vi.mock("@repo/ui/components/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("lucide-react-native", () => ({
  ChevronLeft: createHost("ChevronLeft"),
}));

describe("standard layout plan detail routes", () => {
  it("declares event, goal, preferences, and training plan list screens", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<StandardLayout />);
    });

    const entries = renderer.root
      .findAll((node: any) => node.type === "StackScreen")
      .map((node: any) => ({
        name: node.props.name as string,
        title: node.props.options?.title as string | undefined,
      }));

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "event-detail",
          title: "Event Details",
        }),
        expect.objectContaining({ name: "goal-detail", title: "Goal Details" }),
        expect.objectContaining({
          name: "training-preferences",
          title: "Training Preferences",
        }),
        expect.objectContaining({
          name: "training-plans-list",
          title: "Training Plans",
        }),
      ]),
    );
  });
});
