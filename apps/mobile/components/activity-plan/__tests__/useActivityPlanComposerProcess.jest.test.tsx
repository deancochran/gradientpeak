import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useActivityPlanComposerProcess } from "../useActivityPlanComposerProcess";

const preventRemoveMock = jest.fn<
  void,
  [
    boolean,
    (event: {
      data: {
        action: {
          type: string;
        };
      };
    }) => void,
  ]
>();
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (...args: Parameters<typeof preventRemoveMock>) => preventRemoveMock(...args),
}));
jest.mock("expo-router", () => ({ useNavigation: () => ({ dispatch: jest.fn() }) }));
const structure = { version: 5, activity_category: "run", items: [] };
describe("useActivityPlanComposerProcess", () => {
  it("blocks Back while a save is pending and retains the draft after its failure", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const navigation = {
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
    };
    const allowNavigationRef = { current: false };
    await renderHook(() =>
      useActivityPlanComposerProcess({
        activityCategory: "run",
        allowNavigationRef,
        description: "",
        isEditMode: false,
        isEditBlocked: false,
        hydrationVersion: 0,
        isLoading: false,
        isSubmitting: true,
        name: "Plan",
        navigation,
        structure,
        submit: jest.fn(),
        onAttempt: jest.fn(),
      }),
    );
    const [, preventRemoval] = preventRemoveMock.mock.calls.at(-1) ?? [];
    expect(preventRemoveMock).toHaveBeenCalledWith(true, expect.any(Function));
    await act(() => preventRemoval?.({ data: { action: { type: "GO_BACK" } } }));
    expect(alert).toHaveBeenCalledWith("Saving changes", expect.any(String));
    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(navigation.setOptions.mock.calls[0]?.[0].headerRight().props.disabled).toBe(true);
    alert.mockRestore();
  });
  it("keeps Save available for an invalid draft so one attempt can reveal recovery guidance", async () => {
    const navigation = {
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
    };
    const submit = jest.fn();
    const onAttempt = jest.fn();
    await renderHook(() =>
      useActivityPlanComposerProcess({
        activityCategory: "",
        allowNavigationRef: { current: false },
        description: "",
        isEditMode: false,
        isEditBlocked: false,
        hydrationVersion: 0,
        isLoading: false,
        isSubmitting: false,
        name: "",
        navigation,
        structure,
        submit,
        onAttempt,
      }),
    );
    const save = navigation.setOptions.mock.calls[0]?.[0].headerRight();
    expect(save.props.disabled).toBe(false);
    await act(() => save.props.onPress());
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("keeps header options stable while invoking the latest submit callback", async () => {
    const navigation = {
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
    };
    const initialSubmit = jest.fn();
    const latestSubmit = jest.fn();
    const allowNavigationRef = { current: false };
    let submit = initialSubmit;
    const { rerender } = await renderHook(() =>
      useActivityPlanComposerProcess({
        activityCategory: "run",
        allowNavigationRef,
        description: "",
        isEditMode: false,
        isEditBlocked: false,
        hydrationVersion: 0,
        isLoading: false,
        isSubmitting: false,
        name: "Morning Run",
        navigation,
        structure,
        submit,
        onAttempt: jest.fn(),
      }),
    );
    expect(navigation.setOptions).toHaveBeenCalledTimes(1);
    submit = latestSubmit;
    await rerender({});
    expect(navigation.setOptions).toHaveBeenCalledTimes(1);
    const options = navigation.setOptions.mock.calls[0]?.[0];
    const headerButton = options?.headerRight();
    await act(() => {
      headerButton.props.onPress();
    });
    expect(initialSubmit).not.toHaveBeenCalled();
    expect(latestSubmit).toHaveBeenCalledTimes(1);
  });
  it.each([
    false,
    true,
  ])("replays successful %s navigation without retaining the composer", async (isEditMode) => {
    const navigation = {
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
    };
    const allowNavigationRef = { current: false };
    let name = "Original plan";
    const { rerender } = await renderHook(() =>
      useActivityPlanComposerProcess({
        activityCategory: "run",
        allowNavigationRef,
        description: "",
        isEditMode,
        isEditBlocked: false,
        hydrationVersion: 0,
        isLoading: false,
        isSubmitting: false,
        name,
        navigation,
        structure,
        submit: jest.fn(),
        onAttempt: jest.fn(),
      }),
    );
    name = "Saved plan";
    await rerender({});
    allowNavigationRef.current = true;
    const [, preventRemoval] = preventRemoveMock.mock.calls.at(-1) ?? [];
    const action = { type: "GO_BACK" };
    await act(() => preventRemoval?.({ data: { action } }));
    expect(navigation.dispatch).toHaveBeenCalledWith(action);
  });
  it("removes the Save header action for a blocked edit route", async () => {
    const navigation = {
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
    };
    await renderHook(() =>
      useActivityPlanComposerProcess({
        activityCategory: "run",
        allowNavigationRef: { current: false },
        description: "",
        isEditMode: true,
        isEditBlocked: true,
        hydrationVersion: 0,
        isLoading: false,
        isSubmitting: false,
        name: "Legacy",
        navigation,
        structure,
        submit: jest.fn(),
        onAttempt: jest.fn(),
      }),
    );
    expect(navigation.setOptions.mock.calls[0]?.[0].headerRight()).toBeNull();
  });
  it("resets the dirty baseline after successful hydration", async () => {
    const navigation = {
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
    };
    const allowNavigationRef = { current: false };
    let hydrationVersion = 0;
    let name = "Temporary draft";
    const { result, rerender } = await renderHook(() =>
      useActivityPlanComposerProcess({
        activityCategory: "run",
        allowNavigationRef,
        description: "",
        hydrationVersion,
        isEditMode: true,
        isEditBlocked: false,
        isLoading: false,
        isSubmitting: false,
        name,
        navigation,
        structure,
        submit: jest.fn(),
        onAttempt: jest.fn(),
      }),
    );
    hydrationVersion = 1;
    name = "Server plan";
    await rerender({});
    expect(result.current.isDirty).toBe(false);
    name = "Local edit";
    await rerender({});
    expect(result.current.isDirty).toBe(true);
    allowNavigationRef.current = true;
    name = "New work after a save";
    await rerender({});
    expect(allowNavigationRef.current).toBe(false);
  });
});
