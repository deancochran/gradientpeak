import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useEnhancedActivityRecording } from "@/lib/hooks/useEnhancedActivityRecording";
import { useRouter } from "expo-router";
import {
  Activity,
  Bluetooth,
  ChevronDown,
  MapPinIcon,
} from "lucide-react-native";
import { Alert, Modal, View } from "react-native";

// ===== ENHANCED MODAL WITH SERVICE INTEGRATION =====
export default function RecordIndexModal() {
  const {
    state,
    currentRecording,
    metrics,
    connectionStatus,
    canDismissModal,
    isRecording,
    isPaused,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
  } = useEnhancedActivityRecording();

  const router = useRouter();

  // ===== MODAL LOCK BEHAVIOR - Prevent dismissal during active recording =====
  const handleClose = () => {
    if (canDismissModal) {
      router.back();
    } else {
      Alert.alert(
        "Recording in Progress",
        "Please stop or pause your recording before closing this screen.",
        [{ text: "OK" }],
      );
    }
  };

  // ===== STATE DISPLAY HELPER =====
  const getStateDisplay = (currentState: string): string => {
    switch (currentState) {
      case "idle":
        return "Ready to record";
      case "recording":
        return "Recording active";
      case "paused":
        return "Recording paused";
      case "finished":
        return "Recording finished";
      default:
        return "Unknown state";
    }
  };

  // ===== ENHANCED RECORDING CONTROLS =====
  const handleStartRecording = async () => {
    const success = await startRecording("outdoor_run"); // Default to outdoor run
    if (!success) {
      Alert.alert(
        "Error",
        "Failed to start recording. Please check permissions and try again.",
      );
    }
  };

  const handleStopRecording = async () => {
    Alert.alert(
      "Stop Recording?",
      "Are you sure you want to stop recording? This will save your activity.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop & Save",
          style: "destructive",
          onPress: async () => {
            const result = await stopRecording();
            if (result) {
              Alert.alert("Success", "Activity saved successfully!");
            }
          },
        },
      ],
    );
  };

  const handleDiscardRecording = async () => {
    Alert.alert(
      "Discard Recording?",
      "Are you sure you want to discard this recording? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            await discardRecording();
            Alert.alert("Discarded", "Recording has been discarded.");
          },
        },
      ],
    );
  };

  return (
    <Modal presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View className="flex-1 bg-background">
        {/* HEADER SECTION - Status & Quick Info */}
        <View className="bg-background border-b border-border px-4 py-3">
          <View className="flex-row items-center justify-between">
            <Button
              size="icon"
              variant="ghost"
              onPress={handleClose}
              disabled={!canDismissModal}
            >
              <Icon as={ChevronDown} size={24} />
            </Button>
            <View className="flex-1 items-center">
              <Text className="font-semibold">
                {currentRecording?.activityType || "Activity Recording"}
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
          {state === "idle" && (
            <IdleStateContent onStartRecording={handleStartRecording} />
          )}
          {state === "recording" && <RecordingStateContent metrics={metrics} />}
          {state === "paused" && <PausedStateContent metrics={metrics} />}
          {state === "finished" && <FinishedStateContent metrics={metrics} />}
        </View>

        {/* ICON BAR - Quick Access to Sub-modals (only show when not recording) */}
        {(state === "idle" || state === "paused") && (
          <View className="bg-muted/50 px-4 py-3 border-t border-border">
            <View className="flex-row justify-center gap-8">
              <Button
                variant="ghost"
                onPress={() => router.push("/modals/record/activity_selection")}
                className="items-center"
              >
                <View className="w-12 h-12 bg-background rounded-full items-center justify-center">
                  <Activity size={20} className="text-foreground" />
                </View>
                <Text className="text-xs mt-1">Activity</Text>
              </Button>

              <Button
                variant="ghost"
                onPress={() => router.push("/modals/record/bluetooth")}
                className="items-center"
              >
                <View className="w-12 h-12 bg-background rounded-full items-center justify-center">
                  <Bluetooth
                    size={20}
                    className={
                      connectionStatus.bluetooth === "connected"
                        ? "text-blue-500"
                        : "text-muted-foreground"
                    }
                  />
                </View>
                <Text className="text-xs mt-1">Devices</Text>
                {connectionStatus.bluetooth === "connected" && (
                  <View className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full items-center justify-center">
                    <Text className="text-white text-xs">1</Text>
                  </View>
                )}
              </Button>

              <Button
                variant="ghost"
                onPress={() => router.push("/modals/record/permissions")}
                className="items-center"
              >
                <View className="w-12 h-12 bg-background rounded-full items-center justify-center">
                  <MapPinIcon
                    size={20}
                    className={
                      connectionStatus.gps === "connected"
                        ? "text-green-500"
                        : connectionStatus.gps === "connecting"
                          ? "text-yellow-500"
                          : "text-orange-500"
                    }
                  />
                </View>
                <Text className="text-xs mt-1">GPS</Text>
              </Button>
            </View>
          </View>
        )}

        {/* FOOTER CONTROLS - Recording Actions */}
        <View className="bg-background border-t border-border px-4 py-4">
          <RecordingControls
            state={state}
            onStart={handleStartRecording}
            onPause={pauseRecording}
            onResume={resumeRecording}
            onStop={handleStopRecording}
            onDiscard={handleDiscardRecording}
          />
        </View>
      </View>
    </Modal>
  );
}

