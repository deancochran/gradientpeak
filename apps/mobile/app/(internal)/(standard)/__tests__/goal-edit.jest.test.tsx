import type { CanonicalGoalObjective, ProfileGoalRecord } from "@repo/core";
import { act } from "@testing-library/react-native";
import type React from "react";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const replaceMock = jest.fn();
const updateMock = jest.fn();
const invalidateMock = jest.fn();
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
let id = firstId;
let pathname = "/goal-edit";
jest.mock("expo-router/react-navigation", () => ({
  useIsFocused: () => pathname === "/goal-edit",
}));
const goal = (goalId = firstId, title = "Existing goal"): ProfileGoalRecord => ({
  id: goalId,
  profile_id: "33333333-3333-4333-8333-333333333333",
  target_date: "2030-10-20",
  title,
  priority: 5,
  activity_category: "run",
  target_payload: { type: "completion", distance_m: 10000 },
});
let data: ReturnType<typeof goal> | undefined = goal();
let queryError: (Error & { data?: { code: string } }) | null = null;
const refetchMock = jest.fn();
jest.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) =>
      options.headerRight?.() ?? null,
  },
  useLocalSearchParams: () => ({ id }),
  usePathname: () => pathname,
  useNavigation: () => ({
    dispatch: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    getState: () => ({ index: 0, routes: [] }),
  }),
  useRouter: () => ({ replace: replaceMock, back: jest.fn() }),
}));
jest.mock("@repo/api/react", () => ({
  invalidateGoalQueries: (...args: unknown[]) => invalidateMock(...args),
}));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({}),
    goals: {
      getById: {
        useQuery: () => ({
          data,
          isLoading: false,
          isError: Boolean(queryError),
          error: queryError,
          refetch: refetchMock,
        }),
      },
      update: { useMutation: () => ({ isPending: false, mutateAsync: updateMock }) },
    },
  },
}));
const GoalEditScreen = require("../goal-edit").default;

beforeEach(() => {
  id = firstId;
  pathname = "/goal-edit";
  data = goal();
  queryError = null;
  refetchMock.mockReset();
  updateMock.mockReset().mockResolvedValue({});
  replaceMock.mockReset();
  invalidateMock.mockReset().mockResolvedValue(undefined);
});

it.each([
  { type: "event_performance", activity_category: "run", distance_m: 42195, target_time_s: 14400 },
  { type: "completion", distance_m: 42195 },
  { type: "threshold", metric: "power", value: 250.125 },
  { type: "consistency", target_weeks: 6 },
] satisfies CanonicalGoalObjective[])("saves a title edit through the actual route and form without changing objective %#", async (objective) => {
  data = { ...goal(), target_payload: objective };
  await renderNative(<GoalEditScreen />);
  await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Renamed goal");
  await fireEvent.press(screen.getByText("Save"));
  await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
  expect(updateMock).toHaveBeenCalledWith({
    id: firstId,
    data: {
      title: "Renamed goal",
      target_date: data.target_date,
      priority: data.priority,
      activity_category: data.activity_category,
      target_payload: objective,
    },
  });
  expect(invalidateMock).toHaveBeenCalledTimes(1);
});

it.each([
  { objective: { type: "completion", distance_m: 42195.123 }, testId: "goal-duration" },
  {
    objective: { type: "threshold", metric: "power", value: 250.125 },
    testId: "goal-power-duration",
  },
] satisfies {
  objective: CanonicalGoalObjective;
  testId: string;
}[])("clears optional zero duration without invalidating a legacy goal %#", async ({
  objective,
  testId,
}) => {
  data = { ...goal(), target_payload: objective };
  await renderNative(<GoalEditScreen />);
  const label = screen.getByTestId(testId).props.accessibilityLabel;
  await fireEvent.press(screen.getByTestId(testId));
  await fireEvent(screen.getByLabelText(`${label} seconds`), "valueChange", 0);
  await fireEvent.press(screen.getByLabelText(`Done ${label}`));
  await fireEvent.press(screen.getByText("Save"));
  await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
  expect(updateMock.mock.calls[0]?.[0].data.target_payload).toStrictEqual(objective);
});

it("distinguishes an initial read failure from a missing goal and retries explicitly", async () => {
  data = undefined;
  queryError = new Error("Offline");
  const view = await renderNative(<GoalEditScreen />);
  expect(screen.getByText("Unable to load goal")).toBeTruthy();
  expect(screen.queryByText("Goal not found")).toBeNull();
  await fireEvent.press(screen.getByText("Try again"));
  expect(refetchMock).toHaveBeenCalledTimes(1);
  queryError = Object.assign(new Error("Missing"), { data: { code: "NOT_FOUND" } });
  await view.rerender(<GoalEditScreen />);
  expect(screen.getByText("Goal not found")).toBeTruthy();
});

it("preserves actual form edits during same-goal refresh and resets for a different goal", async () => {
  const view = await renderNative(<GoalEditScreen />);
  await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Local title");
  data = goal(firstId, "Server refresh");
  await view.rerender(<GoalEditScreen />);
  expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Local title");
  id = secondId;
  await view.rerender(<GoalEditScreen />);
  expect(screen.queryByTestId("goal-editor-title-input")).toBeNull();
  expect(screen.getByText("Loading goal...")).toBeTruthy();
  data = goal(secondId, "Second goal");
  await view.rerender(<GoalEditScreen />);
  expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Second goal");
});

it("discards unsaved edits on navigation away and loads the existing record on return", async () => {
  const view = await renderNative(<GoalEditScreen />);
  await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Not saved");
  pathname = "/profile";
  await view.rerender(<GoalEditScreen />);
  pathname = "/goal-edit";
  await view.rerender(<GoalEditScreen />);
  expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Existing goal");
  expect(data?.title).toBe("Existing goal");
  expect(updateMock).not.toHaveBeenCalled();
});

it("keeps failed goal edits with an announced retry error", async () => {
  updateMock.mockRejectedValueOnce(new Error("Goal save unavailable"));
  await renderNative(<GoalEditScreen />);
  await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Keep goal draft");
  await fireEvent.press(screen.getByText("Save"));
  await waitFor(() =>
    expect(screen.getByTestId("goal-submit-feedback").props.children).toBe("Goal save unavailable"),
  );
  expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Keep goal draft");
  expect(replaceMock).not.toHaveBeenCalled();
});

it("does not navigate a new goal when the old pending save completes", async () => {
  let resolve!: (value: object) => void;
  updateMock.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = await renderNative(<GoalEditScreen />);
  const save = screen.getByTestId("goal-edit-submit").props.onPress;
  await act(() => {
    void save();
  });
  await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
  id = secondId;
  data = goal(secondId, "Second goal");
  await view.rerender(<GoalEditScreen />);
  expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Second goal");
  await act(async () => resolve({}));
  expect(replaceMock).not.toHaveBeenCalled();
  expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Second goal");
});
