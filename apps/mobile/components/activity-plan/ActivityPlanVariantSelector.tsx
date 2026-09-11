import { Text } from "@repo/ui/components/text";
import { Pressable, View } from "react-native";

export type ActivityPlanVariantOption = {
  id: string;
  name: string;
};

type ActivityPlanVariantSelectorProps = {
  variants: readonly ActivityPlanVariantOption[];
  defaultVariantId: string;
  selectedVariantId: string;
  selection: "default" | "explicit";
  onSelect: (variantId: string | undefined) => void;
  allowCurrentDefault?: boolean;
  label?: string;
  testIDPrefix?: string;
};

export function ActivityPlanVariantSelector({
  variants,
  defaultVariantId,
  selectedVariantId,
  selection,
  onSelect,
  allowCurrentDefault = false,
  label = "Workout variant",
  testIDPrefix = "activity-plan-variant",
}: ActivityPlanVariantSelectorProps) {
  if (variants.length <= 1 && !allowCurrentDefault) return null;

  return (
    <View className="gap-2" testID={`${testIDPrefix}-selector`}>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {allowCurrentDefault ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selection === "default" }}
            className={`min-h-11 justify-center rounded-full border px-3 py-2 ${
              selection === "default"
                ? "border-primary bg-primary/10"
                : "border-border bg-background"
            }`}
            onPress={() => onSelect(undefined)}
            testID={`${testIDPrefix}-current-default`}
          >
            <Text className="text-sm font-medium text-foreground">Use current default</Text>
          </Pressable>
        ) : null}
        {variants.map((variant) => {
          const selected = selection === "explicit" && selectedVariantId === variant.id;
          const detailDefaultSelected =
            !allowCurrentDefault && selection === "default" && defaultVariantId === variant.id;
          const isSelected = selected || detailDefaultSelected;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={`min-h-11 justify-center rounded-full border px-3 py-2 ${
                isSelected ? "border-primary bg-primary/10" : "border-border bg-background"
              }`}
              key={variant.id}
              onPress={() =>
                onSelect(
                  !allowCurrentDefault && variant.id === defaultVariantId ? undefined : variant.id,
                )
              }
              testID={`${testIDPrefix}-${variant.id}`}
            >
              <Text className="text-sm font-medium text-foreground">
                {variant.name}
                {variant.id === defaultVariantId ? " · Default" : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
