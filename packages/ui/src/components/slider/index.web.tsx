"use client";

import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import { Slider as RegistrySlider } from "../../registry/web/slider";
import type { SliderProps } from "./shared";

function Slider({
  accessibilityLabel,
  className,
  disabled = false,
  id,
  maximumValue = 100,
  minimumValue = 0,
  onSlidingComplete,
  onSlidingStart,
  onValueChange,
  step = 1,
  testId,
  value = minimumValue,
}: SliderProps) {
  const currentValue = value;

  if (typeof ResizeObserver === "undefined") {
    return (
      <input
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
        value={currentValue}
        {...getWebTestProps({ accessibilityLabel, id, testId })}
      />
    );
  }

  return (
    <RegistrySlider
      className={className}
      disabled={disabled}
      max={maximumValue}
      min={minimumValue}
      onPointerDownCapture={() => onSlidingStart?.(currentValue)}
      onValueChange={(values) => onValueChange?.(values[0] ?? minimumValue)}
      onValueCommit={(values) => onSlidingComplete?.(values[0] ?? minimumValue)}
      step={step}
      value={[currentValue]}
      {...getWebTestProps({ accessibilityLabel, id, testId })}
    />
  );
}

export { Slider };
