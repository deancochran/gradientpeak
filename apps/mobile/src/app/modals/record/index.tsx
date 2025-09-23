import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { Bluetooth, ChevronDown, MapPinIcon } from "lucide-react-native";
import { Alert, Modal, View } from "react-native";
export default function RecordIndexModal() {
  const {
    state,
    currentActivity,
    metrics,
    permissions,
    bluetoothDevices,
    canDismissModal,
  } = useRecording();

  // Prevent modal dismissal during active recording
  const router = useRouter();
  const handleClose = () => {
    if (canDismissModal) {
      router.back();
    } else {
      Alert.alert(
        "Recording in Progress",
        "Please stop recording before closing",
      );
    }
  };

  return (
    <Modal dismissable={canDismissModal} onRequestClose={handleClose}>
      {/* HEADER SECTION - Status & Quick Info */}
      <View className="bg-background border-b border-border px-4 py-3">
        <View className="flex-row items-center justify-between">
          <Button size="icon" onPress={handleClose} disabled={!canDismissModal}>
            <Icon as={ChevronDown} size={24} />
          </Button>
          <View className="flex-1 items-center">
            <Text className="font-semibold">
              {currentActivity?.name || "Outdoor Run"} {/* Default display */}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {getStateDisplay(state)}
            </Text>
          </View>
          <View className="w-10" /> {/* Spacer for centering */}
        </View>
      </View>

      {/* MAIN CONTENT - State-dependent content */}
      <View className="flex-1">
        {state === "idle" && <IdleStateContent />}
        {state === "recording" && <RecordingStateContent metrics={metrics} />}
        {state === "paused" && <PausedStateContent metrics={metrics} />}
      </View>

      {/* ICON BAR - Quick Access to Sub-modals */}
      <View className="bg-muted/50 px-4 py-3 border-t border-border">
        <View className="flex-row justify-center gap-8">
          <Button
            onPress={() => router.push("/modals/record/activity_selection")}
            className="items-center"
          >
            <View className="w-12 h-12 bg-background rounded-full items-center justify-center">
              <Activity size={20} className="text-foreground" />
            </View>
            <Text className="text-xs mt-1">Activity</Text>
          </Button>

          <Button
            onPress={() => router.push("/modals/record/bluetooth")}
            className="items-center"
          >
            <View className="w-12 h-12 bg-background rounded-full items-center justify-center">
              <Bluetooth
                size={20}
                className={
                  bluetoothDevices.length > 0
                    ? "text-blue-500"
                    : "text-muted-foreground"
                }
              />
            </View>
            <Text className="text-xs mt-1">Devices</Text>
            {bluetoothDevices.length > 0 && (
              <View className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full items-center justify-center">
                <Text className="text-white text-xs">
                  {bluetoothDevices.length}
                </Text>
              </View>
            )}
          </Button>

          <Button
            onPress={() => router.push("/modals/record/permissions")}
            className="items-center"
          >
            <View className="w-12 h-12 bg-background rounded-full items-center justify-center">
              <MapPinIcon
                size={20}
                className={
                  permissions.location ? "text-green-500" : "text-orange-500"
                }
              />
            </View>
            <Text className="text-xs mt-1">GPS</Text>
          </Button>
        </View>
      </View>

      {/* FOOTER CONTROLS - Recording Actions */}
      <View className="bg-background border-t border-border px-4 py-4">
        <RecordingControls
          state={state}
          onStart={() =>
            ActivityRecordingService.startActivity(
              currentActivity?.type || "outdoor_run",
            )
          }
          onPause={() => ActivityRecordingService.pauseActivity()}
          onResume={() => ActivityRecordingService.resumeActivity()}
          onStop={() => ActivityRecordingService.finishActivity()}
          onDiscard={() => ActivityRecordingService.discardActivity()}
        />
      </View>
    </Modal>
  );
}

// State-dependent content components
const IdleStateContent = () => (
  <View className="flex-1 items-center justify-center px-6">
    <Text className="text-2xl font-bold mb-2">Ready to Start</Text>
    <Text className="text-muted-foreground text-center mb-8">
      Configure your activity and devices, then press start to begin recording
    </Text>
  </View>
);

const RecordingStateContent = ({ metrics }) => (
  <View className="flex-1 px-4 py-6">
    <MetricsGrid metrics={metrics} />
    {/* Add map view or other recording-specific UI */}
  </View>
);
