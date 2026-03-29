import type * as React from "react";
import type Animated from "react-native-reanimated";

export type NativeOnlyAnimatedViewProps = React.ComponentProps<typeof Animated.View> &
  React.RefAttributes<Animated.View>;
