"use client";

import * as TogglePrimitive from "@radix-ui/react-toggle";
import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import { type ToggleSize, type ToggleTestProps, type ToggleVariant } from "./shared";

const toggleVariantClasses = {
  default: "bg-transparent",
  outline:
    "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
} satisfies Record<ToggleVariant, string>;

const toggleSizeClasses = {
  default: "h-9 min-w-9 px-2",
  sm: "h-8 min-w-8 px-1.5",
  lg: "h-10 min-w-10 px-2.5",
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
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    toggleVariantClasses[variant],
    toggleSizeClasses[size],
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
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  ToggleTestProps & {
    size?: ToggleSize;
    variant?: ToggleVariant;
  }) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={toggleVariants({ className, size, variant })}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export type { ToggleSize, ToggleVariant } from "./shared";
export { Toggle, toggleVariants };
