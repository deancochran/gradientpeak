import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { ActivityIndicator, View } from "react-native";

type DetailLoadingStateProps = {
  label: string;
  testID?: string;
};

type DetailNotFoundStateProps = {
  actionLabel?: string;
  description?: string;
  onActionPress?: () => void;
  testID?: string;
  title: string;
};

export function DetailLoadingState({ label, testID }: DetailLoadingStateProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background" testID={testID}>
      <ActivityIndicator size="large" />
      <Text className="mt-3 text-sm text-muted-foreground">{label}</Text>
    </View>
  );
}

export function DetailNotFoundState({
  actionLabel = "Go Back",
  description,
  onActionPress,
  testID,
  title,
}: DetailNotFoundStateProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6" testID={testID}>
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {description ? (
        <Text className="mt-2 text-center text-sm text-muted-foreground">{description}</Text>
      ) : null}
      {onActionPress ? (
        <Button className="mt-4" onPress={onActionPress}>
          <Text className="text-primary-foreground">{actionLabel}</Text>
        </Button>
      ) : null}
    </View>
  );
}
