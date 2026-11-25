"use client";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import { Slider as RegistrySlider } from "../../registry/web/slider";
import { SLIDER_DEFAULTS, type SliderProps } from "./shared";

function Slider({
  accessibilityLabel,
  className,
  disabled = false,
  id,
  maximumValue = SLIDER_DEFAULTS.maximumValue,
  minimumValue = SLIDER_DEFAULTS.minimumValue,
  onSlidingComplete,
  onSlidingStart,
  onValueChange,
  step = SLIDER_DEFAULTS.step,
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
        onChange={(event) => {
          if (!disabled) onValueChange?.(Number(event.currentTarget.value));
        }}
        onInput={(event) => {
          if (!disabled) onSlidingStart?.(Number((event.target as HTMLInputElement).value));
        }}
        onMouseUp={(event) => {
          if (!disabled) onSlidingComplete?.(Number(event.currentTarget.value));
        }}
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
      onPointerDownCapture={() => {
        if (!disabled) onSlidingStart?.(currentValue);
      }}
      onValueChange={(values) => {
        if (!disabled) onValueChange?.(values[0] ?? minimumValue);
      }}
      onValueCommit={(values) => {
        if (!disabled) onSlidingComplete?.(values[0] ?? minimumValue);
      }}
      step={step}
      value={[currentValue]}
      {...getWebTestProps({ accessibilityLabel, id, testId })}
    />
  );
}

export { Slider };
