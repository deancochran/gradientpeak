import { Text } from "@repo/ui/components/text";
import { TouchableOpacity, View } from "react-native";
import { AppBottomSheet } from "@/components/shared/AppBottomSheet";

type CalendarActionsSheetProps = {
  visible: boolean;
  selectedDate: string;
  onClose: () => void;
  onCreatePlanned: () => void;
  onCreateRaceTarget: () => void;
  onCreateCustom: () => void;
};

export function CalendarActionsSheet({
  visible,
  selectedDate,
  onClose,
  onCreatePlanned,
  onCreateRaceTarget,
  onCreateCustom,
}: CalendarActionsSheetProps) {
  return (
    <AppBottomSheet
      initialSnapIndex={0}
      onClose={onClose}
      showTitleHeader={false}
      snapPoints={["40%"]}
      testID="calendar-actions-sheet"
      title="Calendar actions"
      visible={visible}
    >
      <View className="gap-3">
        <View className="gap-1">
          <Text className="text-lg font-semibold text-foreground">Calendar actions</Text>
          <Text className="text-sm text-muted-foreground">
            Create from {selectedDate} without crowding the screen.
          </Text>
        </View>

        {[
          ["Planned activity", onCreatePlanned, "create-type-planned"],
          ["Race target", onCreateRaceTarget, "create-type-race-target"],
          ["Custom event", onCreateCustom, "create-type-custom"],
        ].map(([label, onPress, testID]) => (
          <TouchableOpacity
            key={String(testID)}
            onPress={onPress as () => void}
            className="rounded-2xl border border-border bg-card px-4 py-4"
            activeOpacity={0.85}
            testID={String(testID)}
          >
            <Text className="text-sm font-semibold text-foreground">{label as string}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </AppBottomSheet>
  );
}
