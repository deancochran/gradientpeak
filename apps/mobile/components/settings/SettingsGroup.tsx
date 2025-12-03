import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { ReactNode } from "react";
import { View } from "react-native";

interface SettingsGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
  testID?: string;
}

export function SettingsGroup({ title, description, children, testID }: SettingsGroupProps) {
  return (
    <Card className="bg-card border-border" testID={testID}>
      <CardHeader className="pb-4">
        <CardTitle className="text-card-foreground">{title}</CardTitle>
        {description && <CardDescription className="text-muted-foreground">{description}</CardDescription>}
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
            testID={`${testID}-switch`}
          />
        );

      case "button":
        return (
          <Button
            variant={props.variant || "outline"}
            size="sm"
            onPress={props.onPress}
            disabled={props.disabled}
            testID={`${testID}-button`}
          >
            <Text>{props.buttonLabel}</Text>
          </Button>
        );

      case "link":
        return (
          <Button variant="link" onPress={props.onPress} className="self-start p-0" testID={`${testID}-link`}>
            <Text className="text-primary">{props.linkLabel}</Text>
          </Button>
        );

      case "custom":
        return props.children;

      default:
        return null;
    }
  };

  return (
    <View className="flex-row items-center justify-between" testID={testID}>
      <View className="flex-1">
        <Text className="text-foreground font-medium">{label}</Text>
        {description && <Text className="text-muted-foreground text-sm">{description}</Text>}
      </View>
      {props.type !== "link" && <View className="ml-3">{renderControl()}</View>}
      {props.type === "link" && renderControl()}
    </View>
  );
}

interface SettingItemSeparatorProps {
  className?: string;
}

export function SettingItemSeparator({ className }: SettingItemSeparatorProps = {}) {
  return <Separator className={`bg-border ${className || ""}`} />;
}
