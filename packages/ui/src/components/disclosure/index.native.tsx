import { ChevronDown } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "../icon/index.native";
import { Text } from "../text/index.native";

import type { DisclosureProps } from "./shared";

export type { DisclosureProps } from "./shared";

/** A compact, controlled progressive-disclosure section shared by app forms. */
export function Disclosure({
  children,
  className = "",
  disabled,
  label,
  onOpenChange,
  open,
  testId,
}: DisclosureProps) {
  return (
    <View className={className} testID={testId}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        className="min-h-11 flex-row items-center gap-2 rounded-md px-1 active:bg-muted"
        onPress={() => onOpenChange(!open)}
      >
        <Icon
          as={ChevronDown}
          size={16}
          className="text-muted-foreground"
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
        {typeof label === "string" ? <Text className="text-sm font-medium">{label}</Text> : label}
      </Pressable>
      {open ? <View className="gap-2">{children}</View> : null}
    </View>
  );
}
