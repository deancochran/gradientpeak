import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { SliderProps } from "./shared";

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    accessibilityLabel,
    className,
    disabled = false,
    id,
    maximumValue = 1,
    minimumValue = 0,
    onSlidingComplete,
    onSlidingStart,
    onValueChange,
    step = 0.01,
    testId,
    value = 0,
  },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "accent-primary w-full disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      disabled={disabled}
      max={maximumValue}
      min={minimumValue}
      onChange={(event) => onValueChange?.(Number(event.currentTarget.value))}
      onInput={(event) => onSlidingStart?.(Number((event.target as HTMLInputElement).value))}
      onMouseUp={(event) => onSlidingComplete?.(Number(event.currentTarget.value))}
      step={step}
      type="range"
      value={value}
      {...getWebTestProps({ accessibilityLabel, id, testId })}
    />
  );
});

export { Slider };
