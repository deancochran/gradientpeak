import * as testingLibraryNative from "@testing-library/react-native/pure";
import mockReact from "react";

type HostProps = Record<string, unknown> & { children?: mockReact.ReactNode };

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("react-native", () => require("./react-native"));

(globalThis as typeof globalThis & { __uiRntl?: typeof testingLibraryNative }).__uiRntl =
  testingLibraryNative;

afterEach(async () => {
  await testingLibraryNative.cleanup();
});

const mockCreateHost = (type: string) =>
  function MockComponent(props: HostProps) {
    const children =
      type === "Text"
        ? props.children
        : mockReact.Children.map(props.children, (child) =>
            typeof child === "string" || typeof child === "number"
              ? mockReact.createElement("Text", null, String(child))
              : child,
          );

    return mockReact.createElement(type, props, children);
  };

const mockCreateAnimationBuilder = () => ({
  delay: () => mockCreateAnimationBuilder(),
  duration: () => mockCreateAnimationBuilder(),
  withInitialValues: () => mockCreateAnimationBuilder(),
});

jest.mock("react-native-screens", () => ({
  FullWindowOverlay: mockCreateHost("FullWindowOverlay"),
}));

function mockCreatePrimitiveModule(moduleName: string) {
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

        return mockCreateHost(`${moduleName}.${String(property)}`);
      },
    },
  );
}

jest.mock("@rn-primitives/accordion", () => mockCreatePrimitiveModule("@rn-primitives/accordion"));
jest.mock("@rn-primitives/alert-dialog", () =>
  mockCreatePrimitiveModule("@rn-primitives/alert-dialog"),
);
jest.mock("@rn-primitives/aspect-ratio", () =>
  mockCreatePrimitiveModule("@rn-primitives/aspect-ratio"),
);
jest.mock("@rn-primitives/avatar", () => mockCreatePrimitiveModule("@rn-primitives/avatar"));
jest.mock("@rn-primitives/checkbox", () => mockCreatePrimitiveModule("@rn-primitives/checkbox"));
jest.mock("@rn-primitives/collapsible", () =>
  mockCreatePrimitiveModule("@rn-primitives/collapsible"),
);
jest.mock("@rn-primitives/context-menu", () =>
  mockCreatePrimitiveModule("@rn-primitives/context-menu"),
);
jest.mock("@rn-primitives/dialog", () => mockCreatePrimitiveModule("@rn-primitives/dialog"));
jest.mock("@rn-primitives/dropdown-menu", () =>
  mockCreatePrimitiveModule("@rn-primitives/dropdown-menu"),
);
jest.mock("@rn-primitives/hover-card", () =>
  mockCreatePrimitiveModule("@rn-primitives/hover-card"),
);
jest.mock("@rn-primitives/label", () => mockCreatePrimitiveModule("@rn-primitives/label"));
jest.mock("@rn-primitives/menubar", () => mockCreatePrimitiveModule("@rn-primitives/menubar"));
jest.mock("@rn-primitives/popover", () => mockCreatePrimitiveModule("@rn-primitives/popover"));
jest.mock("@rn-primitives/portal", () => mockCreatePrimitiveModule("@rn-primitives/portal"));
jest.mock("@rn-primitives/radio-group", () =>
  mockCreatePrimitiveModule("@rn-primitives/radio-group"),
);
jest.mock("@rn-primitives/select", () => mockCreatePrimitiveModule("@rn-primitives/select"));
jest.mock("@rn-primitives/separator", () => mockCreatePrimitiveModule("@rn-primitives/separator"));
jest.mock("@rn-primitives/switch", () => mockCreatePrimitiveModule("@rn-primitives/switch"));
jest.mock("@rn-primitives/tabs", () => mockCreatePrimitiveModule("@rn-primitives/tabs"));
jest.mock("@rn-primitives/toggle", () => mockCreatePrimitiveModule("@rn-primitives/toggle"));
jest.mock("@rn-primitives/toggle-group", () =>
  mockCreatePrimitiveModule("@rn-primitives/toggle-group"),
);
jest.mock("@rn-primitives/tooltip", () => mockCreatePrimitiveModule("@rn-primitives/tooltip"));

jest.mock("@react-native-community/slider", () => ({
  __esModule: true,
  default: mockCreateHost("Slider"),
}));

jest.mock("@react-native-community/datetimepicker", () => {
  const DateTimePicker = mockCreateHost("DateTimePicker");

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
  Text: mockCreateHost("Slot.Text"),
  View: mockCreateHost("Slot.View"),
}));

jest.mock("nativewind", () => ({
  styled: <T>(Component: T) => Component,
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

          return mockCreateHost(`Lucide.${String(property)}`);
        },
      },
    ),
);

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    ScrollView: mockCreateHost("Animated.ScrollView"),
    View: mockCreateHost("Animated.View"),
  },
  Extrapolation: {
    CLAMP: "clamp",
  },
  FadeIn: mockCreateAnimationBuilder(),
  FadeInDown: mockCreateAnimationBuilder(),
  FadeInUp: mockCreateAnimationBuilder(),
  FadeOut: mockCreateAnimationBuilder(),
  FadeOutUp: mockCreateAnimationBuilder(),
  LayoutAnimationConfig: mockCreateHost("LayoutAnimationConfig"),
  LinearTransition: mockCreateAnimationBuilder(),
  interpolate: (_value: unknown, _input: unknown, output: [unknown, unknown]) => output[0],
  runOnJS: <Args extends unknown[], Return>(callback: (...args: Args) => Return) => callback,
  scrollTo: jest.fn(),
  useAnimatedReaction: jest.fn(),
  useAnimatedRef: () => ({ current: null }),
  useAnimatedStyle: (callback: () => unknown) => callback(),
  useAnimatedScrollHandler: (handler: unknown) => handler,
  useDerivedValue: (callback: () => unknown) => ({
    value: callback(),
  }),
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));
