"use client";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import { clampProgressValue, type ProgressProps } from "./shared";

function ProgressBar({
  accessibilityLabel,
  className,
  id,
  indicatorClassName,
  testId,
  value,
}: ProgressProps) {
  const boundedValue = clampProgressValue(value);
  return (
    <div
      {...getWebTestProps({
        accessibilityLabel,
        ...(id !== undefined ? { id } : {}),
        ...(testId !== undefined ? { testId } : {}),
      })}
      role="progressbar"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={boundedValue}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
    >
      <div
        className={cn("h-full rounded-full bg-primary", indicatorClassName)}
        style={{ width: `${boundedValue}%` }}
      />
    </div>
  );
}

export { ProgressBar };
