import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { ArrowUpRight, Pencil, Play, Trash2 } from "lucide-react-native";
import React, { useCallback, useMemo, useRef } from "react";
import { TouchableOpacity, View } from "react-native";
import {
  getEventPrimaryMeta,
  getEventSupportingLine,
  getEventTimeLabel,
  getEventTitle,
  isEditableEvent,
} from "@/lib/calendar/eventPresentation";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";

type CalendarEventPreviewSheetProps = {
  event: CalendarEvent | null;
  visible: boolean;
  onClose: () => void;
  onOpenDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
  onStart: (() => void) | null;
};

export function CalendarEventPreviewSheet({
  event,
  visible,
  onClose,
  onOpenDetail,
  onEdit,
  onDelete,
  onMove,
  onStart,
}: CalendarEventPreviewSheetProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["52%"], []);

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

  if (!visible || !event) return null;

  const meta = getEventPrimaryMeta(event);
  const supportingLine = getEventSupportingLine(event);
  const editable = isEditableEvent(event);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onClose={onClose}
    >
      <BottomSheetView
        className="flex-1 gap-4 px-4 pb-8 pt-2"
        testID="calendar-event-preview-sheet"
      >
        <View className="gap-1">
          <Text className="text-lg font-semibold text-foreground">{getEventTitle(event)}</Text>
          <Text className="text-sm text-muted-foreground">{getEventTimeLabel(event)}</Text>
          {meta.length > 0 ? (
            <Text className="text-sm text-muted-foreground">{meta.join(" • ")}</Text>
          ) : null}
          {supportingLine ? (
            <Text className="text-sm text-muted-foreground">{supportingLine}</Text>
          ) : null}
        </View>

        <View className="gap-3">
          {onStart ? (
            <TouchableOpacity
              onPress={onStart}
              className="rounded-2xl bg-primary px-4 py-4"
              activeOpacity={0.85}
              testID="calendar-preview-start"
            >
              <View className="flex-row items-center gap-2">
                <Icon as={Play} size={16} className="text-primary-foreground" />
                <Text className="text-sm font-semibold text-primary-foreground">
                  Start activity
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={onOpenDetail}
            className="rounded-2xl border border-border bg-card px-4 py-4"
            activeOpacity={0.85}
            testID="calendar-preview-open-detail"
          >
            <View className="flex-row items-center gap-2">
              <Icon as={ArrowUpRight} size={16} className="text-foreground" />
              <Text className="text-sm font-semibold text-foreground">Open full detail</Text>
            </View>
          </TouchableOpacity>

          {editable ? (
            <>
              <TouchableOpacity
                onPress={onEdit}
                className="rounded-2xl border border-border bg-card px-4 py-4"
                activeOpacity={0.85}
                testID="calendar-preview-edit"
              >
                <View className="flex-row items-center gap-2">
                  <Icon as={Pencil} size={16} className="text-foreground" />
                  <Text className="text-sm font-semibold text-foreground">Edit event</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onMove}
                className="rounded-2xl border border-border bg-card px-4 py-4"
                activeOpacity={0.85}
                testID="calendar-preview-move"
              >
                <Text className="text-sm font-semibold text-foreground">Move between days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDelete}
                className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-4"
                activeOpacity={0.85}
                testID="calendar-preview-delete"
              >
                <View className="flex-row items-center gap-2">
                  <Icon as={Trash2} size={16} className="text-destructive" />
                  <Text className="text-sm font-semibold text-destructive">Delete event</Text>
                </View>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
