import RNSlider, { type SliderRef as RNSliderRef } from "@react-native-community/slider";
import * as React from "react";
import { Platform, useColorScheme } from "react-native";

import { getResolvedNativeTheme } from "../../lib/native-theme";
import { omitUndefined } from "../../lib/omit-undefined";
import { getNativeTestProps } from "../../lib/test-props";
import { SLIDER_DEFAULTS, type SliderProps } from "./shared";

const Slider = React.forwardRef<RNSliderRef, SliderProps>(
  (
    {
      value,
      onValueChange,
      onSlidingStart,
      onSlidingComplete,
      minimumValue = SLIDER_DEFAULTS.minimumValue,
      maximumValue = SLIDER_DEFAULTS.maximumValue,
      step = SLIDER_DEFAULTS.step,
      minimumTrackTintColor,
      maximumTrackTintColor,
      thumbTintColor,
      disabled = false,
      accessibilityLabel,
      id,
      role,
      testId,
      ...props
    },
    ref,
  ) => {
    const availability = React.useRef({ disabled, generation: 0 });
    if (availability.current.disabled !== disabled) {
      availability.current = { disabled, generation: availability.current.generation + 1 };
    }
    const generation = availability.current.generation;
    const alive = React.useRef(true);
    React.useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);
    const usable = () =>
      alive.current &&
      !availability.current.disabled &&
      availability.current.generation === generation;
    const theme = getResolvedNativeTheme(useColorScheme());
    const defaultMinimumTrackTintColor = minimumTrackTintColor || theme.primary;
    const defaultMaximumTrackTintColor = maximumTrackTintColor || theme.input;
    const defaultThumbTintColor = thumbTintColor || theme.primary;
    const { role: _nativeRole, ...nativeTestProps } = getNativeTestProps({
      accessibilityLabel,
      id,
      role,
      testId,
    });

    return (
      <RNSlider
        ref={ref}
        value={value ?? minimumValue}
        onValueChange={(next) => {
          if (usable()) onValueChange?.(next);
        }}
        onSlidingStart={(next) => {
          if (usable()) onSlidingStart?.(next);
        }}
        onSlidingComplete={(next) => {
          if (usable()) onSlidingComplete?.(next);
        }}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        minimumTrackTintColor={defaultMinimumTrackTintColor}
        maximumTrackTintColor={defaultMaximumTrackTintColor}
        {...(Platform.OS === "ios" ? { thumbTintColor: defaultThumbTintColor } : {})}
        disabled={disabled}
        style={{ opacity: disabled ? 0.5 : 1 }}
        {...nativeTestProps}
        {...omitUndefined(props)}
      />
    );
  },
);

Slider.displayName = "Slider";

export { Slider };
