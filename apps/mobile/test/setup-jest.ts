import mockReact from "react";

import "@repo/ui/test/setup-native";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

globalThis.requestIdleCallback = jest.fn((callback: IdleRequestCallback) => {
  callback({
    didTimeout: false,
    timeRemaining: () => 50,
  });
  return 0;
});
globalThis.cancelIdleCallback = jest.fn();

type HostProps = Record<string, unknown> & { children?: mockReact.ReactNode };
type CartesianChartProps = Record<string, unknown> & {
  children?: mockReact.ReactNode | ((context: Record<string, unknown>) => mockReact.ReactNode);
  data?: Record<string, unknown>[];
};
type BottomSheetFlatListMockProps<Item = unknown> = Record<string, unknown> & {
  data?: Item[];
  keyExtractor?: (item: Item, index: number) => mockReact.Key;
  ListEmptyComponent?: mockReact.ComponentType | mockReact.ReactNode;
  ListFooterComponent?: mockReact.ComponentType | mockReact.ReactNode;
  ListHeaderComponent?: mockReact.ComponentType | mockReact.ReactNode;
  renderItem: (info: { item: Item; index: number }) => mockReact.ReactNode;
};

const mockRenderHostChildren = (type: string, children: mockReact.ReactNode) => {
  if (type === "Text") return children;

  return mockReact.Children.map(children, (child) =>
    typeof child === "string" || typeof child === "number"
      ? mockReact.createElement("Text", null, String(child))
      : child,
  );
};

const mockCreateHost = (type: string) =>
  function HostComponent({ children, ...props }: HostProps) {
    return mockReact.createElement(type, props, mockRenderHostChildren(type, children));
  };

const mockCreateLeafHost = (type: string) =>
  function LeafHostComponent(props: Record<string, unknown>) {
    return mockReact.createElement(type, props);
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

jest.mock("expo-file-system", () => ({
  __esModule: true,
  File: class MockExpoFile {
    uri: string;
    name: string;
    size = 0;

    constructor(uri: string) {
      this.uri = uri;
      this.name = uri.split("/").pop() ?? "mock-file.fit";
    }

    arrayBuffer = jest.fn(async () => new ArrayBuffer(0));
    bytes = jest.fn(async () => new Uint8Array());
  },
  Paths: { cache: "file:///cache" },
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(async () => ({ exists: true, isDirectory: false, size: 0 })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ""),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-image-picker", () => ({
  __esModule: true,
  MediaTypeOptions: { Images: "Images" },
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
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

jest.mock("@sentry/react-native", () => ({
  __esModule: true,
  init: jest.fn(),
  wrap: <Component>(component: Component) => component,
}));

jest.mock("react-native-gesture-handler", () => ({
  __esModule: true,
  GestureHandlerRootView: mockCreateHost("GestureHandlerRootView"),
  ScrollView: mockCreateHost("GestureHandlerScrollView"),
}));

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: mockCreateHost("MapView"),
  Marker: mockCreateHost("Marker"),
  Polyline: mockCreateLeafHost("Polyline"),
  PROVIDER_DEFAULT: "default",
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: ({
    children,
    footerComponent: FooterComponent,
    ...props
  }: HostProps & {
    footerComponent?: mockReact.ComponentType<Record<string, unknown>>;
  }) =>
    mockReact.createElement(
      "BottomSheet",
      props,
      children,
      FooterComponent
        ? mockReact.createElement(FooterComponent, { animatedFooterPosition: 0 })
        : null,
    ),
  BottomSheetBackdrop: mockCreateLeafHost("BottomSheetBackdrop"),
  BottomSheetFlatList: ({
    data = [],
    keyExtractor,
    ListEmptyComponent,
    ListFooterComponent,
    ListHeaderComponent,
    renderItem,
    ...props
  }: BottomSheetFlatListMockProps) =>
    mockReact.createElement(
      "BottomSheetFlatList",
      props,
      typeof ListHeaderComponent === "function"
        ? mockReact.createElement(ListHeaderComponent)
        : ListHeaderComponent,
      data.length === 0
        ? typeof ListEmptyComponent === "function"
          ? mockReact.createElement(ListEmptyComponent)
          : ListEmptyComponent
        : data.map((item, index) =>
            mockReact.createElement(
              mockReact.Fragment,
              { key: keyExtractor ? keyExtractor(item, index) : index },
              renderItem({ item, index }),
            ),
          ),
      typeof ListFooterComponent === "function"
        ? mockReact.createElement(ListFooterComponent)
        : ListFooterComponent,
    ),
  BottomSheetFooter: mockCreateHost("BottomSheetFooter"),
  BottomSheetScrollView: mockCreateHost("BottomSheetScrollView"),
  BottomSheetView: mockCreateHost("BottomSheetView"),
}));

jest.mock("@better-auth/expo", () => ({
  __esModule: true,
  expo: jest.fn(() => ({})),
}));

jest.mock("@better-auth/expo/client", () => ({
  __esModule: true,
  expoClient: jest.fn(() => ({
    id: "expo",
    version: "test",
    getActions: jest.fn(() => ({ getCookie: jest.fn(async () => "") })),
    fetchPlugins: [],
  })),
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
  SafeAreaProvider: mockCreateHost("SafeAreaProvider"),
  SafeAreaView: mockCreateHost("SafeAreaView"),
}));

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  initialWindowMetrics: {
    frame: { height: 844, width: 390, x: 0, y: 0 },
    insets: { bottom: 0, left: 0, right: 0, top: 0 },
  },
  SafeAreaConsumer: ({ children }: { children: (insets: unknown) => unknown }) =>
    children({ bottom: 0, left: 0, right: 0, top: 0 }),
  SafeAreaProvider: mockCreateHost("SafeAreaProvider"),
  SafeAreaView: mockCreateHost("SafeAreaView"),
  useSafeAreaFrame: () => ({ height: 844, width: 390, x: 0, y: 0 }),
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
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
  Canvas: mockCreateHost("Canvas"),
  Circle: mockCreateLeafHost("Circle"),
  DashPathEffect: mockCreateLeafHost("DashPathEffect"),
  Group: mockCreateHost("Group"),
  LinearGradient: mockCreateLeafHost("LinearGradient"),
  Line: mockCreateLeafHost("SkiaLine"),
  Path: mockCreateLeafHost("Path"),
  Rect: mockCreateLeafHost("Rect"),
  Skia: {
    Path: { Make: () => ({ lineTo: jest.fn(), moveTo: jest.fn() }) },
  },
  Text: mockCreateLeafHost("SkiaText"),
  useFont: jest.fn(() => ({ getTextWidth: () => 24 })),
  vec: jest.fn((x: number, y: number) => ({ x, y })),
}));

