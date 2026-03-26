import * as DialogPrimitive from "@rn-primitives/dialog";
import { X } from "lucide-react-native";
import * as React from "react";
import { Platform, Text, View, type ViewProps } from "react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens";

import { cn } from "../../lib/cn";
import { NativeOnlyAnimatedView } from "../../lib/native-only-animated-view";
import { Icon } from "../icon/index.native";

function dialogOverlayVariants(className?: string) {
  return cn(
    "absolute bottom-0 left-0 right-0 top-0 z-50 fixed cursor-default items-center justify-center bg-black/50 p-2 animate-in fade-in-0 [&>*]:cursor-auto",
    className,
  );
}

function dialogContentVariants(className?: string) {
  return cn(
    "bg-background border-border z-50 mx-auto flex w-full max-w-[calc(100%-2rem)] flex-col gap-4 rounded-lg border p-6 shadow-lg shadow-black/5 animate-in fade-in-0 zoom-in-95 duration-200 sm:max-w-lg",
    className,
  );
}

function dialogCloseButtonVariants() {
  return "absolute right-4 top-4 rounded opacity-70 active:opacity-100";
}

function dialogHeaderVariants(className?: string) {
  return cn("flex flex-col gap-2 text-center sm:text-left", className);
}

function dialogFooterVariants(className?: string) {
  return cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className);
}

function dialogTitleVariants(className?: string) {
  return cn("text-foreground text-lg font-semibold leading-none", className);
}

function dialogDescriptionVariants(className?: string) {
  return cn("text-muted-foreground text-sm", className);
}

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;
const FullWindowOverlay = Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment;

function DialogOverlay({
  children,
  className,
  ...props
}: Omit<DialogPrimitive.OverlayProps, "asChild"> &
  React.RefAttributes<DialogPrimitive.OverlayRef> & {
    children?: React.ReactNode;
  }) {
  return (
    <FullWindowOverlay>
      <DialogPrimitive.Overlay
        className={dialogOverlayVariants(className)}
        {...props}
        asChild={Platform.OS !== "web"}
      >
        <NativeOnlyAnimatedView entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
          <NativeOnlyAnimatedView entering={FadeIn.delay(50)} exiting={FadeOut.duration(150)}>
            <>{children}</>
          </NativeOnlyAnimatedView>
        </NativeOnlyAnimatedView>
      </DialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

function DialogContent({
  children,
  className,
  portalHost,
  ...props
}: DialogPrimitive.ContentProps &
  React.RefAttributes<DialogPrimitive.ContentRef> & {
    portalHost?: string;
  }) {
  return (
    <DialogPortal hostName={portalHost}>
      <DialogOverlay>
        <DialogPrimitive.Content className={dialogContentVariants(className)} {...props}>
          <>{children}</>
          <DialogPrimitive.Close className={dialogCloseButtonVariants()} hitSlop={12}>
            <Icon
              as={X}
              className="text-accent-foreground web:pointer-events-none size-4 shrink-0"
            />
            <Text className="sr-only">Close</Text>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ViewProps) {
  return <View className={dialogHeaderVariants(className)} {...props} />;
}

function DialogFooter({ className, ...props }: ViewProps) {
  return <View className={dialogFooterVariants(className)} {...props} />;
}

function DialogTitle({
  className,
  ...props
}: DialogPrimitive.TitleProps & React.RefAttributes<DialogPrimitive.TitleRef>) {
  return <DialogPrimitive.Title className={dialogTitleVariants(className)} {...props} />;
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.DescriptionProps & React.RefAttributes<DialogPrimitive.DescriptionRef>) {
  return (
    <DialogPrimitive.Description className={dialogDescriptionVariants(className)} {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
