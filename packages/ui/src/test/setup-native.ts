import * as testingLibraryNative from "@testing-library/react-native/pure";
import React from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error;

beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const [firstArg] = args;

    if (typeof firstArg === "string" && firstArg.includes("react-test-renderer is deprecated")) {
      return;
    }

    originalConsoleError(...args);
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

jest.mock("react-native", () => require("./react-native"));

(globalThis as typeof globalThis & { __uiRntl?: typeof testingLibraryNative }).__uiRntl =
  testingLibraryNative;

afterEach(() => {
  testingLibraryNative.cleanup();
});

const createHost = (type: string) =>
  function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };

const createAnimationBuilder = () => ({
  delay: () => createAnimationBuilder(),
  duration: () => createAnimationBuilder(),
  withInitialValues: () => createAnimationBuilder(),
});

jest.mock("react-native-screens", () => ({
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
            getIsSelected(value: string | string[] | undefined, itemValue: string) {
              return Array.isArray(value) ? value.includes(itemValue) : value === itemValue;
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

jest.mock("@rn-primitives/accordion", () => createPrimitiveModule("@rn-primitives/accordion"));
jest.mock("@rn-primitives/alert-dialog", () =>
  createPrimitiveModule("@rn-primitives/alert-dialog"),
);
jest.mock("@rn-primitives/aspect-ratio", () =>
  createPrimitiveModule("@rn-primitives/aspect-ratio"),
);
jest.mock("@rn-primitives/avatar", () => createPrimitiveModule("@rn-primitives/avatar"));
jest.mock("@rn-primitives/checkbox", () => createPrimitiveModule("@rn-primitives/checkbox"));
jest.mock("@rn-primitives/collapsible", () => createPrimitiveModule("@rn-primitives/collapsible"));
jest.mock("@rn-primitives/context-menu", () =>
  createPrimitiveModule("@rn-primitives/context-menu"),
);
jest.mock("@rn-primitives/dialog", () => createPrimitiveModule("@rn-primitives/dialog"));
jest.mock("@rn-primitives/dropdown-menu", () =>
  createPrimitiveModule("@rn-primitives/dropdown-menu"),
);
jest.mock("@rn-primitives/hover-card", () => createPrimitiveModule("@rn-primitives/hover-card"));
jest.mock("@rn-primitives/label", () => createPrimitiveModule("@rn-primitives/label"));
jest.mock("@rn-primitives/menubar", () => createPrimitiveModule("@rn-primitives/menubar"));
jest.mock("@rn-primitives/popover", () => createPrimitiveModule("@rn-primitives/popover"));
jest.mock("@rn-primitives/portal", () => createPrimitiveModule("@rn-primitives/portal"));
jest.mock("@rn-primitives/progress", () => createPrimitiveModule("@rn-primitives/progress"));
jest.mock("@rn-primitives/radio-group", () => createPrimitiveModule("@rn-primitives/radio-group"));
jest.mock("@rn-primitives/select", () => createPrimitiveModule("@rn-primitives/select"));
jest.mock("@rn-primitives/separator", () => createPrimitiveModule("@rn-primitives/separator"));
jest.mock("@rn-primitives/switch", () => createPrimitiveModule("@rn-primitives/switch"));
jest.mock("@rn-primitives/tabs", () => createPrimitiveModule("@rn-primitives/tabs"));
jest.mock("@rn-primitives/toggle", () => createPrimitiveModule("@rn-primitives/toggle"));
jest.mock("@rn-primitives/toggle-group", () =>
  createPrimitiveModule("@rn-primitives/toggle-group"),
);
jest.mock("@rn-primitives/tooltip", () => createPrimitiveModule("@rn-primitives/tooltip"));

jest.mock("@react-native-community/slider", () => ({
  __esModule: true,
  default: createHost("Slider"),
}));

jest.mock("@react-native-community/datetimepicker", () => {
  const DateTimePicker = createHost("DateTimePicker");

  return {
    __esModule: true,
    default: DateTimePicker,
    DateTimePickerAndroid: {
      open: jest.fn(),
    },
  };
});

jest.mock("expo-document-picker", () => ({
  __esModule: true,
  getDocumentAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [
      {
        name: "mock-file.fit",
        size: 2048,
        mimeType: "application/octet-stream",
        uri: "file:///mock-file.fit",
      },
    ],
  }),
}));

jest.mock("@rn-primitives/slot", () => ({
  Text: createHost("Slot.Text"),
  View: createHost("Slot.View"),
}));

jest.mock("nativewind", () => ({
  styled: (Component: any) => Component,
}));

jest.mock(
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

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: createHost("Animated.View"),
  },
  Extrapolation: {
    CLAMP: "clamp",
  },
  FadeIn: createAnimationBuilder(),
  FadeInDown: createAnimationBuilder(),
  FadeInUp: createAnimationBuilder(),
  FadeOut: createAnimationBuilder(),
  FadeOutUp: createAnimationBuilder(),
  LayoutAnimationConfig: createHost("LayoutAnimationConfig"),
  LinearTransition: createAnimationBuilder(),
  interpolate: (_value: unknown, _input: unknown, output: [unknown, unknown]) => output[0],
  useAnimatedStyle: (callback: () => unknown) => callback(),
  useDerivedValue: (callback: () => unknown) => ({
    value: callback(),
  }),
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));
