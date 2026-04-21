import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { ArrowUpRight, Pencil, Play, Trash2 } from "lucide-react-native";
import React, { useCallback, useMemo, useRef } from "react";
import { TouchableOpacity, View } from "react-native";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { api } from "@/lib/api";
import {
  getEventPrimaryMeta,
  getEventStatusLabel,
  getEventSupportingLine,
  getEventTimeLabel,
  getEventTitle,
  isEditableEvent,
} from "@/lib/calendar/eventPresentation";
import { buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

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
  const navigateTo = useAppNavigate();
  const planned = event?.event_type === "planned";
  const snapPoints = useMemo(() => [planned ? "64%" : "52%"], [planned]);
  const routeId = event?.activity_plan?.route_id;
  const { data: route } = api.routes.get.useQuery(
    { id: routeId! },
    { enabled: !!routeId && !!event },
  );

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
  const statusLabel = getEventStatusLabel(event);
  const editable = isEditableEvent(event);
  const canOpenDetail =
    buildOpenEventRoute({
      id: event.id,
      event_type: event.event_type === null ? undefined : (event.event_type as any),
    }) !== null;

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
        className="flex-1 gap-3 px-4 pb-8 pt-2"
        testID="calendar-event-preview-sheet"
      >
        <View className="gap-1.5">
          <Text className="text-lg font-semibold text-foreground">{getEventTitle(event)}</Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-sm text-muted-foreground">{getEventTimeLabel(event)}</Text>
            {statusLabel ? (
              <View className="rounded-full bg-muted px-2 py-1">
                <Text className="text-[11px] font-medium text-muted-foreground">{statusLabel}</Text>
              </View>
            ) : null}
          </View>
          {meta.length > 0 ? (
            <Text className="text-sm text-muted-foreground">{meta.join(" • ")}</Text>
          ) : null}
          {supportingLine ? (
            <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={2}>
              {supportingLine}
            </Text>
          ) : null}
        </View>

        {planned && event.activity_plan ? (
          <ActivityPlanContentPreview
            size="medium"
            plan={event.activity_plan}
            route={route}
            onRoutePress={
              routeId
                ? () =>
                    navigateTo({
                      pathname: "/(internal)/(standard)/route-detail",
                      params: { id: routeId },
                    } as never)
                : null
            }
            intensityFactor={event.activity_plan.intensity_factor ?? null}
            tss={event.activity_plan.estimated_tss ?? null}
            testIDPrefix="calendar-preview-plan"
          />
        ) : null}

        <View className="gap-2.5 pt-1">
          {onStart ? (
            <TouchableOpacity
              onPress={onStart}
              className="flex-row items-center gap-2 rounded-2xl bg-primary px-4 py-4"
              activeOpacity={0.85}
              testID="calendar-preview-start"
            >
              <Icon as={Play} size={16} className="text-primary-foreground" />
              <Text className="text-sm font-semibold text-primary-foreground">Start activity</Text>
            </TouchableOpacity>
          ) : null}

          {canOpenDetail ? (
            <TouchableOpacity
              onPress={onOpenDetail}
              className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-4 py-4"
              activeOpacity={0.85}
              testID="calendar-preview-open-detail"
            >
              <Icon as={ArrowUpRight} size={16} className="text-foreground" />
              <Text className="text-sm font-semibold text-foreground">Open full detail</Text>
            </TouchableOpacity>
          ) : null}

          {editable ? (
            <>
              <TouchableOpacity
                onPress={onEdit}
                className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-4 py-4"
                activeOpacity={0.85}
                testID="calendar-preview-edit"
              >
                <Icon as={Pencil} size={16} className="text-foreground" />
                <Text className="text-sm font-semibold text-foreground">Edit event</Text>
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
                className="flex-row items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-4"
                activeOpacity={0.85}
                testID="calendar-preview-delete"
              >
                <Icon as={Trash2} size={16} className="text-destructive" />
                <Text className="text-sm font-semibold text-destructive">Delete event</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
