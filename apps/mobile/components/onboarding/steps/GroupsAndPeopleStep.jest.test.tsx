import { act, fireEvent, render } from "@testing-library/react-native";
import { GroupsAndPeopleStep } from "./GroupsAndPeopleStep";

const mockGroupsQuery = jest.fn();
const mockPeopleQuery = jest.fn();

const queryResult = {
  data: { pages: [] },
  error: null,
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isError: false,
  isFetching: true,
  isFetchingNextPage: false,
  isLoading: false,
  refetch: jest.fn(),
};

jest.mock("@/lib/api", () => ({
  api: {
    groups: {
      listDiscoverable: { useInfiniteQuery: (...args: unknown[]) => mockGroupsQuery(...args) },
      myInvitations: { useInfiniteQuery: () => queryResult },
    },
    social: {
      searchUsers: { useInfiniteQuery: (...args: unknown[]) => mockPeopleQuery(...args) },
    },
  },
}));

jest.mock("@/components/groups/GroupCards", () => ({ GroupCard: () => null }));
jest.mock("@/components/profile/ProfileCard", () => ({ ProfileCard: () => null }));

describe("GroupsAndPeopleStep search", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGroupsQuery.mockImplementation(() => queryResult);
    mockPeopleQuery.mockImplementation(() => queryResult);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("keeps group and people search controlled, loading, clearable, and independently debounced", () => {
    const { getByLabelText, getByTestId } = render(
      <GroupsAndPeopleStep
        data={
          {
            selected_follow_profile_ids: [],
            selected_group_actions: [],
            selected_group_ids: [],
            selected_invitation_ids: [],
            social_action_statuses: {},
          } as never
        }
        updateData={jest.fn()}
      />,
    );

    expect(getByLabelText("Loading groups")).toBeTruthy();
    expect(getByLabelText("Loading people")).toBeTruthy();
    fireEvent(getByTestId("onboarding-groups-search"), "changeText", " runners ");
    fireEvent(getByTestId("onboarding-people-search"), "changeText", " alex ");

    expect(mockGroupsQuery).toHaveBeenLastCalledWith(
      { limit: 5, search: undefined },
      expect.any(Object),
    );
    expect(mockPeopleQuery).toHaveBeenLastCalledWith(
      { limit: 5, query: undefined },
      expect.any(Object),
    );

    act(() => jest.advanceTimersByTime(299));
    expect(mockGroupsQuery).toHaveBeenLastCalledWith(
      { limit: 5, search: undefined },
      expect.any(Object),
    );

    act(() => jest.advanceTimersByTime(1));
    expect(mockGroupsQuery).toHaveBeenLastCalledWith(
      { limit: 5, search: "runners" },
      expect.any(Object),
    );
    expect(mockPeopleQuery).toHaveBeenLastCalledWith(
      { limit: 5, query: "alex" },
      expect.any(Object),
    );

    fireEvent.press(getByTestId("onboarding-groups-search-clear"));
    expect(getByTestId("onboarding-groups-search").props.value).toBe("");
    expect(getByTestId("onboarding-people-search").props.value).toBe(" alex ");
  });
});
