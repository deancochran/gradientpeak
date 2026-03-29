import * as ProgressPrimitive from "@rn-primitives/progress";
import type * as React from "react";
import { Platform, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from "react-native-reanimated";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import type { ProgressProps as SharedProgressProps } from "./shared";

function Progress({
  accessibilityLabel,
  className,
  id,
  indicatorClassName,
  testId,
  value,
  ...props
}: ProgressPrimitive.RootProps &
  React.RefAttributes<ProgressPrimitive.RootRef> &
  SharedProgressProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return (
    <ProgressPrimitive.Root
      className={cn("bg-primary/20 relative h-2 w-full overflow-hidden rounded-full", className)}
      {...nativeTestProps}
      {...props}
    >
      <Indicator className={indicatorClassName} value={value} />
    </ProgressPrimitive.Root>
  );
}

type IndicatorProps = {
  className?: string;
  value: number | null | undefined;
};

const Indicator = Platform.select({
  web: WebIndicator,
  native: NativeIndicator,
  default: NullIndicator,
});

function WebIndicator({ className, value }: IndicatorProps) {
  if (Platform.OS !== "web") {
    return null;
  }

  return (
    <View
      className={cn("bg-primary h-full w-full flex-1 transition-all", className)}
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    >
      <ProgressPrimitive.Indicator className={cn("h-full w-full", className)} />
    </View>
  );
}

function NativeIndicator({ className, value }: IndicatorProps) {
  const progress = useDerivedValue(() => value ?? 0);

  const indicator = useAnimatedStyle(() => {
    return {
      width: withSpring(
        `${interpolate(progress.value, [0, 100], [1, 100], Extrapolation.CLAMP)}%`,
        { overshootClamping: true },
      ),
    };
  }, [value]);

  if (Platform.OS === "web") {
    return null;
  }

  return (
    <ProgressPrimitive.Indicator asChild>
      <Animated.View className={cn("bg-foreground h-full", className)} style={indicator} />
    </ProgressPrimitive.Indicator>
  );
}

function NullIndicator(_props: IndicatorProps) {
  return null;
}

export { Progress };
