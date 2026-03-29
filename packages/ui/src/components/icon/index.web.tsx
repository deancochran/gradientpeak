import { cn } from "../../lib/cn";
import type { IconProps } from "./shared";

function Icon({ as: IconComponent, className, size = 14, ...props }: IconProps) {
  return <IconComponent className={cn("text-foreground", className)} size={size} {...props} />;
}

export type { IconProps } from "./shared";
export { Icon };
