import { styled } from "nativewind";

import { cn } from "../../lib/cn";
import type { IconProps } from "./shared";

function IconImpl({ as: IconComponent, ...props }: IconProps) {
  return <IconComponent {...props} />;
}

const StyledIconImpl = styled(IconImpl, {
  className: "style",
});

function Icon({ as: IconComponent, className, size = 14, ...props }: IconProps) {
  return (
    <StyledIconImpl
      as={IconComponent}
      className={cn("text-foreground", className)}
      size={size}
      {...props}
    />
  );
}

export type { IconProps } from "./shared";
export { Icon };
