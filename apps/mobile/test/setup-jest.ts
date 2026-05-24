import React from "react";

import "@repo/ui/test/setup-native";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

type HostProps = Record<string, unknown> & { children?: React.ReactNode };
type CartesianChartProps = Record<string, unknown> & {
  children?: React.ReactNode | ((context: Record<string, unknown>) => React.ReactNode);
  data?: unknown;
};

const createHost = (type: string) =>
  function HostComponent({ children, ...props }: HostProps) {
    return React.createElement(type, props, children);
  };

const createLeafHost = (type: string) =>
  function LeafHostComponent(props: Record<string, unknown>) {
    return React.createElement(type, props);
  };

process.env.EXPO_PUBLIC_API_URL ??= "http://localhost:3000";
process.env.EXPO_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      scheme: "gradientpeak-dev",
      extra: {
        redirectUri: "gradientpeak-dev://integrations",
      },
    },
  },
}));

jest.mock("expo-linking", () => ({
  __esModule: true,
  createURL: jest.fn((path = "") => `gradientpeak-dev://${String(path).replace(/^\//, "")}`),
}));

jest.mock(
  "app.config",
  () => ({
    __esModule: true,
    getDynamicAppConfig: jest.fn(() => ({ scheme: "gradientpeak-dev" })),
  }),
  { virtual: true },
);

jest.mock("expo-haptics", () => ({
  __esModule: true,
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock("react-native-gesture-handler", () => ({
  __esModule: true,
  GestureHandlerRootView: createHost("GestureHandlerRootView"),
}));

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: createHost("MapView"),
  Marker: createHost("Marker"),
  Polyline: createLeafHost("Polyline"),
  PROVIDER_DEFAULT: "default",
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: createHost("BottomSheet"),
  BottomSheetBackdrop: createLeafHost("BottomSheetBackdrop"),
  BottomSheetScrollView: createHost("BottomSheetScrollView"),
  BottomSheetView: createHost("BottomSheetView"),
}));

jest.mock("@better-auth/expo", () => ({
  __esModule: true,
  expo: jest.fn(() => ({})),
}));

jest.mock("@better-auth/expo/client", () => ({
  __esModule: true,
  expoClient: jest.fn(() => ({})),
}));

jest.mock("better-auth/react", () => ({
  __esModule: true,
  createAuthClient: jest.fn(() => ({
    getSession: jest.fn(async () => ({ data: null, error: null })),
    signIn: { email: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
    useSession: jest.fn(() => ({ data: null, error: null, isPending: false })),
  })),
}));

jest.mock("better-auth", () => ({
  __esModule: true,
  betterAuth: jest.fn(() => ({})),
}));

jest.mock("@better-auth/drizzle-adapter", () => ({
  __esModule: true,
  drizzleAdapter: jest.fn(() => ({})),
}));

jest.mock("better-auth/tanstack-start", () => ({
  __esModule: true,
  tanstackStartCookies: jest.fn(() => ({})),
}));

jest.mock("nativewind", () => ({
  __esModule: true,
  vars: jest.fn((value: unknown) => value),
  VariableContextProvider: ({ children }: Pick<HostProps, "children">) => children,
}));

jest.mock("react-native-css/native", () => ({
  __esModule: true,
  colorScheme: {
    get: jest.fn(() => "light"),
    set: jest.fn(),
    subscribe: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock("react-native-css/components/react-native-safe-area-context", () => ({
  __esModule: true,
  SafeAreaProvider: createHost("SafeAreaProvider"),
  SafeAreaView: createHost("SafeAreaView"),
}));

jest.mock("@garmin/fitsdk", () => ({
  __esModule: true,
  Decoder: class MockDecoder {
    static isFIT() {
      return true;
    }

    checkIntegrity() {
      return true;
    }

    read() {
      return { errors: [], messages: {} };
    }
  },
  Encoder: class MockEncoder {
    writeMesg() {}

    close() {
      return new Uint8Array();
    }
  },
  Profile: { MesgNum: {}, types: { mesgNum: {} } },
  Stream: class MockStream {
    read() {
      return new Uint8Array();
    }

    static fromArrayBuffer() {
      return new MockStream();
    }

    static fromBuffer() {
      return new MockStream();
    }

    static fromByteArray() {
      return new MockStream();
    }
  },
  Utils: {
    convertDateTimeToDate: jest.fn((timestamp: number) => new Date(timestamp * 1000)),
    convertDateToDateTime: jest.fn((date: Date) => Math.floor(date.getTime() / 1000)),
  },
}));

jest.mock("@shopify/react-native-skia", () => ({
  __esModule: true,
  Canvas: createHost("Canvas"),
  Circle: createLeafHost("Circle"),
  DashPathEffect: createLeafHost("DashPathEffect"),
  Group: createHost("Group"),
  LinearGradient: createLeafHost("LinearGradient"),
  Line: createLeafHost("SkiaLine"),
  Path: createLeafHost("Path"),
  Rect: createLeafHost("Rect"),
  Skia: {
    Path: { Make: () => ({ lineTo: jest.fn(), moveTo: jest.fn() }) },
  },
  Text: createLeafHost("SkiaText"),
  useFont: jest.fn(() => ({ getTextWidth: () => 24 })),
  vec: jest.fn((x: number, y: number) => ({ x, y })),
}));

jest.mock("victory-native", () => ({
  __esModule: true,
  Area: createLeafHost("Area"),
  Bar: createLeafHost("Bar"),
  CartesianChart: ({ children, data }: CartesianChartProps) =>
    React.createElement(
      "CartesianChart",
      { data },
      typeof children === "function"
        ? children({
            chartBounds: { bottom: 100, left: 0, right: 100, top: 0 },
            points: {
              actual: data,
              goal: data,
              planned: data,
              projection: data,
              value: data,
            },
          })
        : children,
    ),
  Line: createLeafHost("Line"),
  Scatter: createLeafHost("Scatter"),
  useChartPressState: jest.fn(() => ({ isActive: false, state: {} })),
}));

jest.mock("react-native-svg", () => {
  const MockSvg = createHost("svg");
  const MockCircle = createHost("circle");

  return {
    __esModule: true,
    default: MockSvg,
    Circle: MockCircle,
  };
});

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();

  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});
