import { act } from "@testing-library/react-native";
import type React from "react";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const replaceMock = jest.fn();
const updateMock = jest.fn();
const invalidateMock = jest.fn();
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
let id = firstId;
const goal = (goalId = firstId, title = "Existing goal") => ({
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
  useNavigation: () => ({ dispatch: jest.fn() }),
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
  data = goal();
  queryError = null;
  refetchMock.mockReset();
  updateMock.mockReset().mockResolvedValue({});
  replaceMock.mockReset();
  invalidateMock.mockReset().mockResolvedValue(undefined);
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
