import type { TestProps } from "../../lib/test-props";

export { normalizedSliderPolicy as SLIDER_DEFAULTS } from "@repo/core/utils/numeric-ux-policy";

export interface SliderProps extends TestProps {
  /** Defaults on both platforms: normalized 0..1, step 0.01. */
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
