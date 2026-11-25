import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const navigateMock = jest.fn();
let queryResult = {
  data: {
    items: [{ id: "33333333-3333-4333-8333-333333333333", title: "Morning run" }],
  },
  isError: false,
  isLoading: false,
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/shared/ActivityCard", () => ({
  __esModule: true,
  ActivityCard: createHost("ActivityCard"),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateMock,
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    feed: {
      getProfileActivities: {
        useQuery: () => queryResult,
      },
    },
  },
}));

const { ProfileActivitiesSection } = require("../ProfileActivitiesSection");

describe("ProfileActivitiesSection", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    queryResult = {
      data: {
        items: [{ id: "33333333-3333-4333-8333-333333333333", title: "Morning run" }],
      },
      isError: false,
      isLoading: false,
    };
  });

  it("renders the canonical activity card with the stable selector and opens its detail", async () => {
    await renderNative(
      <ProfileActivitiesSection profileId="22222222-2222-4222-8222-222222222222" />,
    );

    await fireEvent.press(
      screen.getByTestId("user-detail-activity-33333333-3333-4333-8333-333333333333"),
    );

    expect(navigateMock).toHaveBeenCalledWith(
      "/activity-detail?id=33333333-3333-4333-8333-333333333333",
    );
  });

  it("does not render an empty or unavailable activity section", async () => {
    queryResult = { data: { items: [] }, isError: false, isLoading: false };
    await renderNative(
      <ProfileActivitiesSection profileId="22222222-2222-4222-8222-222222222222" />,
    );

    expect(screen.queryByText("Recent activities")).toBeNull();
  });
});
