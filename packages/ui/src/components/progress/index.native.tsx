import { View } from "react-native";
import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
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
  const { role: _role, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    role: "progressbar",
    testId,
  });

  return (
    <View
      {...nativeTestProps}
      accessibilityValue={{ min: 0, max: 100, now: boundedValue }}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
    >
      <View
        className={cn("h-full rounded-full bg-primary", indicatorClassName)}
        style={{ width: `${boundedValue}%` }}
      />
    </View>
  );
}

export { ProgressBar };
