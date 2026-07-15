import { Search, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { cn } from "../../lib/cn";
import { Icon } from "../icon/index.native";
import { Input } from "../input/index.native";
import { Spinner } from "../loading/index.native";
import type { SearchFieldProps } from "./shared";

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
        className={cn("pl-10 pr-10", loading && value.length > 0 && "pr-16", className)}
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
            className="h-5 w-5 items-center justify-center disabled:opacity-50"
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
