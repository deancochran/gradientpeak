import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Search, SlidersHorizontal, X } from "lucide-react-native";
import type React from "react";
import { TouchableOpacity, View } from "react-native";

interface IndexSearchBarProps {
  value: string;
  placeholder: string;
  hasActiveFilters?: boolean;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onFilterPress: () => void;
  testIDPrefix: string;
}

export function IndexSearchBar({
  value,
  placeholder,
  hasActiveFilters = false,
  onChangeText,
  onClear,
  onFilterPress,
  testIDPrefix,
}: IndexSearchBarProps) {
  return (
    <View className="border-b border-border bg-background px-4 pb-3 pt-3">
      <View className="relative rounded-2xl border border-border bg-card">
        <View className="absolute left-3 top-1/2 z-10 -translate-y-1/2">
          <Icon as={Search} size={18} className="text-muted-foreground" />
        </View>
        <Input
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={80}
          className="h-12 border-0 bg-transparent"
          style={{ paddingLeft: 40, paddingRight: 96 }}
          testID={`${testIDPrefix}-search-input`}
        />
        {value.length > 0 ? (
          <TouchableOpacity
            className="absolute top-1/2 -translate-y-1/2"
            style={{ right: 52 }}
            onPress={onClear}
            activeOpacity={0.8}
            testID={`${testIDPrefix}-search-clear`}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon as={X} size={18} className="text-muted-foreground" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          className={`absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border ${
            hasActiveFilters ? "border-primary bg-primary" : "border-border bg-background"
          }`}
          onPress={onFilterPress}
          activeOpacity={0.85}
          testID={`${testIDPrefix}-filter-button`}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
          accessibilityState={{ selected: hasActiveFilters }}
        >
          <Icon
            as={SlidersHorizontal}
            size={16}
            className={hasActiveFilters ? "text-primary-foreground" : "text-foreground"}
          />
          {hasActiveFilters ? (
            <View
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-background"
              testID={`${testIDPrefix}-filter-button-dot`}
            />
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function FilterChip({
  label,
  isActive,
  onPress,
  testID,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
      className={`rounded-full border px-3 py-2 ${
        isActive ? "border-primary bg-primary/10" : "border-border bg-background"
      }`}
    >
      <Text
        className={`text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2.5 rounded-2xl border border-border/70 bg-card/60 px-3 py-3">
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      {children}
    </View>
  );
}

export function IndexResultsSummary({
  count,
  singularLabel,
  pluralLabel,
  testID,
}: {
  count: number;
  singularLabel: string;
  pluralLabel?: string;
  testID?: string;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <View className="rounded-2xl border border-border bg-muted/20 px-4 py-3" testID={testID}>
      <Text className="text-sm text-muted-foreground">
        {count} {count === 1 ? singularLabel : (pluralLabel ?? `${singularLabel}s`)}
      </Text>
    </View>
  );
}
