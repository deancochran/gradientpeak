import { View } from "react-native";

import { cn } from "../../lib/cn";
import type { SkeletonProps } from "./shared";

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <View
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
