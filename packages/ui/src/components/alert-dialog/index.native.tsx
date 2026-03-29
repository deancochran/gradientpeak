import * as AlertDialogPrimitive from "@rn-primitives/alert-dialog";
import * as React from "react";
import { Platform, View, type ViewProps } from "react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens";

import { cn } from "../../lib/cn";
import { NativeOnlyAnimatedView } from "../../lib/native-only-animated-view";
import { getNativeTestProps } from "../../lib/test-props";
import { buttonTextVariants, buttonVariants } from "../button/index.native";
import { TextClassContext } from "../text/context";
import type { AlertDialogContentTestProps } from "./shared";

function alertDialogOverlayVariants(className?: string) {
  return cn(
    "absolute bottom-0 left-0 right-0 top-0 z-50 fixed items-center justify-center bg-black/50 p-2 animate-in fade-in-0",
    className,
  );
}

function alertDialogContentVariants(className?: string) {
  return cn(
    "bg-background border-border z-50 flex w-full max-w-[calc(100%-2rem)] flex-col gap-4 rounded-lg border p-6 shadow-lg shadow-black/5 animate-in fade-in-0 zoom-in-95 duration-200 sm:max-w-lg",
    className,
  );
}

function alertDialogHeaderVariants(className?: string) {
  return cn("flex flex-col gap-2 text-center sm:text-left", className);
}

function alertDialogFooterVariants(className?: string) {
  return cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className);
}

function alertDialogTitleVariants(className?: string) {
  return cn("text-foreground text-lg font-semibold", className);
}

function alertDialogDescriptionVariants(className?: string) {
  return cn("text-muted-foreground text-sm", className);
}

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;
const FullWindowOverlay = Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment;

function AlertDialogOverlay({
  children,
  className,
  ...props
}: Omit<AlertDialogPrimitive.OverlayProps, "asChild"> &
  React.RefAttributes<AlertDialogPrimitive.OverlayRef> & {
    children?: React.ReactNode;
  }) {
  return (
    <FullWindowOverlay>
      <AlertDialogPrimitive.Overlay className={alertDialogOverlayVariants(className)} {...props}>
        <NativeOnlyAnimatedView
          entering={FadeIn.duration(200).delay(50)}
          exiting={FadeOut.duration(150)}
        >
          <>{children}</>
        </NativeOnlyAnimatedView>
      </AlertDialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

function AlertDialogContent({
  accessibilityLabel,
  className,
  id,
  portalHost,
  testId,
  ...props
}: AlertDialogPrimitive.ContentProps &
  React.RefAttributes<AlertDialogPrimitive.ContentRef> & {
    portalHost?: string;
  } & AlertDialogContentTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay>
        <AlertDialogPrimitive.Content
          className={alertDialogContentVariants(className)}
          {...nativeTestProps}
          {...props}
        />
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
  return (
    <TextClassContext.Provider value="text-center sm:text-left">
      <View className={alertDialogHeaderVariants(className)} {...props} />
    </TextClassContext.Provider>
  );
}

function AlertDialogFooter({ className, ...props }: ViewProps) {
  return <View className={alertDialogFooterVariants(className)} {...props} />;
}

function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.TitleProps & React.RefAttributes<AlertDialogPrimitive.TitleRef>) {
  return <AlertDialogPrimitive.Title className={alertDialogTitleVariants(className)} {...props} />;
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.DescriptionProps &
  React.RefAttributes<AlertDialogPrimitive.DescriptionRef>) {
  return (
    <AlertDialogPrimitive.Description
      className={alertDialogDescriptionVariants(className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: AlertDialogPrimitive.ActionProps & React.RefAttributes<AlertDialogPrimitive.ActionRef>) {
  return (
    <TextClassContext.Provider value={buttonTextVariants()}>
      <AlertDialogPrimitive.Action className={buttonVariants({ className })} {...props} />
    </TextClassContext.Provider>
  );
}

function AlertDialogCancel({
  className,
  ...props
}: AlertDialogPrimitive.CancelProps & React.RefAttributes<AlertDialogPrimitive.CancelRef>) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant: "outline" })}>
      <AlertDialogPrimitive.Cancel
        className={buttonVariants({ className, variant: "outline" })}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
