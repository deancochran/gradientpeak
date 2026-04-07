import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Text } from "@repo/ui/components/text";
import React, { useCallback, useMemo, useRef } from "react";
import { TouchableOpacity, View } from "react-native";

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
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["40%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  if (!visible) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onClose={onClose}
    >
      <BottomSheetView className="flex-1 gap-3 px-4 pb-8 pt-2" testID="calendar-actions-sheet">
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
      </BottomSheetView>
    </BottomSheet>
  );
}
