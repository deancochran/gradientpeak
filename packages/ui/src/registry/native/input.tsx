import { Platform, TextInput, useColorScheme, View } from "react-native";
import { cn } from "../../lib/cn";
import { getResolvedNativeTheme } from "../../lib/native-theme";

function Input({ className, ...props }: React.ComponentProps<typeof TextInput>) {
  const theme = getResolvedNativeTheme(useColorScheme());

  return (
    <View
      className={cn(
        "dark:bg-input/30 border-input bg-background min-w-0 rounded-md border shadow-sm shadow-black/5",
        props.editable === false &&
          cn(
            "opacity-50",
            Platform.select({ web: "disabled:pointer-events-none disabled:cursor-not-allowed" }),
          ),
        Platform.select({
          web: cn(
            "selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow]",
            "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          ),
        }),
        className,
      )}
    >
      <TextInput
        {...props}
        cursorColor={props.cursorColor ?? theme.primary}
        placeholderTextColor={props.placeholderTextColor ?? theme.mutedForeground}
        selectionColor={props.selectionColor ?? theme.primary}
        style={[styles.input, { color: theme.foreground }, props.style]}
      />
    </View>
  );
}

const styles = {
  input: {
    fontSize: 16,
    minWidth: 0,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
} as const;

export { Input };
