import type { RecordingSessionContract } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { buildRecordingBackdropModel } from "./model/recordingBackdropModel";

export interface RecordingBackdropProps {
  recordingState: string;
  service: ActivityRecorderService | null;
  sessionContract: RecordingSessionContract | null;
}

export function RecordingBackdrop({
  recordingState,
  service,
  sessionContract,
}: RecordingBackdropProps) {
  const model = buildRecordingBackdropModel({ service, sessionContract });
  return (
    <View className="absolute inset-0 overflow-hidden bg-background" testID="recording-backdrop">
      {model.shouldRenderMap && model.mapRegion ? (
        <MapView
          key={model.mapKey}
          provider={PROVIDER_DEFAULT}
          style={{ flex: 1 }}
          initialRegion={model.mapRegion}
          mapType="standard"
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass
          showsScale
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          testID="recording-backdrop-map"
        >
          {model.routeCoordinates.length > 1 ? (
            <Polyline
              coordinates={model.routeCoordinates}
              strokeColor="#94a3b8"
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
        </MapView>
      ) : (
        <View className="absolute inset-0 bg-background" />
      )}
      {!model.shouldRenderMap ? (
        <View className="absolute inset-x-0 top-0 px-6 pt-24">
          <View className="max-w-[300px]">
            <View className="mb-5 h-1 w-16 rounded-full bg-muted" />
            <Text className="text-xs font-semibold uppercase tracking-[3px] text-muted-foreground">
              {formatServiceStateLabel(recordingState)} cockpit
            </Text>
            <Text className="mt-3 text-4xl font-black capitalize leading-tight text-foreground">
              {model.copy.label}
            </Text>
            <Text className="mt-3 text-base leading-6 text-muted-foreground">
              {model.copy.description}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function formatServiceStateLabel(state: string) {
  if (state === "recording") return "Recording";
  if (state === "paused") return "Paused";
  if (state === "finishing") return "Finishing";
  return "Ready";
}
