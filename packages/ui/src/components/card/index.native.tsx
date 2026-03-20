import * as React from "react";
import { View, type ViewProps } from "../../lib/react-native";

import { cn } from "../../lib/cn";
import { getNativeTestProps } from "../../lib/test-props";
import { Text } from "../text/index.native";
import { TextClassContext } from "../text/context";
import type { CardClassNameOptions } from "./shared";

function cardRootClasses(className?: string) {
  return cn(
    "bg-card text-card-foreground border-border flex flex-col gap-6 rounded-xl border py-6 shadow-sm shadow-black/5",
    className,
  );
}

function cardHeaderClasses(className?: string) {
  return cn("flex flex-col gap-1.5 px-6", className);
}

function cardTitleClasses(className?: string) {
  return cn("font-semibold leading-none", className);
}

function cardDescriptionClasses(className?: string) {
  return cn("text-muted-foreground text-sm", className);
}

function cardContentClasses(className?: string) {
  return cn("px-6", className);
}

function cardFooterClasses(className?: string) {
  return cn("flex flex-row items-center px-6", className);
}

function Card({
  accessibilityLabel,
  className,
  id,
  role,
  testId,
  ...props
}: ViewProps & React.RefAttributes<View> & CardClassNameOptions) {
  const nativeTestProps = getNativeTestProps({
    accessibilityLabel,
    id,
    role,
    testId,
  }) as Pick<ViewProps, "accessibilityLabel" | "nativeID" | "role" | "testID">;

  return (
    <TextClassContext.Provider value="text-card-foreground">
      <View
        className={cardRootClasses(className)}
        {...nativeTestProps}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function CardHeader({
  className,
  ...props
}: ViewProps & React.RefAttributes<View>) {
  return <View className={cardHeaderClasses(className)} {...props} />;
}

function CardTitle({
  className,
  ...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<Text>) {
  return (
    <Text
      aria-level={3}
      className={cardTitleClasses(className)}
      role="heading"
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<Text>) {
  return <Text className={cardDescriptionClasses(className)} {...props} />;
}

function CardContent({
  className,
  ...props
}: ViewProps & React.RefAttributes<View>) {
  return <View className={cardContentClasses(className)} {...props} />;
}

function CardFooter({
  className,
  ...props
}: ViewProps & React.RefAttributes<View>) {
  return <View className={cardFooterClasses(className)} {...props} />;
}

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
