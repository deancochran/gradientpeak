import { cva } from "class-variance-authority";
import { View } from "react-native";
import { cn } from "../../lib/cn";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar/index.native";
import { Text } from "../text/index.native";
import type { AvatarStackProps } from "./shared";

const avatarStackVariants = cva("flex -space-x-4 -space-y-4", {
  variants: {
    orientation: {
      vertical: "flex-row",
      horizontal: "flex-col",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

function getInitials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function AvatarStack({ avatars, className, maxAvatarsAmount = 3, orientation }: AvatarStackProps) {
  const shownAvatars = avatars.slice(0, maxAvatarsAmount);
  const hiddenCount = Math.max(avatars.length - shownAvatars.length, 0);

  return (
    <View
      className={cn(
        avatarStackVariants({ orientation }),
        className,
        orientation === "horizontal" ? "-space-x-0" : "-space-y-0",
      )}
    >
      {shownAvatars.map(({ image, name }, index) => (
        <Avatar alt={name} key={`${name}-${image}-${index}`} className="border-background border-2">
          <AvatarImage source={{ uri: image }} />
          <AvatarFallback>
            <Text className="text-xs font-medium">{getInitials(name)}</Text>
          </AvatarFallback>
        </Avatar>
      ))}
      {hiddenCount ? (
        <Avatar alt={`${hiddenCount} more avatars`} className="border-background border-2">
          <AvatarFallback>
            <Text className="text-xs font-medium">+{hiddenCount}</Text>
          </AvatarFallback>
        </Avatar>
      ) : null}
    </View>
  );
}

export type { AvatarStackProps } from "./shared";
export { AvatarStack, avatarStackVariants };
