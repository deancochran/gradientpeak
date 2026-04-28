import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import type {
  RecordingActivityCategory,
  RecordingQuickAction,
  RecordingSessionContract,
  RecordingState,
} from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { Activity, Bike, CalendarDays, MapPin, Route, Trash2, Watch } from "lucide-react-native";
import React from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RecordingControls } from "@/components/recording/footer";
import type { RecordingSheetSetupItem } from "./model/recordingSheetModel";
import {
  buildRecordingControlSheetModel,
  RECORDING_SHEET_CONTROL_TOP_INSET,
  RECORDING_SHEET_EXPANDED_CONTENT_GAP,
  RECORDING_SHEET_HANDLE_HEIGHT,
} from "./model/recordingSheetModel";

export interface RecordingControlSheetProps {
  activityCategory: RecordingActivityCategory;
  gpsRecordingEnabled: boolean;
  onGpsPress: () => void;
  onOpenActivity: () => void;
  onOpenFtms: () => void;
  onOpenPlan: () => void;
  onOpenRoute: () => void;
  onOpenSensors: () => void;
  onRemovePlan: () => void;
  onRemoveRoute: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onLap: () => void;
  onFinish: () => void;
  recordingState: RecordingState;
  sensorCount: number;
  sessionContract: RecordingSessionContract | null;
}

