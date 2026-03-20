import * as React from "react";
import * as Slot from "@rn-primitives/slot";
import { View, type ViewProps } from "../../lib/react-native";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import { TextClassContext } from "../text/context";
import { type BadgeTestProps, type BadgeVariant } from "./shared";

const badgeVariantClasses = {
  default: "border-transparent bg-primary",
  secondary: "border-transparent bg-secondary",
  destructive: "border-transparent bg-destructive",
  outline: "text-foreground",
} satisfies Record<BadgeVariant, string>;

const badgeTextVariantClasses = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-white",
  outline: "text-foreground",
} satisfies Record<BadgeVariant, string>;

function badgeVariants({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: BadgeVariant;
} = {}) {
  return cn(
    "border-border inline-flex shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium",
    "group flex-row",
    badgeVariantClasses[variant],
    className,
  );
}

function badgeTextVariants({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: BadgeVariant;
} = {}) {
  return cn("text-xs font-medium", badgeTextVariantClasses[variant], className);
}

export type BadgeProps = ViewProps &
  React.RefAttributes<View> &
  BadgeTestProps & {
    asChild?: boolean;
    variant?: BadgeVariant;
  };

function Badge({
  accessibilityLabel,
  asChild,
  className,
  id,
  role,
  testId,
  variant,
  ...props
}: BadgeProps) {
  const Component = asChild ? Slot.View : View;

  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <Component
        className={badgeVariants({ className, variant })}
        {...(getNativeTestProps({
          accessibilityLabel,
          id,
          role,
          testId,
        }) as Pick<
          ViewProps,
          "accessibilityLabel" | "nativeID" | "role" | "testID"
        >)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Badge, badgeTextVariants, badgeVariants };
