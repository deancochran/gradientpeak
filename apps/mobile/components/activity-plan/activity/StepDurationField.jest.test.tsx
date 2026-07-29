import type { ButtonProps } from "@repo/ui/components/button";
import type { InputProps } from "@repo/ui/components/input";
import type { TextProps } from "@repo/ui/components/text";
import { createElement } from "react";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { StepDurationField } from "./StepDurationField";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: (props: ButtonProps) =>
    createElement("Button", props, typeof props.children === "function" ? null : props.children),
}));

jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: ({ testId, ...props }: InputProps) => createElement("Input", { ...props, testID: testId }),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: (props: TextProps) => createElement("Text", props, props.children),
}));

describe("StepDurationField", () => {
  it("keeps a partial kilometer decimal editable before committing the canonical duration", () => {
    const setValue = jest.fn();
    renderNative(
      <StepDurationField
        form={{
          getValues: () => ({ duration: { type: "distance", meters: 1000 } }),
          setValue,
        }}
      />,
    );

    const input = screen.getByTestId("step-duration-value");
    fireEvent.changeText(input, "1.");

    expect(setValue).not.toHaveBeenCalled();
    expect(screen.getByTestId("step-duration-value").props.value).toBe("1.");

    fireEvent.changeText(input, "1.5");

    expect(setValue).toHaveBeenLastCalledWith(
      "duration",
      { type: "distance", meters: 1500 },
      { shouldDirty: true, shouldValidate: true },
    );
    expect(screen.getByTestId("step-duration-value").props.value).toBe("1.5");
  });

  it("allows a temporary empty draft and restores the canonical duration when it blurs", () => {
    const setValue = jest.fn();
    renderNative(
      <StepDurationField
        form={{
          getValues: () => ({ duration: { type: "time", seconds: 600 } }),
          setValue,
        }}
      />,
    );

    const input = screen.getByTestId("step-duration-value");
    fireEvent.changeText(input, "");

    expect(setValue).not.toHaveBeenCalled();
    expect(screen.getByTestId("step-duration-value").props.value).toBe("");

    fireEvent(input, "blur");

    expect(setValue).not.toHaveBeenCalled();
    expect(screen.getByTestId("step-duration-value").props.value).toBe("10");
  });
});
