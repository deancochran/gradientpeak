import * as TogglePrimitive from "@rn-primitives/toggle";
import * as React from "react";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import { Icon } from "../icon/index.native";
import { TextClassContext } from "../text/context";
import { type ToggleSize, type ToggleTestProps, type ToggleVariant } from "./shared";

const toggleVariantClasses = {
  default: "bg-transparent",
  outline: "border-input active:bg-accent border bg-transparent shadow-sm shadow-black/5",
} satisfies Record<ToggleVariant, string>;

const toggleSizeClasses = {
  default: "h-10 min-w-10 px-2.5 sm:h-9 sm:min-w-9 sm:px-2",
  sm: "h-9 min-w-9 px-2 sm:h-8 sm:min-w-8 sm:px-1.5",
  lg: "h-11 min-w-11 px-3 sm:h-10 sm:min-w-10 sm:px-2.5",
} satisfies Record<ToggleSize, string>;

function toggleVariants({
  className,
  size = "default",
  variant = "default",
}: {
  className?: string;
  size?: ToggleSize;
  variant?: ToggleVariant;
} = {}) {
  return cn(
    "group flex flex-row items-center justify-center gap-2 rounded-md active:bg-muted",
    toggleVariantClasses[variant],
    toggleSizeClasses[size],
    className,
  );
}

function toggleTextVariants({
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

function Toggle({
  accessibilityLabel,
  className,
  id,
  role,
  size,
  testId,
  variant,
  ...props
}: TogglePrimitive.RootProps &
  React.RefAttributes<TogglePrimitive.RootRef> &
  ToggleTestProps & {
    size?: ToggleSize;
    variant?: ToggleVariant;
  }) {
  return (
    <TextClassContext.Provider value={toggleTextVariants({ className, pressed: props.pressed })}>
      <TogglePrimitive.Root
        className={cn(
          toggleVariants({ size, variant }),
          props.disabled && "opacity-50",
          props.pressed && "bg-accent",
          className,
        )}
        {...(getNativeTestProps({
          accessibilityLabel,
          id,
          role,
          testId,
        }) as Pick<
          TogglePrimitive.RootProps,
          "accessibilityLabel" | "nativeID" | "role" | "testID"
        >)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function ToggleIcon({ className, ...props }: React.ComponentProps<typeof Icon>) {
  const textClass = React.useContext(TextClassContext);
  return <Icon className={cn("size-4 shrink-0", textClass, className)} {...props} />;
}

export type { ToggleSize, ToggleVariant } from "./shared";
export { Toggle, ToggleIcon, toggleTextVariants, toggleVariants };
