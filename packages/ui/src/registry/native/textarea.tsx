import { Platform, TextInput, View } from "react-native";
import { cn } from "../../lib/cn";

function Textarea({
  className,
  multiline = true,
  numberOfLines = Platform.select({ web: 2, native: 8 }), // On web, numberOfLines also determines initial height. On native, it determines the maximum height.
  placeholderClassName,
  ...props
}: React.ComponentProps<typeof TextInput>) {
  return (
    <View
      className={cn(
        "border-input dark:bg-input/30 min-h-16 w-full rounded-md border bg-transparent shadow-sm shadow-black/5",
        Platform.select({
          web: "field-sizing-content resize-y outline-none transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive focus-within:ring-[3px] disabled:cursor-not-allowed",
        }),
        props.editable === false && "opacity-50",
        className,
      )}
    >
      <TextInput
        {...props}
        style={[styles.textarea, props.style]}
        multiline={multiline}
        numberOfLines={numberOfLines}
        textAlignVertical="top"
      />
    </View>
  );
}

const styles = {
  textarea: {
    fontSize: 16,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
} as const;

export { Textarea };
