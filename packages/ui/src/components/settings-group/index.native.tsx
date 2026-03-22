import type { ReactNode } from "react";
import * as React from "react";

import { View } from "../../lib/react-native";
import { Button } from "../button/index.native";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../card/index.native";
import { Separator } from "../separator/index.native";
import { Switch } from "../switch/index.native";
import { Text } from "../text/index.native";

interface SettingsGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
  testID?: string;
}

export function SettingsGroup({ title, description, children, testID }: SettingsGroupProps) {
  return (
    <Card className="bg-card border-border" testId={testID}>
      <CardHeader className="pb-4">
        <CardTitle className="text-card-foreground">{title}</CardTitle>
        {description ? (
          <CardDescription className="text-muted-foreground">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="gap-4">{children}</CardContent>
    </Card>
  );
}

interface SettingItemProps {
  label: string;
  description?: string;
  testID?: string;
}

interface ToggleSettingItemProps extends SettingItemProps {
  type: "toggle";
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

interface ButtonSettingItemProps extends SettingItemProps {
  type: "button";
  buttonLabel: string;
  onPress: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  disabled?: boolean;
}

interface LinkSettingItemProps extends SettingItemProps {
  type: "link";
  linkLabel: string;
  onPress: () => void;
}

interface CustomSettingItemProps extends SettingItemProps {
  type: "custom";
  children: ReactNode;
}

type SettingItemPropsUnion =
  | ToggleSettingItemProps
  | ButtonSettingItemProps
  | LinkSettingItemProps
  | CustomSettingItemProps;

export function SettingItem(props: SettingItemPropsUnion) {
  const { label, description, testID } = props;

  const renderControl = () => {
    switch (props.type) {
      case "toggle":
        return (
          <Switch
            checked={props.value}
            onCheckedChange={props.onValueChange}
            disabled={props.disabled}
            testId={testID ? `${testID}-switch` : undefined}
          />
        );
      case "button":
        return (
          <Button
            variant={props.variant || "outline"}
            size="sm"
            onPress={props.onPress}
            disabled={props.disabled}
            testId={testID ? `${testID}-button` : undefined}
          >
            <Text>{props.buttonLabel}</Text>
          </Button>
        );
      case "link":
        return (
          <Button
            variant="link"
            onPress={props.onPress}
            className="self-start p-0"
            testId={testID ? `${testID}-link` : undefined}
          >
            <Text className="text-primary">{props.linkLabel}</Text>
          </Button>
        );
      case "custom":
        return props.children;
    }
  };

  return (
    <View className="flex-row items-center justify-between" testID={testID}>
      <View className="flex-1">
        <Text className="text-foreground font-medium">{label}</Text>
        {description ? <Text className="text-muted-foreground text-sm">{description}</Text> : null}
      </View>
      {props.type !== "link" ? <View className="ml-3">{renderControl()}</View> : null}
      {props.type === "link" ? renderControl() : null}
    </View>
  );
}

export function SettingItemSeparator({ className }: { className?: string } = {}) {
  return <Separator className={`bg-border ${className || ""}`} />;
}
