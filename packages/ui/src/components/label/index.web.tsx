"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { LabelTestProps } from "./shared";

function labelRootClasses({ className }: { className?: string } = {}) {
  return cn(
    "flex select-none items-center gap-2",
    "text-sm leading-none font-medium group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
    className,
  );
}

function Label({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & LabelTestProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={labelRootClasses({ className })}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export { Label };
