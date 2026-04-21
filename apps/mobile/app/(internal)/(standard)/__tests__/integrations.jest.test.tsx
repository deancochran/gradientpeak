import React from "react";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const backMock = jest.fn();
const refetchMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  BackHandler: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ back: backMock }),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock("expo-linking", () => ({
  __esModule: true,
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  createURL: jest.fn(() => "gradientpeak-dev://integrations"),
}));

jest.mock("expo-web-browser", () => ({
  __esModule: true,
  openAuthSessionAsync: jest.fn(),
}));

jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: () => ({
    mutateAsync: jest.fn(async () => ({ url: "https://example.test" })),
    isPending: false,
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      integrations: {},
    }),
    integrations: {
      list: {
        useQuery: () => ({
          data: [{ provider: "strava" }],
          refetch: refetchMock,
          isLoading: false,
        }),
      },
      getAuthUrl: {
        useMutation: () => ({
          mutateAsync: jest.fn(async () => ({ url: "https://example.test" })),
        }),
      },
      disconnect: {
        useMutation: () => ({ mutateAsync: jest.fn(async () => undefined) }),
      },
    },
  },
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Check: createHost("Check"),
  ChevronLeft: createHost("ChevronLeft"),
  ChevronRight: createHost("ChevronRight"),
}));

const IntegrationsScreen = require("../integrations").default;

describe("integrations screen", () => {
  beforeEach(() => {
    backMock.mockReset();
    refetchMock.mockReset();
  });

  it("renders provider connections without historical import controls", () => {
    renderNative(<IntegrationsScreen />);

    expect(screen.getByTestId("integration-provider-strava")).toBeTruthy();
    expect(screen.queryByText("Import FIT Activity")).toBeNull();
    expect(
      screen.getByText("File imports now live with the relevant activity and route screens."),
    ).toBeTruthy();
  });

  it("navigates back from the custom header", () => {
    renderNative(<IntegrationsScreen />);

    fireEvent.press(screen.getByTestId("back-button"));
    expect(backMock).toHaveBeenCalled();
  });
});
