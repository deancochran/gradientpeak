import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Search, X } from "lucide-react-native";
import type { ComponentProps } from "react";
import { TouchableOpacity, View } from "react-native";

type SearchFieldProps = Omit<
  ComponentProps<typeof Input>,
  "accessibilityLabel" | "onChangeText" | "placeholder" | "testId" | "value"
> & {
  accessibilityLabel: string;
  onChangeText: (value: string) => void;
  onClear?: () => void;
  placeholder: string;
  testID?: string;
  value: string;
};

export function SearchField({
  accessibilityLabel,
  className,
  onChangeText,
  onClear,
  placeholder,
  style,
  testID,
  value,
  ...inputProps
}: SearchFieldProps) {
  const canClear = value.length > 0 && onClear;

  return (
    <View className="relative">
      <View className="absolute left-3 top-3 z-10">
        <Icon as={Search} size={18} className="text-muted-foreground" />
      </View>
      <Input
        {...inputProps}
        accessibilityLabel={accessibilityLabel}
        className={className}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={[{ paddingLeft: 40, paddingRight: canClear ? 40 : undefined }, style]}
        testId={testID}
        value={value}
      />
      {canClear ? (
        <TouchableOpacity
          accessibilityLabel={`Clear ${accessibilityLabel}`}
          accessibilityRole="button"
          activeOpacity={0.8}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          onPress={onClear}
          testID={testID ? `${testID}-clear` : undefined}
        >
          <Icon as={X} size={18} className="text-muted-foreground" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
