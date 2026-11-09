import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { SearchField } from "@repo/ui/components/search-field";
import { Text } from "@repo/ui/components/text";
import { SlidersHorizontal } from "lucide-react-native";
import type React from "react";
import { View } from "react-native";

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
      <View className="flex-row items-center rounded-2xl border border-border bg-card pr-2">
        <View className="flex-1">
          <SearchField
            accessibilityLabel={placeholder}
            className="h-12 border-0 bg-transparent"
            clearTestId={`${testIDPrefix}-search-clear`}
            maxLength={80}
            placeholder={placeholder}
            testId={`${testIDPrefix}-search-input`}
            value={value}
            onValueChange={(nextValue) =>
              nextValue.length === 0 ? onClear() : onChangeText(nextValue)
            }
          />
        </View>
        <Button
          accessibilityLabel="Open filters"
          accessibilityState={{ selected: hasActiveFilters }}
          className={`rounded-full border ${
            hasActiveFilters ? "border-primary bg-primary" : "border-border bg-background"
          }`}
          onPress={onFilterPress}
          role="button"
          size="icon"
          testId={`${testIDPrefix}-filter-button`}
          variant="ghost"
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
        </Button>
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
    <Button
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      {...(testID ? { testId: testID } : {})}
      variant="outline"
      className={`min-h-12 rounded-full border px-3 ${
        isActive ? "border-primary bg-primary/10" : "border-border bg-background"
      }`}
    >
      <Text
        className={`text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </Button>
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
  countKind = "total",
  singularLabel,
  pluralLabel,
  testID,
}: {
  count: number;
  countKind?: "loaded" | "total";
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
        {countKind === "loaded" ? " loaded" : ""}
      </Text>
    </View>
  );
}
