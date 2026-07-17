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
});