// ===== STATE-DEPENDENT CONTENT COMPONENTS =====
const IdleStateContent = ({
  onStartRecording,
}: {
  onStartRecording: () => void;
}) => (
  <View className="flex-1 items-center justify-center px-6">
    <Text className="text-2xl font-bold mb-2">Ready to Start</Text>
    <Text className="text-muted-foreground text-center mb-8">
      Configure your activity and devices, then press start to begin recording
    </Text>
    <Button onPress={onStartRecording} className="mt-4">
      <Text>Start Recording</Text>
    </Button>
  </View>
);

const RecordingStateContent = ({ metrics }: { metrics: any }) => (
  <View className="flex-1 px-4 py-6">
    <MetricsGrid metrics={metrics} />
    <View className="mt-4 p-4 bg-green-50 rounded-lg">
      <Text className="text-green-800 font-medium">🔴 Recording Active</Text>
      <Text className="text-green-600 text-sm mt-1">
        Your activity is being tracked. GPS and sensors are recording data.
      </Text>
    </View>
  </View>
);

const PausedStateContent = ({ metrics }: { metrics: any }) => (
  <View className="flex-1 px-4 py-6">
    <MetricsGrid metrics={metrics} />
    <View className="mt-4 p-4 bg-yellow-50 rounded-lg">
      <Text className="text-yellow-800 font-medium">⏸️ Recording Paused</Text>
      <Text className="text-yellow-600 text-sm mt-1">
        Recording is paused. Timer is stopped but data is preserved.
      </Text>
    </View>
  </View>
);

const FinishedStateContent = ({ metrics }: { metrics: any }) => (
  <View className="flex-1 px-4 py-6">
    <MetricsGrid metrics={metrics} />
    <View className="mt-4 p-4 bg-blue-50 rounded-lg">
      <Text className="text-blue-800 font-medium">✅ Recording Complete</Text>
      <Text className="text-blue-600 text-sm mt-1">
        Your activity has been recorded and saved successfully.
      </Text>
    </View>
  </View>
);

// ===== RECORDING CONTROLS COMPONENT =====
const RecordingControls = ({
  state,
  onStart,
  onPause,
  onResume,
  onStop,
  onDiscard,
}: {
  state: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDiscard: () => void;
}) => {
  switch (state) {
    case "idle":
      return (
        <Button onPress={onStart} className="w-full">
          <Text>Start Recording</Text>
        </Button>
      );

    case "recording":
      return (
        <View className="flex-row gap-2">
          <Button onPress={onPause} variant="secondary" className="flex-1">
            <Text>Pause</Text>
          </Button>
          <Button onPress={onStop} variant="destructive" className="flex-1">
            <Text>Stop</Text>
          </Button>
        </View>
      );

    case "paused":
      return (
        <View className="flex-row gap-2">
          <Button onPress={onResume} variant="default" className="flex-1">
            <Text>Resume</Text>
          </Button>
          <Button onPress={onStop} variant="secondary" className="flex-1">
            <Text>Stop</Text>
          </Button>
          <Button onPress={onDiscard} variant="destructive" className="flex-1">
            <Text>Discard</Text>
          </Button>
        </View>
      );

    case "finished":
      return (
        <Button
          onPress={() => {}}
          variant="secondary"
          className="w-full"
          disabled
        >
          <Text>Recording Complete</Text>
        </Button>
      );

    default:
      return null;
  }
};

// ===== METRICS GRID PLACEHOLDER =====
const MetricsGrid = ({ metrics }: { metrics: any }) => (
  <View className="grid grid-cols-2 gap-4">
    <View className="bg-card rounded-lg p-4">
      <Text className="text-sm text-muted-foreground">Duration</Text>
      <Text className="text-2xl font-bold">
        {Math.floor(metrics.duration / 60)}:
        {(metrics.duration % 60).toString().padStart(2, "0")}
      </Text>
    </View>
    <View className="bg-card rounded-lg p-4">
      <Text className="text-sm text-muted-foreground">Distance</Text>
      <Text className="text-2xl font-bold">
        {((metrics.distance || 0) / 1000).toFixed(2)} km
      </Text>
    </View>
    <View className="bg-card rounded-lg p-4">
      <Text className="text-sm text-muted-foreground">Speed</Text>
      <Text className="text-2xl font-bold">
        {(metrics.currentSpeed || 0).toFixed(1)} m/s
      </Text>
    </View>
    <View className="bg-card rounded-lg p-4">
      <Text className="text-sm text-muted-foreground">Heart Rate</Text>
      <Text className="text-2xl font-bold">
        {metrics.heartRate || "--"} bpm
      </Text>
    </View>
  </View>
);
