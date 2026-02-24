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

describe("standard layout training-plan route declarations", () => {
  it("keeps canonical routes and excludes deprecated legacy entries", () => {
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

    const routeNames = entries.map((entry) => entry.name);

    expect(routeNames).toEqual(
      expect.arrayContaining([
        "training-plan",
        "training-plan-create",
        "training-plan-edit",
        "training-plan-settings",
      ]),
    );

    expect(entries).toContainEqual(
      expect.objectContaining({
        name: "training-plan-edit",
        title: "Edit Training Plan",
      }),
    );

    expect(routeNames).not.toEqual(
      expect.arrayContaining([
        "training-plan-adjust",
        "training-plan-method-selector",
        "training-plan-wizard",
        "training-plan-review",
        "training-plans-list",
      ]),
    );
  });
});
