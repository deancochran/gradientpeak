import type {
  RecordingActivityCategory,
  RecordingSessionContract,
  RecordingState,
} from "@repo/core";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { getRecordingControlSheetCollapsedHeight } from "./model/recordingSheetModel";
import { RecordingBackdrop } from "./RecordingBackdrop";
import { RecordingControlSheet, type RecordingControlSheetProps } from "./RecordingControlSheet";
import { RecordingFloatingPanel } from "./RecordingFloatingPanel";

export interface RecordingLiveCockpitProps extends RecordingControlSheetProps {
  activityCategory: RecordingActivityCategory;
  gpsRecordingEnabled: boolean;
  hasPlan: boolean;
  sensorCount: number;
  service: ActivityRecorderService | null;
  serviceState: string;
  recordingState: RecordingState;
  sessionContract: RecordingSessionContract | null;
}

export function RecordingLiveCockpit({
  activityCategory,
  gpsRecordingEnabled,
  hasPlan,
  sensorCount,
  service,
  serviceState,
  sessionContract,
  ...controlProps
}: RecordingLiveCockpitProps) {
  const insets = useSafeAreaInsets();
  const bottomObstructionHeight = React.useMemo(
    () =>
      getRecordingControlSheetCollapsedHeight({
        insetsBottom: insets.bottom,
        recordingState: controlProps.recordingState,
      }),
    [controlProps.recordingState, insets.bottom],
  );

  return (
    <View className="flex-1" testID="recording-live-cockpit">
      <RecordingBackdrop
        recordingState={serviceState}
        service={service}
        sessionContract={sessionContract}
      />

      <RecordingFloatingPanel
        hasPlan={hasPlan}
        bottomObstructionHeight={bottomObstructionHeight}
        sensorCount={sensorCount}
        service={service}
        sessionContract={sessionContract}
      />

      <View className="absolute inset-x-0 bottom-0 top-0" pointerEvents="box-none">
        <RecordingControlSheet
          activityCategory={activityCategory}
          gpsRecordingEnabled={gpsRecordingEnabled}
          sensorCount={sensorCount}
          sessionContract={sessionContract}
          {...controlProps}
        />
      </View>
    </View>
  );
}
