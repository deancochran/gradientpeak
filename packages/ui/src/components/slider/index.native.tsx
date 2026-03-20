import RNSlider from "@react-native-community/slider";
import * as React from "react";
import { Platform } from "react-native";

import type { SliderProps } from "./shared";

const Slider = React.forwardRef<RNSlider, SliderProps>(
  (
    {
      value = 0,
      onValueChange,
      onSlidingStart,
      onSlidingComplete,
      minimumValue = 0,
      maximumValue = 1,
      step = 0.01,
      minimumTrackTintColor,
      maximumTrackTintColor,
      thumbTintColor,
      disabled = false,
      ...props
    },
    ref,
  ) => {
    const defaultMinimumTrackTintColor = minimumTrackTintColor || "#3b82f6";
    const defaultMaximumTrackTintColor = maximumTrackTintColor || "#e5e7eb";
    const defaultThumbTintColor = thumbTintColor || "#3b82f6";

    return (
      <RNSlider
        ref={ref as never}
        value={value}
        onValueChange={onValueChange}
        onSlidingStart={onSlidingStart}
        onSlidingComplete={onSlidingComplete}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        minimumTrackTintColor={defaultMinimumTrackTintColor}
        maximumTrackTintColor={defaultMaximumTrackTintColor}
        thumbTintColor={
          Platform.OS === "ios" ? defaultThumbTintColor : undefined
        }
        disabled={disabled}
        style={{ opacity: disabled ? 0.5 : 1 }}
        {...props}
      />
    );
  },
);

Slider.displayName = "Slider";

export { Slider };
