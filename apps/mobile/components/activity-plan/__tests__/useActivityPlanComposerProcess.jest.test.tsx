import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useActivityPlanComposerProcess } from "../useActivityPlanComposerProcess";

const preventRemoveMock = jest.fn<
  void,
  [boolean, (event: { data: { action: { type: string } } }) => void]
>();
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (...args: Parameters<typeof preventRemoveMock>) => preventRemoveMock(...args),
}));

const structure = { version: 3, segments: [] };

describe("useActivityPlanComposerProcess", () => {
  it("blocks Back during a pristine pending save until an authoritative success allows navigation", async () => {
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
        canSubmit: false,
        description: "",
        isEditMode: false,
        isEditBlocked: false,
        hydrationVersion: 0,
        isLoading: false,
        isSubmitting: true,
        name: "Plan",
        navigation,
        notes: "",
        structure,
        submit: jest.fn(),
      }),
    );
    const [prevent, listener] = preventRemoveMock.mock.calls.at(-1) ?? [];
    if (!listener) throw new Error("Missing navigation listener");
    expect(prevent).toBe(true);
    const event = { data: { action: { type: "GO_BACK" } } };
    await act(() => listener(event));
    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("Saving changes", expect.any(String));
    allowNavigationRef.current = true;
    await act(() => listener(event));
    expect(navigation.dispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
    alert.mockRestore();
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
        canSubmit: true,
        description: "",
        isEditMode: false,
        isEditBlocked: false,
        hydrationVersion: 0,
        isLoading: false,
        isSubmitting: false,
        name: "Morning Run",
        navigation,
        notes: "",
        structure,
        submit,
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
        canSubmit: false,
        description: "",
        isEditMode: true,
        isEditBlocked: true,
        hydrationVersion: 0,
        isLoading: false,
        isSubmitting: false,
        name: "Legacy",
        navigation,
        notes: "",
        structure,
        submit: jest.fn(),
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
        canSubmit: true,
        description: "",
        hydrationVersion,
        isEditMode: true,
        isEditBlocked: false,
        isLoading: false,
        isSubmitting: false,
        name,
        navigation,
        notes: "",
        structure,
        submit: jest.fn(),
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
