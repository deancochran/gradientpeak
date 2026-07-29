import { act, renderHook } from "@testing-library/react-native";

import { useActivityPlanComposerProcess } from "../useActivityPlanComposerProcess";

const structure = { version: 3, segments: [] };

describe("useActivityPlanComposerProcess", () => {
  it("keeps header options stable while invoking the latest submit callback", () => {
    const navigation = {
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
    };
    const initialSubmit = jest.fn();
    const latestSubmit = jest.fn();
    const allowNavigationRef = { current: false };
    let submit = initialSubmit;

    const { rerender } = renderHook(() =>
      useActivityPlanComposerProcess({
        activityCategory: "run",
        allowNavigationRef,
        canSubmit: true,
        description: "",
        isEditMode: false,
        isEditBlocked: false,
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
    rerender({});

    expect(navigation.setOptions).toHaveBeenCalledTimes(1);
    const options = navigation.setOptions.mock.calls[0]?.[0];
    const headerButton = options?.headerRight();

    act(() => {
      headerButton.props.onPress();
    });

    expect(initialSubmit).not.toHaveBeenCalled();
    expect(latestSubmit).toHaveBeenCalledTimes(1);
  });

  it("removes the Save header action for a blocked edit route", () => {
    const navigation = {
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
    };

    renderHook(() =>
      useActivityPlanComposerProcess({
        activityCategory: "run",
        allowNavigationRef: { current: false },
        canSubmit: false,
        description: "",
        isEditMode: true,
        isEditBlocked: true,
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
});
