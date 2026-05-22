import { createHost as mockCreateHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";
import GroupEventDetailRoute from "../group-event-detail";

const detailVm = {
  event: null as any,
  isError: true,
  isLoading: false,
  refetch: jest.fn(),
  seriesOccurrences: [],
  seriesOccurrencesQuery: { isLoading: false },
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: mockCreateHost("ActivityIndicator"),
  Alert: { alert: jest.fn() },
  ScrollView: mockCreateHost("ScrollView"),
  View: mockCreateHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: mockCreateHost("StackScreen") },
  useLocalSearchParams: () => ({ groupEventId: "event-1" }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("@/components/groups", () => ({
  __esModule: true,
  GroupEventDetailScreen: mockCreateHost("GroupEventDetailScreen"),
}));

jest.mock("@/components/shared/detail", () => {
  const actual = jest.requireActual("@/components/shared/detail");
  return {
    __esModule: true,
    ...actual,
    DetailOverflowMenu: mockCreateHost("DetailOverflowMenu"),
  };
});

jest.mock("@/lib/groups", () => ({
  __esModule: true,
  useGroupDetailViewModel: () => ({ viewer: null }),
  useGroupEventActions: () => ({
    cancelMutation: { isPending: false },
    copySeriesActivityPlansToOccurrenceMutation: { isPending: false },
    rsvpEventSeriesMutation: { isPending: false },
    rsvpMutation: { isPending: false },
  }),
  useGroupEventDetailViewModel: () => detailVm,
}));

describe("GroupEventDetailRoute", () => {
  beforeEach(() => {
    detailVm.event = null;
    detailVm.isError = true;
    detailVm.isLoading = false;
  });

  it("does not render protected event details when the event is unavailable", () => {
    const rendered = renderNative(<GroupEventDetailRoute />);

    expect(screen.getByText("Unable to load event")).toBeTruthy();
    expect(screen.getByText("This group event may be unavailable.")).toBeTruthy();
    expect(() => (rendered as any).UNSAFE_getByType("GroupEventDetailScreen")).toThrow();
  });
});
