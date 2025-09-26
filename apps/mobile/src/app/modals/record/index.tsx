import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useActivityRecorder } from "@/lib/hooks/useActivityRecorder";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "expo-router";
import {
  Activity,
  Bluetooth,
  ChevronDown,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Alert, ScrollView, View } from "react-native";

// Utility functions for formatting metrics
const formatDuration = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
};

const formatSpeed = (kmh: number): string => {
  return `${kmh.toFixed(1)} km/h`;
};

export default function RecordIndexModal() {
  const { profile } = useRequireAuth();

  const {
    state,
    metrics,
    connectionStatus,
    connectedSensors,
    permissions,
    isRecording,
    isPaused,
    isReady,
    isFinished,
    isInitialized,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    lastError,
  } = useActivityRecorder(profile);

  const router = useRouter();
  const hasShownErrorRef = useRef(false);

  /** Handle modal dismissal - prevent closing during active recording */
  const handleClose = () => {
    if (isRecording || isPaused) {
      Alert.alert(
        "Recording in Progress",
        "Please finish your recording before closing this screen.",
        [{ text: "OK" }],
      );
    } else {
      router.back();
    }
  };

  /** Handle start recording with activity selection */
  const handleStartRecording = () => {
    router.push("/modals/record/activity");
  };

  /** Handle stop recording with upload attempt */
  const handleStopRecording = async () => {
    try {
      const success = await stopRecording();
      if (success) {
        console.log("Recording stopped successfully");
      }
    } catch (error) {
      console.error("Failed to stop recording:", error);
    }
  };

  /** Handle discard recording with confirmation */
  const handleDiscardRecording = () => {
    Alert.alert(
      "Discard Recording",
      "Are you sure you want to discard this recording? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            try {
              await discardRecording();
              console.log("Recording discarded");
            } catch (error) {
              console.error("Failed to discard recording:", error);
            }
          },
        },
      ],
    );
  };

  /** Show error alerts */
  useEffect(() => {
    if (lastError && !hasShownErrorRef.current) {
      hasShownErrorRef.current = true;
      Alert.alert("Error", lastError, [
        {
          text: "OK",
          onPress: () => {
            hasShownErrorRef.current = false;
          },
        },
      ]);
    }
  }, [lastError]);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3">
        <View className="flex-row items-center justify-between">
          <Button size="icon" variant="ghost" onPress={handleClose}>
            <Icon as={ChevronDown} size={24} />
          </Button>

          <View className="flex-1 items-center">
            <Text className="font-semibold">
              {state !== "pending" ? "Recording Activity" : "Record Activity"}
            </Text>
            {state !== "pending" && (
              <Text className="text-xs text-muted-foreground capitalize">
                {state}
              </Text>
            )}
          </View>

          <View className="flex-row">
            {state === "pending" && (
              <Button
                variant="ghost"
                size="icon"
                onPress={() => router.push("/modals/record/activity")}
              >
                <Icon as={Activity} size={20} />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onPress={() => router.push("/modals/record/sensors")}
            >
              <Icon as={Bluetooth} size={20} />
              {connectedSensors.length > 0 && (
                <View className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onPress={() => router.push("/modals/record/permissions")}
            >
              <Icon as={MapPin} size={20} />
              {connectionStatus.gps === "connected" && (
                <View className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full" />
              )}
            </Button>
          </View>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView className="flex-1">
        {state === "pending" ? (
          <ReadyToStartView onStart={handleStartRecording} />
        ) : (
          <RecordingView
            metrics={metrics}
            state={state}
            connectionStatus={connectionStatus}
            connectedSensors={connectedSensors}
          />
        )}
      </ScrollView>

      {/* Footer Controls */}
      <View className="bg-background border-t border-border p-4">
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

/** Ready to start recording view */
const ReadyToStartView = ({ onStart }: { onStart: () => void }) => (
  <View className="flex-1 items-center justify-center p-8">
    <View className="w-32 h-32 bg-primary/10 rounded-full items-center justify-center mb-6">
      <Icon as={Play} size={48} className="text-primary" />
    </View>

    <Text className="text-2xl font-bold mb-2">Ready to Record</Text>
    <Text className="text-center text-muted-foreground mb-8">
      Select an activity type to start recording your workout
    </Text>

    <Button onPress={onStart} className="w-full max-w-xs">
      <Icon as={Activity} size={20} />
      <Text className="ml-2 font-semibold">Choose Activity</Text>
    </Button>
  </View>
);

/** Recording metrics and status view */
const RecordingView = ({
  metrics,
  state,
  connectionStatus,
  connectedSensors,
}: {
  metrics: any;
  state: string;
  connectionStatus: any;
  connectedSensors: any[];
}) => (
  <View className="flex-1 p-4">
    {/* Primary Metrics */}
    <View className="grid grid-cols-2 gap-4 mb-6">
      <View className="bg-card rounded-lg p-4 border">
        <Text className="text-sm text-muted-foreground mb-1">Duration</Text>
        <Text className="text-3xl font-bold">
          {formatDuration((metrics.duration || 0) / 1000)}
        </Text>
      </View>

      <View className="bg-card rounded-lg p-4 border">
        <Text className="text-sm text-muted-foreground mb-1">Distance</Text>
        <Text className="text-3xl font-bold">
          {formatDistance(metrics.distance || 0)}
        </Text>
      </View>
    </View>

    {/* Secondary Metrics Grid */}
    <View className="grid grid-cols-2 gap-4 mb-6">
      {metrics.currentSpeed !== undefined && (
        <View className="bg-card rounded-lg p-3 border">
          <Text className="text-xs text-muted-foreground">Current Speed</Text>
          <Text className="text-xl font-semibold">
            {formatSpeed(metrics.currentSpeed)}
          </Text>
        </View>
      )}

      {metrics.avgSpeed !== undefined && (
        <View className="bg-card rounded-lg p-3 border">
          <Text className="text-xs text-muted-foreground">Avg Speed</Text>
          <Text className="text-xl font-semibold">
            {formatSpeed(metrics.avgSpeed)}
          </Text>
        </View>
      )}

      {metrics.heartRate !== undefined && (
        <View className="bg-card rounded-lg p-3 border">
          <Text className="text-xs text-muted-foreground">Heart Rate</Text>
          <Text className="text-xl font-semibold text-red-500">
            {Math.round(metrics.heartRate)} bpm
          </Text>
        </View>
      )}

      {metrics.power !== undefined && (
        <View className="bg-card rounded-lg p-3 border">
          <Text className="text-xs text-muted-foreground">Power</Text>
          <Text className="text-xl font-semibold text-yellow-500">
            {Math.round(metrics.power)} W
          </Text>
        </View>
      )}

      {metrics.cadence !== undefined && (
        <View className="bg-card rounded-lg p-3 border">
          <Text className="text-xs text-muted-foreground">Cadence</Text>
          <Text className="text-xl font-semibold text-blue-500">
            {Math.round(metrics.cadence)} rpm
          </Text>
        </View>
      )}

      {metrics.calories !== undefined && (
        <View className="bg-card rounded-lg p-3 border">
          <Text className="text-xs text-muted-foreground">Calories</Text>
          <Text className="text-xl font-semibold text-orange-500">
            {Math.round(metrics.calories)}
          </Text>
        </View>
      )}
    </View>

    {/* Connection Status */}
    <View className="bg-card rounded-lg p-4 border mb-4">
      <Text className="font-medium mb-3">Connection Status</Text>
      <View className="flex-row justify-between">
        <View className="flex-row items-center">
          <Icon
            as={MapPin}
            size={16}
            className={
              connectionStatus.gps === "connected"
                ? "text-green-500"
                : "text-muted-foreground"
            }
          />
          <Text className="ml-2 text-sm">
            GPS{" "}
            {connectionStatus.gps === "connected" ? "Connected" : "Disabled"}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Icon
            as={Bluetooth}
            size={16}
            className={
              connectedSensors.length > 0
                ? "text-blue-500"
                : "text-muted-foreground"
            }
          />
          <Text className="ml-2 text-sm">
            {connectedSensors.length} Sensors
          </Text>
        </View>
      </View>
    </View>

    {/* Recording Info */}
    {state !== "pending" && (
      <View className="bg-muted/50 rounded-lg p-3">
        <Text className="text-xs text-muted-foreground">
          Status: {state.charAt(0).toUpperCase() + state.slice(1)}
        </Text>
        {state === "paused" && (
          <Text className="text-xs text-yellow-600 font-medium">
            Recording paused - GPS tracking continues
          </Text>
        )}
      </View>
    )}
  </View>
);

/** Recording control buttons */
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
    case "pending":
      return (
        <Button onPress={onStart} className="w-full">
          <Icon as={Play} size={20} />
          <Text className="ml-2 font-semibold">Start Recording</Text>
        </Button>
      );

    case "recording":
      return (
        <View className="flex-row gap-3">
          <Button onPress={onPause} variant="secondary" className="flex-1">
            <Icon as={Pause} size={20} />
            <Text className="ml-2">Pause</Text>
          </Button>
          <Button onPress={onStop} variant="destructive" className="flex-1">
            <Icon as={Square} size={20} />
            <Text className="ml-2">Stop</Text>
          </Button>
        </View>
      );

    case "paused":
      return (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <Button onPress={onResume} variant="default" className="flex-1">
              <Icon as={Play} size={20} />
              <Text className="ml-2">Resume</Text>
            </Button>
            <Button onPress={onStop} variant="secondary" className="flex-1">
              <Icon as={Square} size={20} />
              <Text className="ml-2">Finish</Text>
            </Button>
          </View>
          <Button onPress={onDiscard} variant="outline" className="w-full">
            <Icon as={RotateCcw} size={16} />
            <Text className="ml-2">Discard Recording</Text>
          </Button>
        </View>
      );

    case "finished":
      return (
        <View className="items-center">
          <Text className="text-green-600 font-medium mb-2">
            ✅ Recording finished and saved
          </Text>
          <Button onPress={onStart} variant="outline" className="w-full">
            <Icon as={Activity} size={16} />
            <Text className="ml-2">Start New Recording</Text>
          </Button>
        </View>
      );

    default:
      return null;
  }
};
