import * as React from "react";
import { Pressable } from "../../lib/react-native";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import { TextClassContext } from "../text/context";
import {
  type ButtonSize,
  type ButtonTestProps,
  type ButtonVariant,
} from "./shared";

const buttonBaseClasses =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium";

const buttonNativeBaseClasses = "group flex-row shadow-none shadow-black/5";

const buttonVariantClasses = {
  default: "bg-primary shadow-sm active:bg-primary/90",
  destructive:
    "bg-destructive shadow-sm active:bg-destructive/90 dark:bg-destructive/60",
  outline:
    "border border-border bg-background shadow-sm active:bg-accent dark:border-input dark:bg-input/30 dark:active:bg-input/50",
  secondary: "bg-secondary shadow-sm active:bg-secondary/80",
  ghost: "active:bg-accent dark:active:bg-accent/50",
  link: "",
} satisfies Record<ButtonVariant, string>;

const buttonSizeClasses = {
  default: "h-10 px-4 py-2 sm:h-9",
  sm: "h-9 gap-1.5 rounded-md px-3 sm:h-8",
  lg: "h-11 rounded-md px-6 sm:h-10",
  icon: "h-10 w-10 sm:h-9 sm:w-9",
} satisfies Record<ButtonSize, string>;

const buttonTextVariantClasses = {
  default: "text-primary-foreground",
  destructive: "text-white",
  outline: "group-active:text-accent-foreground",
  secondary: "text-secondary-foreground",
  ghost: "group-active:text-accent-foreground",
  link: "text-primary group-active:underline",
} satisfies Record<ButtonVariant, string>;

function buttonVariants({
  className,
  size = "default",
  variant = "default",
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
} = {}) {
  return cn(
    buttonBaseClasses,
    buttonNativeBaseClasses,
    buttonVariantClasses[variant],
    buttonSizeClasses[size],
    className,
  );
}

function buttonTextVariants({
  className,
  size: _size,
  variant = "default",
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
} = {}) {
  return cn(
    "text-foreground text-sm font-medium",
    buttonTextVariantClasses[variant],
    className,
  );
}

export type ButtonProps = React.ComponentProps<typeof Pressable> &
  ButtonTestProps & {
    size?: ButtonSize;
    variant?: ButtonVariant;
  };

function Button({
  accessibilityLabel,
  className,
  id,
  role,
  size,
  testId,
  variant,
  ...props
}: ButtonProps) {
  const nativeTestProps = getNativeTestProps({
    accessibilityLabel,
    id,
    role: role ?? "button",
    testId,
  }) as Pick<
    React.ComponentProps<typeof Pressable>,
    "accessibilityLabel" | "nativeID" | "role" | "testID"
  >;

  return (
    <TextClassContext.Provider value={buttonTextVariants({ size, variant })}>
      <Pressable
        className={buttonVariants({
          className: props.disabled
            ? `opacity-50 ${className ?? ""}`
            : className,
          size,
          variant,
        })}
        {...nativeTestProps}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
