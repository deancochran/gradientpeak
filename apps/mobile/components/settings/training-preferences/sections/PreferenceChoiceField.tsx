import { Text } from "@repo/ui/components/text";
import { type Control, type FieldPath, type FieldValues, useController } from "react-hook-form";
import { Pressable, View } from "react-native";

type PreferenceChoice = {
  label: string;
  description: string;
  value: number;
};

type PreferenceChoiceFieldProps<TValues extends FieldValues> = {
  control: Control<TValues>;
  description?: string;
  label: string;
  name: FieldPath<TValues>;
  options: PreferenceChoice[];
  testID: string;
};

export function PreferenceChoiceField<TValues extends FieldValues>({
  control,
  description,
  label,
  name,
  options,
  testID,
}: PreferenceChoiceFieldProps<TValues>) {
  const { field } = useController({ control, name });
  const currentValue = typeof field.value === "number" ? field.value : options[0]?.value;

  return (
    <View className="gap-2" testID={testID}>
      <View className="gap-0.5">
        <Text className="text-sm font-semibold text-foreground">{label}</Text>
        {description ? (
          <Text className="text-xs leading-4 text-muted-foreground">{description}</Text>
        ) : null}
      </View>
      <View className="gap-2">
        {options.map((option) => {
          const selected = currentValue === option.value;
          return (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`rounded-2xl border px-3 py-2 ${
                selected ? "border-primary bg-primary/10" : "border-border bg-background"
              }`}
              onPress={() => field.onChange(option.value)}
              testID={`${testID}-${option.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <Text className="text-sm font-medium text-foreground">{option.label}</Text>
              <Text className="mt-0.5 text-xs leading-4 text-muted-foreground">
                {option.description}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
