"use client";

import { cva } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar/index.web";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip/index.web";
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
  const hiddenAvatars = avatars.slice(maxAvatarsAmount);

  return (
    <div
      className={cn(
        avatarStackVariants({ orientation }),
        className,
        orientation === "horizontal" ? "-space-x-0" : "-space-y-0",
      )}
    >
      {shownAvatars.map(({ image, name }, index) => (
        <Tooltip key={`${name}-${image}-${index}`}>
          <TooltipTrigger asChild>
            <Avatar className="hover:z-10">
              <AvatarImage src={image} />
              <AvatarFallback>{getInitials(name)}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            <p>{name}</p>
          </TooltipContent>
        </Tooltip>
      ))}

      {hiddenAvatars.length ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Avatar>
              <AvatarFallback>+{avatars.length - shownAvatars.length}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            {hiddenAvatars.map(({ name }, index) => (
              <p key={`${name}-${index}`}>{name}</p>
            ))}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export type { AvatarStackProps } from "./shared";
export { AvatarStack, avatarStackVariants };
