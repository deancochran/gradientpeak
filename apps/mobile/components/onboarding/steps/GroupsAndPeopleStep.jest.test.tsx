import { act, fireEvent, render } from "@testing-library/react-native";
import { INITIAL_ONBOARDING_DATA } from "../onboarding-data";
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

jest.mock("@/components/groups/GroupCards", () => ({
  GroupCard: (props: Record<string, unknown>) => {
    const React = jest.requireActual("react");
    return React.createElement("GroupCard", props);
  },
}));
jest.mock("@/components/profile/ProfileCard", () => ({
  ProfileCard: (props: Record<string, unknown>) => {
    const React = jest.requireActual("react");
    return React.createElement("ProfileCard", props);
  },
}));

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

  it("keeps group and people search controlled, loading, clearable, and independently debounced", async () => {
    const { getByLabelText, getByTestId } = await render(
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
    await fireEvent(getByTestId("onboarding-groups-search"), "changeText", " runners ");
    await fireEvent(getByTestId("onboarding-people-search"), "changeText", " alex ");

    expect(mockGroupsQuery).toHaveBeenLastCalledWith(
      { limit: 5, search: undefined },
      expect.any(Object),
    );
    expect(mockPeopleQuery).toHaveBeenLastCalledWith(
      { limit: 5, query: undefined },
      expect.any(Object),
    );

    await act(() => jest.advanceTimersByTime(299));
    expect(mockGroupsQuery).toHaveBeenLastCalledWith(
      { limit: 5, search: undefined },
      expect.any(Object),
    );

    await act(() => jest.advanceTimersByTime(1));
    expect(mockGroupsQuery).toHaveBeenLastCalledWith(
      { limit: 5, search: "runners" },
      expect.any(Object),
    );
    expect(mockPeopleQuery).toHaveBeenLastCalledWith(
      { limit: 5, query: "alex" },
      expect.any(Object),
    );

    await fireEvent.press(getByTestId("onboarding-groups-search-clear"));
    expect(getByTestId("onboarding-groups-search").props.value).toBe("");
    expect(getByTestId("onboarding-people-search").props.value).toBe(" alex ");
  });

  it("onboarding.select-people-and-groups records follow and group membership actions", async () => {
    mockGroupsQuery.mockReturnValue({
      ...queryResult,
      data: {
        pages: [
          {
            items: [
              {
                id: "group-1",
                name: "Morning Runners",
                viewer: { canJoin: true, canRequestToJoin: false },
              },
            ],
          },
        ],
      },
      isFetching: false,
    });
    mockPeopleQuery.mockReturnValue({
      ...queryResult,
      data: {
        pages: [
          {
            users: [
              {
                id: "profile-1",
                follow_status: null,
                username: "alex",
              },
            ],
          },
        ],
      },
      isFetching: false,
    });
    const updateData = jest.fn();

    const { getByTestId } = await render(
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
        updateData={updateData}
      />,
    );

    await fireEvent.press(getByTestId("onboarding-group-group-1"));
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        selected_group_actions: [expect.objectContaining({ action: "join", group_id: "group-1" })],
        selected_group_ids: ["group-1"],
      }),
    );

    await fireEvent.press(getByTestId("onboarding-profile-profile-1"));
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        selected_follow_profile_ids: ["profile-1"],
        social_action_statuses: expect.objectContaining({ "follow:profile-1": "pending" }),
      }),
    );
  });

  it("keeps selected canonical cards through query failure and retry, but clears cached cards on account change", async () => {
    const selectedGroup = {
      id: "group-1",
      name: "Morning Runners",
      viewer: { canJoin: true, canRequestToJoin: false },
    };
    const { rerender, getByTestId, queryByTestId } = await render(
      <GroupsAndPeopleStep
        accountIdentity="account-a"
        data={
          {
            selected_follow_profile_ids: [],
            selected_group_actions: [
              { action: "join", action_key: "group:group-1", group_id: "group-1" },
            ],
            selected_group_ids: ["group-1"],
            selected_invitation_ids: [],
            social_action_statuses: {},
          } as never
        }
        updateData={jest.fn()}
      />,
    );
    mockGroupsQuery.mockReturnValue({
      ...queryResult,
      data: { pages: [{ items: [selectedGroup] }] },
      isFetching: false,
    });
    await rerender(
      <GroupsAndPeopleStep
        accountIdentity="account-a"
        data={
          {
            selected_follow_profile_ids: [],
            selected_group_actions: [
              { action: "join", action_key: "group:group-1", group_id: "group-1" },
            ],
            selected_group_ids: ["group-1"],
            selected_invitation_ids: [],
            social_action_statuses: {},
          } as never
        }
        updateData={jest.fn()}
      />,
    );
    expect(getByTestId("onboarding-group-group-1")).toBeTruthy();

    mockGroupsQuery.mockReturnValue({
      ...queryResult,
      data: { pages: [] },
      isError: true,
      isFetching: false,
      isLoading: false,
    });
    await rerender(
      <GroupsAndPeopleStep
        accountIdentity="account-a"
        data={
          {
            selected_follow_profile_ids: [],
            selected_group_actions: [
              { action: "join", action_key: "group:group-1", group_id: "group-1" },
            ],
            selected_group_ids: ["group-1"],
            selected_invitation_ids: [],
            social_action_statuses: {},
          } as never
        }
        updateData={jest.fn()}
      />,
    );
    expect(getByTestId("onboarding-groups-error")).toBeTruthy();
    expect(getByTestId("onboarding-group-group-1")).toBeTruthy();
    expect(queryByTestId("onboarding-groups-empty")).toBeNull();
    await fireEvent.press(getByTestId("onboarding-groups-retry"));
    expect(queryResult.refetch).toHaveBeenCalledTimes(1);

    await rerender(
      <GroupsAndPeopleStep
        accountIdentity="account-b"
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
    expect(queryByTestId("onboarding-group-group-1")).toBeNull();
  });

  it("retains selected people and search through refresh, error, and retry, then clears local state for the next account", async () => {
    const person = { id: "person-1", username: "runner", follow_status: null };
    mockPeopleQuery.mockReturnValue({ ...queryResult, data: { pages: [{ users: [person] }] } });
    const data = { ...INITIAL_ONBOARDING_DATA, selected_follow_profile_ids: ["person-1"] };
    const updateData = jest.fn();
    const view = await render(
      <GroupsAndPeopleStep accountIdentity="a" data={data} updateData={updateData} />,
    );
    await fireEvent.changeText(view.getByTestId("onboarding-people-search"), "runner draft");
    mockPeopleQuery.mockReturnValue({
      ...queryResult,
      data: { pages: [] },
      isError: true,
      isFetching: false,
    });
    await view.rerender(
      <GroupsAndPeopleStep accountIdentity="a" data={data} updateData={updateData} />,
    );
    expect(view.getByTestId("onboarding-profile-person-1").props.selected).toBe(true);
    expect(view.getByTestId("onboarding-people-search").props.value).toBe("runner draft");
    expect(view.queryByTestId("onboarding-people-empty")).toBeNull();
    await fireEvent.press(view.getByTestId("onboarding-people-retry"));
    expect(queryResult.refetch).toHaveBeenCalledTimes(1);
    mockPeopleQuery.mockReturnValue({ ...queryResult, data: { pages: [] }, isFetching: false });
    await view.rerender(
      <GroupsAndPeopleStep accountIdentity="a" data={data} updateData={updateData} />,
    );
    expect(view.getByTestId("onboarding-profile-person-1").props.selected).toBe(true);
    expect(updateData).not.toHaveBeenCalled();
    await view.rerender(
      <GroupsAndPeopleStep
        accountIdentity="b"
        data={{ ...data, selected_follow_profile_ids: [] }}
        updateData={updateData}
      />,
    );
    expect(view.queryByTestId("onboarding-profile-person-1")).toBeNull();
    expect(view.getByTestId("onboarding-people-search").props.value).toBe("");
  });
});
