import { act, renderHook } from "@testing-library/react-native";
import { useCreationFlowActive } from "../useCreationFlowActive";

let mockPath = "/training-plan-create";
let mockFocused = true;
let mockDestination = {
  key: "creator",
  name: "training-plan-create",
  params: {} as Record<string, string>,
};
const mockListeners = new Map<string, (event: { target?: string }) => void>();
const mockNavigation = {
  getState: () => ({ index: 0, routes: [mockDestination] }),
  addListener: (name: string, callback: (event: { target?: string }) => void) => {
    mockListeners.set(name, callback);
    return () => mockListeners.delete(name);
  },
};
jest.mock("expo-router", () => ({
  usePathname: () => mockPath,
  useNavigation: () => mockNavigation,
}));
jest.mock("expo-router/react-navigation", () => ({ useIsFocused: () => mockFocused }));

beforeEach(() => {
  mockPath = "/training-plan-create";
  mockFocused = true;
  mockDestination = { key: "creator", name: "training-plan-create", params: {} };
  mockListeners.clear();
});

it("does not treat background-only blur or an explicitly owned picker as abandoning the flow", async () => {
  const exit = jest.fn();
  const hook = await renderHook(() =>
    useCreationFlowActive(["training-plan-create"], mockPath === "/goal-create", {
      isOwnedChild: (route) =>
        route.name === "goal-create" &&
        !!route.params &&
        "returnToTrainingPlanCreate" in route.params &&
        route.params.returnToTrainingPlanCreate === "1",
      onExit: exit,
    }),
  );
  const initial = hook.result.current;
  await act(() => mockListeners.get("blur")?.({ target: "creator" }));
  expect(initial.isCurrent()).toBe(true);
  mockDestination = {
    key: "picker",
    name: "goal-create",
    params: { returnToTrainingPlanCreate: "1" },
  };
  mockPath = "/goal-create";
  mockFocused = false;
  await act(() => mockListeners.get("blur")?.({ target: "creator" }));
  await hook.rerender({});
  expect(hook.result.current.active).toBe(true);
  expect(hook.result.current.key).toBe(initial.key);
  expect(exit).not.toHaveBeenCalled();
});

it("invalidates old callbacks on route exit even before a cached screen rerenders, and returns as a fresh instance", async () => {
  const exit = jest.fn();
  const hook = await renderHook(() =>
    useCreationFlowActive(["training-plan-create"], false, { onExit: exit }),
  );
  const old = hook.result.current;
  mockDestination = { key: "other", name: "profile", params: {} };
  await act(() => {
    mockListeners.get("blur")?.({ target: "creator" });
    expect(old.isCurrent()).toBe(false);
  });
  expect(exit).toHaveBeenCalledTimes(1);
  expect(hook.result.current.active).toBe(false);
  mockDestination = { key: "creator", name: "training-plan-create", params: {} };
  await act(() => mockListeners.get("focus")?.({ target: "creator" }));
  expect(hook.result.current.active).toBe(true);
  expect(hook.result.current.key).not.toBe(old.key);
  expect(old.isCurrent()).toBe(false);
});
