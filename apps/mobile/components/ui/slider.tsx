import RNSlider from "@react-native-community/slider";
import * as React from "react";
import { Platform } from "react-native";

interface SliderProps {
  value?: number;
  onValueChange?: (value: number) => void;
  onSlidingStart?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  disabled?: boolean;
  className?: string;
}

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
      className,
      ...props
    },
    ref,
  ) => {
    // Default color values based on theme
    const defaultMinimumTrackTintColor = minimumTrackTintColor || "#3b82f6"; // primary blue
    const defaultMaximumTrackTintColor = maximumTrackTintColor || "#e5e7eb"; // gray-200
    const defaultThumbTintColor = thumbTintColor || "#3b82f6"; // primary blue

    return (
      <RNSlider
        ref={ref as any}
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
        style={{
          opacity: disabled ? 0.5 : 1,
        }}
        {...props}
      />
    );
  },
);

Slider.displayName = "Slider";

export { Slider };
