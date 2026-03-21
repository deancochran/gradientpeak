"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { RadioGroupItemClassNameOverrides, RadioGroupTestProps } from "./shared";

function RadioGroup({
  accessibilityLabel,
  className,
  id,
  testId,
  ...props
}: RadioGroupPrimitive.RadioGroupProps & RadioGroupTestProps) {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-3", className)}
      {...getWebTestProps({ accessibilityLabel, id, testId })}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: RadioGroupPrimitive.RadioGroupItemProps & RadioGroupItemClassNameOverrides) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "aspect-square size-4 shrink-0 rounded-full border border-input shadow-sm outline-none transition-shadow",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="relative flex h-full w-full items-center justify-center">
        <span className="bg-primary size-2 rounded-full" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
