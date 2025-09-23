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
import { Alert, View } from "react-native";

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
          <View className="flex-row items-end">
            {(state === "idle" || state === "paused") && (
              <Button
                variant="ghost"
                size="icon"
                onPress={() => router.push("/modals/record/activity_selection")}
              >
                <Icon as={Activity} />
                <Text>{}</Text>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onPress={() => router.push("/modals/record/bluetooth")}
            >
              <Icon as={Bluetooth} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onPress={() => router.push("/modals/record/permissions")}
            >
              <Icon as={MapPinIcon} />
            </Button>
          </View>
        </View>
      </View>

      {/* MAIN CONTENT - State-dependent content */}
      <View className="flex-1">
        {state === "idle" && <Text>Ready to Start</Text>}
        {state === "recording" && <Text>Recording</Text>}
        {state === "paused" && <Text>Paused</Text>}
        {state === "finished" && <Text>Finished</Text>}
      </View>

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
  );
}
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
          <Button onPress={onDiscard} variant="destructive" className="flex-1">
            <Text>Discard</Text>
          </Button>
          <Button onPress={onResume} variant="default" className="flex-1">
            <Text>Resume</Text>
          </Button>
          <Button onPress={onStop} variant="secondary" className="flex-1">
            <Text>Finish</Text>
          </Button>
        </View>
      );

    default:
      return null;
  }
};
