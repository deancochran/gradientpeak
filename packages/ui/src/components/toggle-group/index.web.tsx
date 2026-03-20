"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
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
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    variant === "outline" &&
      "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
    size === "default" && "h-9 min-w-9 px-2",
    size === "sm" && "h-8 min-w-8 px-1.5",
    size === "lg" && "h-10 min-w-10 px-2.5",
  );
}

function ToggleGroup({
  children,
  accessibilityLabel,
  className,
  id,
  role,
  size,
  spacing = 0,
  testId,
  variant,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  ToggleGroupTestProps & {
    size?: ToggleSize;
    spacing?: number;
    variant?: ToggleVariant;
  }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-size={size}
      data-spacing={spacing}
      data-variant={variant}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs",
        className,
      )}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ size, spacing, variant }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  children,
  accessibilityLabel,
  className,
  id,
  role,
  size,
  testId,
  variant,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  ToggleGroupTestProps & {
    size?: ToggleSize;
    variant?: ToggleVariant;
  }) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-size={context?.size || size}
      data-spacing={context?.spacing}
      data-variant={context?.variant || variant}
      className={cn(
        toggleVariants({
          size: context?.size || size,
          variant: context?.variant || variant,
        }),
        "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10",
        "data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l",
        className,
      )}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
