import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { ProfileGroupsSection } from "../ProfileGroupsSection";

const navigateToMock = jest.fn();
const groupsState = {
  items: [] as unknown[],
  isError: false,
  isLoading: false,
  nextCursor: undefined as string | undefined,
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: mockCreateHost("View"),
}));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("@/components/groups/GroupCards", () => ({
  __esModule: true,
  GroupCard: mockCreateHost("GroupCard"),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    groups: {
      forProfile: {
        useQuery: () => ({
          data: { items: groupsState.items, nextCursor: groupsState.nextCursor },
          isError: groupsState.isError,
          isLoading: groupsState.isLoading,
        }),
      },
    },
  },
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

describe("ProfileGroupsSection", () => {
  beforeEach(() => {
    groupsState.items = [
      {
        access_level: "public",
        avatar_url: null,
        description: "Weekly rides",
        id: "group-1",
        join_policy: "open",
        name: "Sunday Riders",
        slug: "sunday-riders",
      },
    ];
    groupsState.isError = false;
    groupsState.isLoading = false;
    groupsState.nextCursor = undefined;
    navigateToMock.mockReset();
  });

  it("uses the canonical GroupCard compact variant and opens its detail", () => {
    renderNative(<ProfileGroupsSection profileId="profile-1" />);

    const card = screen.getByTestId("profile-groups-section-group-group-1");
    expect(card.props.variant).toBe("compact");
    fireEvent.press(card);
    expect(navigateToMock).toHaveBeenCalledWith({
      params: { groupId: "group-1" },
      pathname: "/group-detail",
    });
  });
});
