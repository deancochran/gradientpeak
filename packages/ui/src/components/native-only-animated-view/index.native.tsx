import { Platform } from "react-native";
import Animated from "react-native-reanimated";

import type { NativeOnlyAnimatedViewProps } from "./shared";

function NativeOnlyAnimatedView(props: NativeOnlyAnimatedViewProps) {
  if (Platform.OS === "web") {
    return <>{props.children as React.ReactNode}</>;
  }

  return <Animated.View {...props} />;
}

export { NativeOnlyAnimatedView };