export function RecordingControlSheet({
  activityCategory,
  gpsRecordingEnabled,
  onGpsPress,
  onOpenActivity,
  onOpenFtms,
  onOpenPlan,
  onOpenRoute,
  onOpenSensors,
  onRemovePlan,
  onRemoveRoute,
  onStart,
  onPause,
  onResume,
  onLap,
  onFinish,
  recordingState,
  sensorCount,
  sessionContract,
}: RecordingControlSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const actionHandlers = React.useMemo(
    () => ({
      onGpsPress,
      onOpenActivity,
      onOpenFtms,
      onOpenPlan,
      onOpenRoute,
      onOpenSensors,
      sessionContract,
    }),
    [
      onGpsPress,
      onOpenActivity,
      onOpenFtms,
      onOpenPlan,
      onOpenRoute,
      onOpenSensors,
      sessionContract,
    ],
  );
  const model = React.useMemo(
    () =>
      buildRecordingControlSheetModel({
        insetsBottom: insets.bottom,
        recordingState,
        sensorCount,
        sessionContract,
        actionHandlers,
      }),
    [actionHandlers, height, insets.bottom, recordingState, sensorCount, sessionContract],
  );

  return (
    <BottomSheet
      index={0}
      snapPoints={model.snapPoints}
      enableDynamicSizing
      enablePanDownToClose={false}
      maxDynamicContentSize={Math.round(height * 0.82)}
      backgroundStyle={{ backgroundColor: "rgba(10, 10, 10, 0.96)" }}
      handleComponent={null}
    >
      <BottomSheetView
        className="flex-1 overflow-hidden border-t border-border bg-background/95 px-4 shadow-2xl"
        style={{
          paddingBottom: Math.max(0, insets.bottom),
        }}
        testID="recording-control-sheet"
      >
        <View
          className="items-center justify-start"
          style={{ height: RECORDING_SHEET_HANDLE_HEIGHT }}
          accessibilityRole="adjustable"
          testID="recording-control-sheet-handle"
        >
          <View className="mt-1 h-1 w-10 rounded-full bg-muted-foreground/60" />
        </View>

        <View style={{ height: RECORDING_SHEET_CONTROL_TOP_INSET }} />

        {recordingState === "not_started" ? (
          <View className="flex-row gap-3">
            <ActivityControlButton
              disabled={Boolean(sessionContract && !sessionContract.editing.canEditActivity)}
              label={formatActivityLabel(activityCategory)}
              onPress={onOpenActivity}
            />
            <View className="flex-1">
              <RecordingControls
                recordingState={recordingState}
                onStart={onStart}
                onPause={onPause}
                onResume={onResume}
                onLap={onLap}
                onFinish={onFinish}
              />
            </View>
          </View>
        ) : (
          <RecordingControls
            recordingState={recordingState}
            onStart={onStart}
            onPause={onPause}
            onResume={onResume}
            onLap={onLap}
            onFinish={onFinish}
          />
        )}

        <View
          className="gap-2"
          style={{ marginTop: RECORDING_SHEET_EXPANDED_CONTENT_GAP }}
          testID="recording-setup-action-rail"
        >
          {model.sections.flatMap((section) =>
            section.items.map((item) => (
              <SetupActionRow
                key={item.id}
                item={item}
                statusLabel={getSetupStatusLabel(item.id, {
                  gpsRecordingEnabled,
                  sensorCount,
                  sessionContract,
                })}
                onRemove={getSetupRemoveHandler(item.id, {
                  onRemovePlan,
                  onRemoveRoute,
                  sessionContract,
                })}
              />
            )),
          )}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

function ActivityControlButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={`Activity: ${label}`}
      className={`h-14 w-28 items-center justify-center rounded-lg border border-border bg-card ${
        disabled ? "opacity-50" : "active:opacity-80"
      }`}
      testID="recording-activity-control-button"
    >
      <Activity size={18} color="#f8fafc" />
      <Text className="mt-0.5 text-xs font-bold capitalize text-foreground" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function SetupActionRow({
  item,
  onRemove,
  statusLabel,
}: {
  item: RecordingSheetSetupItem;
  onRemove?: () => void;
  statusLabel: string;
}) {
  const Icon = getSetupIcon(item.id);
  const isActive = item.tone === "active";
  const isWarning = item.tone === "warning";
  const isLocked = item.tone === "locked";

  return (
    <View
      className={`min-h-16 flex-row overflow-hidden rounded-2xl border ${
        isActive
          ? "border-primary/60 bg-primary/10"
          : isWarning
            ? "border-destructive/50 bg-destructive/10"
            : "border-border bg-card"
      }`}
    >
      <Pressable
        onPress={item.onPress}
        disabled={item.disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: item.disabled, selected: isActive }}
        accessibilityLabel={`${item.title}: ${statusLabel}`}
        accessibilityHint={item.hint}
        className={`flex-1 flex-row items-center gap-3 px-3 py-2 ${
          item.disabled ? "opacity-50" : "active:opacity-80"
        }`}
        testID={item.id === "gps" ? "recording-gps-toggle" : `recording-setup-action-${item.id}`}
      >
        <View
          className={`h-9 w-9 items-center justify-center rounded-full ${
            isActive ? "bg-primary/20" : isWarning ? "bg-destructive/20" : "bg-muted"
          }`}
        >
          <Icon size={18} color={isActive ? "#22c55e" : isWarning ? "#ef4444" : "#f8fafc"} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text numberOfLines={1} className="text-sm font-bold text-foreground">
              {item.title}
            </Text>
            <Text
              numberOfLines={1}
              className={`text-xs font-bold ${
                isActive
                  ? "text-primary"
                  : isWarning
                    ? "text-destructive"
                    : isLocked
                      ? "text-muted-foreground"
                      : "text-muted-foreground"
              }`}
            >
              {statusLabel}
            </Text>
          </View>
          <Text numberOfLines={2} className="mt-0.5 text-xs leading-4 text-muted-foreground">
            {item.detail}
          </Text>
        </View>
      </Pressable>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.title}`}
          className="w-11 items-center justify-center border-l border-border active:opacity-80"
          testID={`recording-setup-remove-${item.id}`}
        >
          <Trash2 size={15} color="#ef4444" />
        </Pressable>
      ) : null}
    </View>
  );
}

function getSetupIcon(id: RecordingQuickAction) {
  switch (id) {
    case "gps":
      return MapPin;
    case "plan":
      return CalendarDays;
    case "route":
      return Route;
    case "trainer":
      return Bike;
    case "sensors":
    default:
      return Watch;
  }
}

function getSetupStatusLabel(
  id: RecordingQuickAction,
  params: {
    gpsRecordingEnabled: boolean;
    sensorCount: number;
    sessionContract: RecordingSessionContract | null;
  },
) {
  switch (id) {
    case "gps":
      return params.gpsRecordingEnabled ? "On" : "Off";
    case "plan":
      return params.sessionContract?.guidance.hasPlan ? "Attached" : "Add";
    case "route":
      return params.sessionContract?.guidance.hasRoute ? "Attached" : "Add";
    case "trainer":
      return params.sessionContract?.devices.trainerControllable ? "Ready" : "Connect";
    case "sensors":
    default:
      return params.sensorCount > 0 ? `${params.sensorCount} linked` : "None";
  }
}

function getSetupRemoveHandler(
  id: RecordingQuickAction,
  params: {
    onRemovePlan: () => void;
    onRemoveRoute: () => void;
    sessionContract: RecordingSessionContract | null;
  },
) {
  if (id === "plan" && params.sessionContract?.guidance.hasPlan) {
    return params.onRemovePlan;
  }

  if (id === "route" && params.sessionContract?.guidance.hasRoute) {
    return params.onRemoveRoute;
  }

  return undefined;
}

function formatActivityLabel(activityCategory: RecordingActivityCategory) {
  return activityCategory.replace(/_/g, " ");
}
