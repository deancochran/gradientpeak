import { Search, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { cn } from "../../lib/cn";
import { Icon } from "../icon/index.native";
import { Input } from "../input/index.native";
import { Spinner } from "../loading/index.native";
import type { SearchFieldProps } from "./shared";

export function getSearchFieldInputClassName({
  className,
  hasValue,
  loading,
}: {
  className?: string;
  hasValue: boolean;
  loading: boolean;
}) {
  return cn("pl-10 pr-10", hasValue && (loading ? "pr-24" : "pr-16"), className);
}

function SearchField({
  accessibilityLabel,
  className,
  clearTestId,
  disabled = false,
  loading = false,
  loadingLabel = "Loading search results",
  maxLength,
  onSubmit,
  onValueChange,
  placeholder,
  testId,
  value,
}: SearchFieldProps) {
  return (
    <View className="relative">
      <View className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
        <Icon as={Search} className="text-muted-foreground" size={18} />
      </View>
      <Input
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ busy: loading, disabled }}
        autoCapitalize="none"
        autoCorrect={false}
        className={getSearchFieldInputClassName({
          hasValue: value.length > 0,
          loading,
          ...(className === undefined ? {} : { className }),
        })}
        editable={!disabled}
        maxLength={maxLength}
        onChangeText={onValueChange}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        returnKeyType="search"
        testId={testId}
        value={value}
      />
      <View className="absolute right-3 top-1/2 flex-row items-center gap-2 -translate-y-1/2">
        {loading ? <Spinner label={loadingLabel} size="small" /> : null}
        {value.length > 0 ? (
          <Pressable
            accessibilityLabel={`Clear ${accessibilityLabel}`}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted disabled:opacity-50"
            disabled={disabled}
            onPress={() => {
              if (!disabled) onValueChange("");
            }}
            testID={clearTestId ?? (testId ? `${testId}-clear` : undefined)}
          >
            <Icon as={X} className="text-muted-foreground" size={18} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export type { SearchFieldProps } from "./shared";
export { SearchField };
