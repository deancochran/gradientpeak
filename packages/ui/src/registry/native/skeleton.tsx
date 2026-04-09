import { View } from "react-native";
import { cn } from "../../lib/cn";

function Skeleton({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("bg-accent animate-pulse rounded-md", className)} {...props} />;
}

export { Skeleton };
