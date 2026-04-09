import { getNativeTestProps } from "../../lib/test-props";
import type { ButtonProps as RegistryButtonProps } from "../../registry/native/button";
import {
  buttonTextVariants,
  buttonVariants,
  Button as RegistryButton,
} from "../../registry/native/button";
import type { ButtonTestProps } from "./shared";

type ButtonProps = Omit<RegistryButtonProps, "nativeID" | "testID"> & ButtonTestProps;

function Button({ accessibilityLabel, id, role, testId, ...props }: ButtonProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role: role ?? "button",
    testId,
  });

  return <RegistryButton {...nativeTestProps} {...props} />;
}

export type { ButtonProps };
export { Button, buttonTextVariants, buttonVariants };
