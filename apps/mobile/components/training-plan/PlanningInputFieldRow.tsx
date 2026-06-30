import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { View } from "react-native";

type PlanningInputFieldRowProps = {
  action?: ReactNode;
  children?: ReactNode;
  label: string;
  onClear?: () => void;
  supportingText?: string | null;
};

export function PlanningInputFieldRow({
  action,
  children,
  label,
  onClear,
  supportingText,
}: PlanningInputFieldRowProps) {
  return (
    <View className="gap-2 py-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-sm font-medium text-foreground">{label}</Text>
          {supportingText ? (
            <Text className="text-xs leading-4 text-muted-foreground">{supportingText}</Text>
          ) : null}
        </View>
        {action ??
          (onClear ? (
            <Button size="sm" variant="ghost" onPress={onClear}>
              <Text className="text-xs text-muted-foreground">Clear</Text>
            </Button>
          ) : null)}
      </View>
      {children}
    </View>
  );
}
