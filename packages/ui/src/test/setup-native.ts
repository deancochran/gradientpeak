import React from "react";
import { afterEach } from "vitest";
import { vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const reactNativeMock = await import("./react-native");
vi.mock("react-native", () => reactNativeMock);
const testingLibraryNative = await import("@testing-library/react-native/pure");

(
  globalThis as typeof globalThis & { __uiRntl?: typeof testingLibraryNative }
).__uiRntl = testingLibraryNative;

afterEach(async () => {
  await testingLibraryNative.cleanup();
});

const createHost = (type: string) =>
  function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };

const createAnimationBuilder = () => ({
  delay: () => createAnimationBuilder(),
  duration: () => createAnimationBuilder(),
});

vi.mock("react-native-screens", () => ({
  FullWindowOverlay: createHost("FullWindowOverlay"),
}));

function createPrimitiveModule(moduleName: string) {
  return new Proxy(
    { __esModule: true },
    {
      get(_target, property) {
        if (property === "__esModule") {
          return true;
        }

        if (property === "utils") {
          return {
            getIsSelected(
              value: string | string[] | undefined,
              itemValue: string,
            ) {
              return Array.isArray(value)
                ? value.includes(itemValue)
                : value === itemValue;
            },
          };
        }

        if (property === "useItemContext") {
          return () => ({ isExpanded: true });
        }

        if (property === "useMenuContext") {
          return () => ({ value: "mock-item" });
        }

        if (property === "useRootContext") {
          return () => ({ open: true, value: "mock-value" });
        }

        if (property === "useSubContext") {
          return () => ({ open: true });
        }

        return createHost(`${moduleName}.${String(property)}`);
      },
    },
  );
}

vi.mock("@rn-primitives/accordion", () =>
  createPrimitiveModule("@rn-primitives/accordion"),
);
vi.mock("@rn-primitives/alert-dialog", () =>
  createPrimitiveModule("@rn-primitives/alert-dialog"),
);
vi.mock("@rn-primitives/aspect-ratio", () =>
  createPrimitiveModule("@rn-primitives/aspect-ratio"),
);
vi.mock("@rn-primitives/avatar", () =>
  createPrimitiveModule("@rn-primitives/avatar"),
);
vi.mock("@rn-primitives/checkbox", () =>
  createPrimitiveModule("@rn-primitives/checkbox"),
);
vi.mock("@rn-primitives/collapsible", () =>
  createPrimitiveModule("@rn-primitives/collapsible"),
);
vi.mock("@rn-primitives/context-menu", () =>
  createPrimitiveModule("@rn-primitives/context-menu"),
);
vi.mock("@rn-primitives/dialog", () =>
  createPrimitiveModule("@rn-primitives/dialog"),
);
vi.mock("@rn-primitives/dropdown-menu", () =>
  createPrimitiveModule("@rn-primitives/dropdown-menu"),
);
vi.mock("@rn-primitives/hover-card", () =>
  createPrimitiveModule("@rn-primitives/hover-card"),
);
vi.mock("@rn-primitives/label", () =>
  createPrimitiveModule("@rn-primitives/label"),
);
vi.mock("@rn-primitives/menubar", () =>
  createPrimitiveModule("@rn-primitives/menubar"),
);
vi.mock("@rn-primitives/popover", () =>
  createPrimitiveModule("@rn-primitives/popover"),
);
vi.mock("@rn-primitives/portal", () =>
  createPrimitiveModule("@rn-primitives/portal"),
);
vi.mock("@rn-primitives/progress", () =>
  createPrimitiveModule("@rn-primitives/progress"),
);
vi.mock("@rn-primitives/radio-group", () =>
  createPrimitiveModule("@rn-primitives/radio-group"),
);
vi.mock("@rn-primitives/select", () =>
  createPrimitiveModule("@rn-primitives/select"),
);
vi.mock("@rn-primitives/separator", () =>
  createPrimitiveModule("@rn-primitives/separator"),
);
vi.mock("@rn-primitives/switch", () =>
  createPrimitiveModule("@rn-primitives/switch"),
);
vi.mock("@rn-primitives/tabs", () =>
  createPrimitiveModule("@rn-primitives/tabs"),
);
vi.mock("@rn-primitives/toggle", () =>
  createPrimitiveModule("@rn-primitives/toggle"),
);
vi.mock("@rn-primitives/toggle-group", () =>
  createPrimitiveModule("@rn-primitives/toggle-group"),
);
vi.mock("@rn-primitives/tooltip", () =>
  createPrimitiveModule("@rn-primitives/tooltip"),
);

vi.mock("@react-native-community/slider", () => ({
  __esModule: true,
  default: createHost("Slider"),
}));

vi.mock("@rn-primitives/slot", () => ({
  Text: createHost("Slot.Text"),
}));

vi.mock("nativewind", () => ({
  styled: (Component: any) => Component,
}));

vi.mock(
  "lucide-react-native",
  () =>
    new Proxy(
      { __esModule: true },
      {
        get(_target, property) {
          if (property === "__esModule") {
            return true;
          }

          return createHost(`Lucide.${String(property)}`);
        },
      },
    ),
);

vi.mock("react-native-reanimated", () => ({
  default: {
    View: createHost("Animated.View"),
  },
  Extrapolation: {
    CLAMP: "clamp",
  },
  FadeIn: createAnimationBuilder(),
  FadeOut: createAnimationBuilder(),
  FadeOutUp: createAnimationBuilder(),
  LayoutAnimationConfig: createHost("LayoutAnimationConfig"),
  LinearTransition: createAnimationBuilder(),
  interpolate: (_value: unknown, _input: unknown, output: [unknown, unknown]) =>
    output[0],
  useAnimatedStyle: (callback: () => unknown) => callback(),
  useDerivedValue: (callback: () => unknown) => ({
    value: callback(),
  }),
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));
