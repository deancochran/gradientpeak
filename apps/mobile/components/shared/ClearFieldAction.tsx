import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { X } from "lucide-react-native";
import { Pressable } from "react-native";

type ClearFieldActionProps = {
  accessibilityLabel?: string;
  disabled?: boolean;
  label?: string;
  onPress: () => void;
  testID?: string;
  variant?: "chip" | "icon";
};

export function ClearFieldAction({
  accessibilityLabel = "Clear value",
  disabled = false,
  label = "Clear",
  onPress,
  testID,
  variant = "chip",
}: ClearFieldActionProps) {
  if (variant === "icon") {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className="h-8 w-8 items-center justify-center rounded-full bg-muted"
        disabled={disabled}
        onPress={onPress}
        testID={testID}
      >
        <Icon as={X} size={14} className="text-muted-foreground" />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="self-start flex-row items-center gap-1 rounded-full border border-border px-2.5 py-1"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      <Icon as={X} size={12} className="text-muted-foreground" />
      <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
    </Pressable>
  );
}
