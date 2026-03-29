import * as ToggleGroupPrimitive from "@rn-primitives/toggle-group";
import * as React from "react";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import { Icon } from "../icon/index.native";
import { TextClassContext } from "../text/context";
import { type ToggleSize, type ToggleVariant } from "../toggle/shared";
import { ToggleGroupContext } from "./context";
import type { ToggleGroupTestProps } from "./shared";

function toggleVariants({
  size = "default",
  variant = "default",
}: {
  size?: ToggleSize;
  variant?: ToggleVariant;
} = {}) {
  return cn(
    "group flex flex-row items-center justify-center gap-2 rounded-md active:bg-muted",
    variant === "outline" &&
      "border-input active:bg-accent border bg-transparent shadow-sm shadow-black/5",
    size === "default" && "h-10 min-w-10 px-2.5 sm:h-9 sm:min-w-9 sm:px-2",
    size === "sm" && "h-9 min-w-9 px-2 sm:h-8 sm:min-w-8 sm:px-1.5",
    size === "lg" && "h-11 min-w-11 px-3 sm:h-10 sm:min-w-10 sm:px-2.5",
  );
}

function toggleNativeTextVariants({
  className,
  pressed = false,
}: {
  className?: string;
  pressed?: boolean;
} = {}) {
  return cn(
    "text-sm text-foreground font-medium",
    pressed ? "text-accent-foreground" : "group-hover:text-muted-foreground",
    className,
  );
}

function ToggleGroup({
  children,
  accessibilityLabel,
  className,
  id,
  role,
  size,
  testId,
  variant,
  ...props
}: ToggleGroupPrimitive.RootProps &
  React.RefAttributes<ToggleGroupPrimitive.RootRef> &
  ToggleGroupTestProps & {
    size?: ToggleSize;
    variant?: ToggleVariant;
  }) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn(
        "flex flex-row items-center rounded-md shadow-none",
        variant === "outline" && "shadow-sm shadow-black/5",
        className,
      )}
      {...(getNativeTestProps({
        accessibilityLabel,
        id,
        role,
        testId,
      }) as Pick<
        ToggleGroupPrimitive.RootProps,
        "accessibilityLabel" | "nativeID" | "role" | "testID"
      >)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ size, variant }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function useToggleGroupContext() {
  const context = React.useContext(ToggleGroupContext);

  if (context === null) {
    throw new Error(
      "ToggleGroup compound components cannot be rendered outside the ToggleGroup component",
    );
  }

  return context;
}

function ToggleGroupItem({
  children,
  accessibilityLabel,
  className,
  id,
  isFirst,
  isLast,
  role,
  size,
  testId,
  variant,
  ...props
}: ToggleGroupPrimitive.ItemProps &
  React.RefAttributes<ToggleGroupPrimitive.ItemRef> &
  ToggleGroupTestProps & {
    isFirst?: boolean;
    isLast?: boolean;
    size?: ToggleSize;
    variant?: ToggleVariant;
  }) {
  const context = useToggleGroupContext();
  const { value } = ToggleGroupPrimitive.useRootContext();
  const isSelected = ToggleGroupPrimitive.utils.getIsSelected(value, props.value);

  return (
    <TextClassContext.Provider value={toggleNativeTextVariants({ pressed: isSelected })}>
      <ToggleGroupPrimitive.Item
        className={cn(
          toggleVariants({
            size: context.size || size,
            variant: context.variant || variant,
          }),
          props.disabled && "opacity-50",
          isSelected && "bg-accent",
          "min-w-0 shrink-0 rounded-none shadow-none",
          isFirst && "rounded-l-md",
          isLast && "rounded-r-md",
          (context.variant === "outline" || variant === "outline") && "border-l-0",
          (context.variant === "outline" || variant === "outline") && isFirst && "border-l",
          className,
        )}
        {...(getNativeTestProps({
          accessibilityLabel,
          id,
          role,
          testId,
        }) as Pick<
          ToggleGroupPrimitive.ItemProps,
          "accessibilityLabel" | "nativeID" | "role" | "testID"
        >)}
        {...props}
      >
        {children}
      </ToggleGroupPrimitive.Item>
    </TextClassContext.Provider>
  );
}

function ToggleGroupIcon({ className, ...props }: React.ComponentProps<typeof Icon>) {
  const textClass = React.useContext(TextClassContext);
  return <Icon className={cn("size-4 shrink-0", textClass, className)} {...props} />;
}

export { ToggleGroup, ToggleGroupIcon, ToggleGroupItem };
