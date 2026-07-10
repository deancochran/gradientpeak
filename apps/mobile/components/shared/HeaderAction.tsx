import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { cn } from "@repo/ui/lib/cn";
import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable } from "react-native";

interface HeaderActionProps {
  accessibilityLabel?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  testID?: string;
}

interface HeaderTextActionProps extends HeaderActionProps {
  label: string;
}

interface HeaderIconActionProps extends HeaderActionProps {
  icon: LucideIcon;
}

export function HeaderTextAction({
  accessibilityLabel,
  className,
  disabled = false,
  label,
  loading = false,
  onPress,
  testID,
}: HeaderTextActionProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      className={cn("mr-2 rounded-full px-2 py-1", className)}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="small" className="h-5 w-5 text-primary" />
      ) : (
        <Text className="text-sm font-medium text-primary">{label}</Text>
      )}
    </Pressable>
  );
}

export function HeaderIconAction({
  accessibilityLabel,
  className,
  disabled = false,
  icon,
  loading = false,
  onPress,
  testID,
}: HeaderIconActionProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      className={cn("mr-2 h-10 w-10 items-center justify-center", className)}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="small" className="text-primary" />
      ) : (
        <Icon as={icon} size={24} className="text-primary" />
      )}
    </Pressable>
  );
}
