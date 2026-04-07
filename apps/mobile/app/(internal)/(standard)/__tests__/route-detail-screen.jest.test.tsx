import React from "react";
import { createButtonComponent } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

const routeData = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "River Loop",
  activity_category: "outdoor_run",
  total_distance: 10200,
  total_ascent: 180,
  total_descent: 175,
  created_at: "2026-03-01T00:00:00.000Z",
  description: "Flat start, climb home.",
  polyline: "encoded",
  has_liked: false,
};

const backMock = jest.fn();
const deleteMutateMock = jest.fn();
const toggleLikeMutateMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => ({ id: routeData.id }),
  useRouter: () => ({ back: backMock }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  Alert: { alert: jest.fn() },
}));

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: createHost("MapView"),
  Marker: createHost("Marker"),
  Polyline: createHost("Polyline"),
  PROVIDER_DEFAULT: "default",
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createButtonComponent(),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: () => ({
    mutate: deleteMutateMock,
    isPending: false,
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ routes: {} }),
    routes: {
      get: {
        useQuery: () => ({ data: routeData, isLoading: false }),
      },
      delete: {},
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: toggleLikeMutateMock }),
      },
    },
  },
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  decodePolyline: () => [
    { latitude: 40.0, longitude: -75.0 },
    { latitude: 40.1, longitude: -75.1 },
  ],
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Calendar: createHost("Calendar"),
  Heart: createHost("Heart"),
  MapPin: createHost("MapPin"),
  Trash2: createHost("Trash2"),
  TrendingDown: createHost("TrendingDown"),
  TrendingUp: createHost("TrendingUp"),
}));

const RouteDetailScreen = require("../route-detail").default;

describe("route detail screen", () => {
  beforeEach(() => {
    backMock.mockReset();
    deleteMutateMock.mockReset();
    toggleLikeMutateMock.mockReset();
  });

  it("shows the new summary chips and route management copy", () => {
    renderNative(<RouteDetailScreen />);

    expect(screen.getByText("River Loop")).toBeTruthy();
    expect(screen.getAllByText("10.20 km").length).toBeGreaterThan(0);
    expect(screen.getByText("180m climb")).toBeTruthy();
    expect(screen.getAllByText(/Uploaded/).length).toBeGreaterThan(0);
    expect(screen.getByText("Route management")).toBeTruthy();
    expect(screen.queryByText("Use in Activity Plan")).toBeNull();
  });

  it("keeps the delete action inside the route management section", () => {
    renderNative(<RouteDetailScreen />);

    expect(screen.getByText("Delete Route")).toBeTruthy();
  });
});
