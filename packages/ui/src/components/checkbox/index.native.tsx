import * as CheckboxPrimitive from "@rn-primitives/checkbox";
import { Check } from "lucide-react-native";
import type * as React from "react";
import { Platform } from "react-native";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import { Icon } from "../icon/index.native";
import type { CheckboxClassNameOverrides, CheckboxTestProps } from "./shared";

const DEFAULT_HIT_SLOP = 24;

function Checkbox({
  accessibilityLabel,
  checkedClassName,
  className,
  id,
  iconClassName,
  indicatorClassName,
  testId,
  ...props
}: CheckboxPrimitive.RootProps &
  React.RefAttributes<CheckboxPrimitive.RootRef> &
  CheckboxClassNameOverrides &
  CheckboxTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return (
    <CheckboxPrimitive.Root
      className={cn(
        "border-input dark:bg-input/30 size-4 shrink-0 rounded-[4px] border shadow-sm shadow-black/5",
        Platform.select({
          web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive peer cursor-default outline-none transition-shadow focus-visible:ring-[3px] disabled:cursor-not-allowed",
          native: "overflow-hidden",
        }),
        props.checked && cn("border-primary", checkedClassName),
        props.disabled && "opacity-50",
        className,
      )}
      hitSlop={DEFAULT_HIT_SLOP}
      {...nativeTestProps}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn("bg-primary h-full w-full items-center justify-center", indicatorClassName)}
      >
        <Icon
          as={Check}
          className={cn("text-primary-foreground", iconClassName)}
          size={12}
          strokeWidth={Platform.OS === "web" ? 2.5 : 3.5}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
