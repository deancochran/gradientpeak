"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { CheckboxClassNameOverrides, CheckboxTestProps } from "./shared";

function Checkbox({
  accessibilityLabel,
  checkedClassName,
  className,
  iconClassName,
  id,
  indicatorClassName,
  testId,
  ...props
}: CheckboxPrimitive.CheckboxProps & CheckboxClassNameOverrides & CheckboxTestProps) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-sm outline-none transition-shadow",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-primary",
        props.checked && checkedClassName,
        className,
      )}
      {...getWebTestProps({ accessibilityLabel, id, testId })}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn(
          "flex h-full w-full items-center justify-center rounded-[3px] bg-primary text-primary-foreground",
          indicatorClassName,
        )}
      >
        <Check className={cn("size-3.5", iconClassName)} strokeWidth={2.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
