import * as TooltipPrimitive from "@rn-primitives/tooltip";
import * as React from "react";
import { Platform, StyleSheet } from "react-native";
import { FadeInDown, FadeInUp, FadeOut } from "react-native-reanimated";
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens";

import { cn } from "../../lib/cn";
import { NativeOnlyAnimatedView } from "../../lib/native-only-animated-view";
import { TextClassContext } from "../text/context";
import { DEFAULT_TOOLTIP_SIDE_OFFSET, type TooltipSide } from "./shared";

function tooltipContentVariants({ className }: { className?: string; side?: TooltipSide } = {}) {
  return cn("bg-primary z-50 rounded-md px-3 py-2 sm:py-1.5", className);
}

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const FullWindowOverlay = Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment;

function TooltipContent({
  className,
  portalHost,
  side = "top",
  sideOffset = DEFAULT_TOOLTIP_SIDE_OFFSET,
  ...props
}: TooltipPrimitive.ContentProps &
  React.RefAttributes<TooltipPrimitive.ContentRef> & {
    portalHost?: string;
  }) {
  return (
    <TooltipPrimitive.Portal hostName={portalHost}>
      <FullWindowOverlay>
        <TooltipPrimitive.Overlay style={Platform.select({ native: StyleSheet.absoluteFill })}>
          <NativeOnlyAnimatedView
            entering={
              side === "top"
                ? FadeInDown.withInitialValues({
                    transform: [{ translateY: 3 }],
                  }).duration(150)
                : FadeInUp.withInitialValues({
                    transform: [{ translateY: -5 }],
                  })
            }
            exiting={FadeOut}
          >
            <TextClassContext.Provider value="text-xs text-primary-foreground">
              <TooltipPrimitive.Content
                side={side}
                sideOffset={sideOffset}
                className={tooltipContentVariants({ className, side })}
                {...props}
              />
            </TextClassContext.Provider>
          </NativeOnlyAnimatedView>
        </TooltipPrimitive.Overlay>
      </FullWindowOverlay>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipTrigger };
