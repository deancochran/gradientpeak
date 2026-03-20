export const DEFAULT_TOOLTIP_DELAY_DURATION = 0;
export const DEFAULT_TOOLTIP_SIDE_OFFSET = 4;

export type TooltipPlatform = "native" | "web";
export type TooltipSide = "bottom" | "left" | "right" | "top";

export type TooltipContentOptions = {
  className?: string;
  side?: TooltipSide;
};
