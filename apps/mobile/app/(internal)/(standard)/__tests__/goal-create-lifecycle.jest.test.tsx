import { act, fireEvent, renderNative, screen } from "../../../../test/render-native";

let pathname = "/goal-create";
const write = jest.fn();
const replace = jest.fn();
const profileId = "11111111-1111-4111-8111-111111111111";
jest.mock("expo-router/react-navigation", () => ({
  useIsFocused: () => pathname === "/goal-create",
}));
jest.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) =>
      options.headerRight?.() ?? null,
  },
  usePathname: () => pathname,
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
    getState: () => ({ index: 0, routes: [] }),
  }),
  // Old whole-form route parameters must not seed a fresh creator.
  useLocalSearchParams: () => ({ seedFormData: JSON.stringify({ title: "Old saved draft" }) }),
  useRouter: () => ({ replace, back: jest.fn() }),
}));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: (select: (state: { user: { id: string }; profile: { id: string } }) => unknown) =>
    select({ user: { id: profileId }, profile: { id: profileId } }),
}));
jest.mock("@repo/api/react", () => ({ invalidateGoalQueries: jest.fn() }));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({}),
    goals: {
      create: {
        useMutation: (options: {
          onSuccess: (result: unknown, input: unknown) => Promise<void>;
        }) => ({
          isPending: false,
          mutateAsync: async (input: unknown) => {
            const result = await write(input);
            await options.onSuccess(result, input);
            return result;
          },
        }),
      },
    },
  },
}));
const GoalCreateScreen = require("../goal-create").default;

beforeEach(() => {
  pathname = "/goal-create";
  write.mockReset();
  replace.mockReset();
});

it("starts fresh after leaving, but keeps ordinary input across an in-flow rerender", async () => {
  const view = await renderNative(<GoalCreateScreen />);
  expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("");
  await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "Unfinished goal");
  await view.rerender(<GoalCreateScreen />);
  expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("Unfinished goal");
  pathname = "/profile";
  await view.rerender(<GoalCreateScreen />);
  expect(screen.queryByTestId("goal-editor-title-input")).toBeNull();
  pathname = "/goal-create";
  await view.rerender(<GoalCreateScreen />);
  expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("");
  expect(write).not.toHaveBeenCalled();
});

it("allows exit while saving and never navigates the next form on the late result", async () => {
  let finish!: (value: object) => void;
  write.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = await renderNative(<GoalCreateScreen />);
  await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "First goal");
  const durationLabel = screen.getByTestId("goal-duration").props.accessibilityLabel;
  await fireEvent.press(screen.getByTestId("goal-duration"));
  await fireEvent(screen.getByTestId("goal-duration-minutes"), "valueChange", 30);
  await fireEvent.press(screen.getByLabelText(`Done ${durationLabel}`));
  await fireEvent.press(screen.getByTestId("goal-target-date"));
  await fireEvent.press(screen.getByText("Done"));
  await act(() => {
    void screen.getByTestId("goal-create-submit").props.onPress();
  });
  expect(write).toHaveBeenCalledTimes(1);
  pathname = "/profile";
  await view.rerender(<GoalCreateScreen />);
  pathname = "/goal-create";
  await view.rerender(<GoalCreateScreen />);
  await fireEvent.changeText(screen.getByTestId("goal-editor-title-input"), "New form");
  await act(async () =>
    finish({ id: "33333333-3333-4333-8333-333333333333", ...write.mock.calls[0]?.[0] }),
  );
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByTestId("goal-editor-title-input").props.value).toBe("New form");
});