jest.mock("victory-native", () => ({
  __esModule: true,
  Area: mockCreateLeafHost("Area"),
  Bar: mockCreateLeafHost("Bar"),
  CartesianChart: ({ children, data = [] }: CartesianChartProps) => {
    const pointSeries = (key: string) =>
      data.map((datum, index) => ({
        x: index,
        y: typeof datum[key] === "number" ? Number(datum[key]) : null,
        yValue: typeof datum[key] === "number" ? Number(datum[key]) : null,
      }));

    return mockReact.createElement(
      "CartesianChart",
      { data },
      typeof children === "function"
        ? children({
            chartBounds: { bottom: 100, left: 0, right: 100, top: 0 },
            points: {
              actual: data,
              actualFitness: pointSeries("actualFitness"),
              actualFatigue: pointSeries("actualFatigue"),
              completedLoad: pointSeries("completedLoad"),
              fitness: pointSeries("fitness"),
              form: pointSeries("form"),
              goal: data,
              planned: data,
              plannedLoad: pointSeries("plannedLoad"),
              projection: data,
              projectedFitness: pointSeries("projectedFitness"),
              projectedFatigue: pointSeries("projectedFatigue"),
              recommendedFitness: pointSeries("recommendedFitness"),
              scheduledFitness: pointSeries("scheduledFitness"),
              targetFitness: pointSeries("targetFitness"),
              targetLoad: pointSeries("targetLoad"),
              value: data,
            },
          })
        : children,
    );
  },
  Line: mockCreateLeafHost("Line"),
  Scatter: mockCreateLeafHost("Scatter"),
  useChartPressState: jest.fn(() => ({
    isActive: false,
    state: {
      isActive: { value: false },
      matchedIndex: { value: -1 },
      x: { position: { value: 0 }, value: { value: 0 } },
      y: { targetLoad: { position: { value: 0 }, value: { value: 0 } } },
      yIndex: { value: 0 },
    },
  })),
}));

jest.mock("react-native-svg", () => {
  const MockSvg = mockCreateHost("svg");
  const MockCircle = mockCreateHost("circle");

  return {
    __esModule: true,
    default: MockSvg,
    Circle: MockCircle,
  };
});

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  const assertValidKey = (key: string) => {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) {
      throw new Error(
        'Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".',
      );
    }
  };

  return {
    getItemAsync: jest.fn(async (key: string) => {
      assertValidKey(key);
      return store.get(key) ?? null;
    }),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      assertValidKey(key);
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      assertValidKey(key);
      store.delete(key);
    }),
    __store: store,
  };
});

jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();

  return {
    __esModule: true,
    default: {
      clear: jest.fn(async () => {
        store.clear();
      }),
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    },
  };
});
