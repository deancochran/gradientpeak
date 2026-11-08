import type * as React from "react";
import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import type { ButtonProps as RegistryButtonProps } from "../../registry/native/button";
import {
  buttonTextVariants,
  buttonVariants,
  Button as RegistryButton,
} from "../../registry/native/button";
import type { ButtonTestProps } from "./shared";

type ButtonProps = Omit<RegistryButtonProps, "nativeID" | "testID"> & ButtonTestProps;

function Button({
  accessibilityLabel,
  accessibilityState,
  className,
  disabled,
  id,
  role,
  testId,
  ...props
}: ButtonProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role: role ?? "button",
    testId,
  });

  return (
    <RegistryButton
      {...nativeTestProps}
      {...props}
      accessibilityState={{
        ...accessibilityState,
        disabled: Boolean(disabled || accessibilityState?.disabled),
      }}
      className={cn(
        "min-h-12 min-w-12",
        props.variant === "destructive" &&
          "bg-destructive-surface active:bg-destructive-surface/90 dark:bg-destructive-surface",
        className,
      )}
      disabled={disabled}
    />
  );
}

type IconButtonProps = Omit<ButtonProps, "accessibilityLabel" | "children" | "size" | "testId"> & {
  accessibilityLabel: string;
  children: React.ReactNode;
  testId: string;
};

function IconButton({ accessibilityLabel, children, testId, ...props }: IconButtonProps) {
  return (
    <Button {...props} accessibilityLabel={accessibilityLabel} size="icon" testId={testId}>
      {children}
    </Button>
  );
}

export type { ButtonProps, IconButtonProps };
export { Button, buttonTextVariants, buttonVariants, IconButton };
