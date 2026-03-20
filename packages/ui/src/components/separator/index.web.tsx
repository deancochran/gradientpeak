"use client";

import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { SeparatorTestProps } from "./shared";

function separatorVariants({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return cn(
    "bg-border shrink-0",
    orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
    className,
  );
}

function Separator({
  accessibilityLabel,
  className,
  decorative = true,
  id,
  orientation = "horizontal",
  role,
  testId,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> & SeparatorTestProps) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={separatorVariants({ className, orientation })}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export { Separator };
