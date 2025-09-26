import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useActivityRecorder } from "@/lib/hooks/useActivityRecorder";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { PublicActivityType } from "@repo/core";
import { useRouter } from "expo-router";
import {
  Activity,
  Bluetooth,
  ChevronDown,
  MapPin,
  Pause,
  Play,
  Settings,
  Square,
  RotateCcw,
  Shield,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  ScrollView,
  StatusBar,
  View,
  BackHandler,
} from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;

// Carousel card types
type CarouselCard = "dashboard" | "gps" | "workout";

// Recording states for UI
type RecordingUIState = "pre-activity" | "active" | "paused" | "finished";

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

export default function RecordModal() {
  const { profile } = useRequireAuth();
  const router = useRouter();

  const {
    state,
    metrics,
    connectionStatus,
    connectedSensors,
    permissions,
    isRecording,
    isPaused,
    isFinished,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    lastError,
  } = useActivityRecorder();

  // UI State
  const [currentCard, setCurrentCard] = useState<CarouselCard>("dashboard");
  const [selectedActivityType, setSelectedActivityType] =
    useState<PublicActivityType>("outdoor_run");
  const [isOutdoorActivity, setIsOutdoorActivity] = useState(true);
  const [hasPlannedWorkout, setHasPlannedWorkout] = useState(false);

  // Refs
  const carouselRef = useRef<FlatList>(null);
  const hasShownErrorRef = useRef(false);

  // Derive UI state from recording state
  const uiState: RecordingUIState = (() => {
    if (isFinished) return "finished";
    if (isPaused) return "paused";
    if (isRecording) return "active";
    return "pre-activity";
  })();

  // Build carousel cards based on activity type and state
  const carouselCards: CarouselCard[] = (() => {
    const cards: CarouselCard[] = ["dashboard"];
    if (isOutdoorActivity && uiState !== "pre-activity") {
      cards.push("gps");
    }
    if (hasPlannedWorkout && uiState !== "pre-activity") {
      cards.push("workout");
    }
    return cards;
  })();

  // Handle hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (uiState === "pre-activity") {
          router.back();
          return true;
        } else {
          Alert.alert(
            "Recording in Progress",
            "Please finish or discard your recording before leaving.",
            [{ text: "OK" }],
          );
          return true;
        }
      },
    );

    return () => backHandler.remove();
  }, [uiState, router]);

  // Handle close modal
  const handleClose = useCallback(() => {
    if (uiState === "pre-activity") {
      router.back();
    } else {
      Alert.alert(
        "Recording in Progress",
        "Please ffinishdiscardinish your recording before closing.",
        [{ text: "OK" }],
      );
    }
  }, [uiState, router]);

  // Handle start recording
  const handleStartRecording = useCallback(async () => {
    try {
      const success = await startRecording(selectedActivityType);
      if (success) {
        console.log("Recording started successfully");
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, [startRecording, selectedActivityType]);

  // Handle pause recording
  const handlePauseRecording = useCallback(async () => {
    try {
      const success = pauseRecording();
      if (success) {
        console.log("Recording paused");
      }
    } catch (error) {
      console.error("Failed to pause recording:", error);
    }
  }, [pauseRecording]);

  // Handle resume recording
  const handleResumeRecording = useCallback(async () => {
    try {
      const success = resumeRecording();
      if (success) {
        console.log("Recording resumed");
      }
    } catch (error) {
      console.error("Failed to resume recording:", error);
    }
  }, [resumeRecording]);

  // Handle finish recording
  const handleFinishRecording = useCallback(async () => {
    try {
      const success = await stopRecording();
      if (success) {
        // Navigate to submit recording modal with activity ID
        const recordingId = metrics.recordingId || "current"; // Use actual recording ID
        router.push(`/modals/activity-recording/${recordingId}`);
      }
    } catch (error) {
      console.error("Failed to finish recording:", error);
    }
  }, [stopRecording, router, metrics.recordingId]);

  // Handle discard recording
  const handleDiscardRecording = useCallback(() => {
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
              router.back(); // Return to tabs after discard
            } catch (error) {
              console.error("Failed to discard recording:", error);
            }
          },
        },
      ],
    );
  }, [discardRecording, router]);

  // Show error alerts
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

  // Handle activity type change
  const handleActivityTypeChange = useCallback(
    (activityType: PublicActivityType) => {
      setSelectedActivityType(activityType);
      setIsOutdoorActivity(
        ["outdoor_run", "outdoor_bike", "outdoor_walk"].includes(activityType),
      );
    },
    [],
  );

  return (
    <View className="flex-1 bg-background">
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
      />

      {/* Header */}
      <RecordModalHeader
        uiState={uiState}
        onClose={handleClose}
        connectionStatus={connectionStatus}
        connectedSensors={connectedSensors}
        onActivityTypeChange={handleActivityTypeChange}
        selectedActivityType={selectedActivityType}
      />

      {/* Body - Carousel */}
      <View className="flex-1">
        <RecordModalCarousel
          cards={carouselCards}
          currentCard={currentCard}
          onCardChange={setCurrentCard}
          carouselRef={carouselRef}
          uiState={uiState}
          metrics={metrics}
          connectionStatus={connectionStatus}
          connectedSensors={connectedSensors}
          selectedActivityType={selectedActivityType}
        />
      </View>

      {/* Footer - Context-sensitive controls */}
      <RecordModalFooter
        uiState={uiState}
        onStart={handleStartRecording}
        onPause={handlePauseRecording}
        onResume={handleResumeRecording}
        onFinish={handleFinishRecording}
        onDiscard={handleDiscardRecording}
      />
    </View>
  );
}

/** Header Component */
const RecordModalHeader = ({
  uiState,
  onClose,
  connectionStatus,
  connectedSensors,
  onActivityTypeChange,
  selectedActivityType,
}: {
  uiState: RecordingUIState;
  onClose: () => void;
  connectionStatus: any;
  connectedSensors: any[];
  onActivityTypeChange: (type: PublicActivityType) => void;
  selectedActivityType: PublicActivityType;
}) => {
  const router = useRouter();

  return (
    <View className="bg-background border-b border-border px-4 py-3 pt-12">
      <View className="flex-row items-center justify-between">
        {/* Left - Back/Close */}
        {uiState === "pre-activity" && (
          <Button size="icon" variant="ghost" onPress={onClose}>
            <Icon as={ChevronDown} size={24} />
          </Button>
        )}
        {uiState !== "pre-activity" && <View className="w-10" />}

        {/* Center - Title */}
        <View className="flex-1 items-center">
          <Text className="font-semibold text-lg">
            {uiState === "pre-activity" ? "Record Activity" : "Recording"}
          </Text>
          {uiState !== "pre-activity" && (
            <Text className="text-xs text-muted-foreground capitalize">
              {uiState === "active" ? "Recording..." : uiState}
            </Text>
          )}
        </View>

        {/* Right - Sub-modal icons */}
        <View className="flex-row space-x-1">
          {/* Permissions */}
          <Button
            variant="ghost"
            size="icon"
            onPress={() => router.push("/modals/record/permissions")}
          >
            <Icon as={Shield} size={20} />
            {connectionStatus?.gps === "connected" && (
              <View className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full" />
            )}
          </Button>

          {/* Sensors */}
          <Button
            variant="ghost"
            size="icon"
            onPress={() => router.push("/modals/record/sensors")}
          >
            <Icon as={Bluetooth} size={20} />
            {connectedSensors?.length > 0 && (
              <View className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full" />
            )}
          </Button>

          {/* Activity Selection */}
          <Button
            variant="ghost"
            size="icon"
            onPress={() => router.push("/modals/record/activity")}
          >
            <Icon as={Activity} size={20} />
          </Button>

          {/* Settings */}
          <Button
            variant="ghost"
            size="icon"
            onPress={() => router.push("/modals/record/settings")}
          >
            <Icon as={Settings} size={20} />
          </Button>
        </View>
      </View>
    </View>
  );
};

/** Carousel Component */
const RecordModalCarousel = ({
  cards,
  currentCard,
  onCardChange,
  carouselRef,
  uiState,
  metrics,
  connectionStatus,
  connectedSensors,
  selectedActivityType,
}: {
  cards: CarouselCard[];
  currentCard: CarouselCard;
  onCardChange: (card: CarouselCard) => void;
  carouselRef: React.RefObject<FlatList>;
  uiState: RecordingUIState;
  metrics: any;
  connectionStatus: any;
  connectedSensors: any[];
  selectedActivityType: PublicActivityType;
}) => {
  const renderCard = ({ item }: { item: CarouselCard }) => {
    switch (item) {
      case "dashboard":
        return (
          <DashboardCard
            uiState={uiState}
            metrics={metrics}
            connectionStatus={connectionStatus}
            connectedSensors={connectedSensors}
            selectedActivityType={selectedActivityType}
          />
        );
      case "gps":
        return <GPSMapCard metrics={metrics} />;
      case "workout":
        return <PlannedWorkoutCard metrics={metrics} />;
      default:
        return null;
    }
  };

  return (
    <FlatList
      ref={carouselRef}
      data={cards}
      renderItem={renderCard}
      keyExtractor={(item) => item}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onMomentumScrollEnd={(event) => {
        const index = Math.round(
          event.nativeEvent.contentOffset.x / SCREEN_WIDTH,
        );
        onCardChange(cards[index]);
      }}
      style={{ flex: 1 }}
    />
  );
};

/** Dashboard Card */
const DashboardCard = ({
  uiState,
  metrics,
  connectionStatus,
  connectedSensors,
  selectedActivityType,
}: {
  uiState: RecordingUIState;
  metrics: any;
  connectionStatus: any;
  connectedSensors: any[];
  selectedActivityType: PublicActivityType;
}) => {
  if (uiState === "pre-activity") {
    return (
      <View
        style={{ width: SCREEN_WIDTH }}
        className="flex-1 items-center justify-center p-8"
      >
        <View className="w-32 h-32 bg-primary/10 rounded-full items-center justify-center mb-8">
          <Icon as={Play} size={48} className="text-primary" />
        </View>
        <Text className="text-3xl font-bold mb-4">Ready to Record</Text>
        <Text className="text-center text-muted-foreground text-lg mb-2">
          Selected: {selectedActivityType.replace("_", " ").toUpperCase()}
        </Text>
        <Text className="text-center text-muted-foreground">
          Tap the start button when ready to begin your activity
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ width: SCREEN_WIDTH }}
      className="flex-1 p-6"
      contentContainerStyle={{ paddingBottom: 20 }}
    >
      {/* Primary Metrics */}
      <View className="flex-row mb-6 space-x-4">
        <View className="flex-1 bg-card rounded-2xl p-6 border">
          <Text className="text-sm text-muted-foreground mb-2">Duration</Text>
          <Text className="text-4xl font-bold text-primary">
            {formatDuration((metrics?.duration || 0) / 1000)}
          </Text>
        </View>

        <View className="flex-1 bg-card rounded-2xl p-6 border">
          <Text className="text-sm text-muted-foreground mb-2">Distance</Text>
          <Text className="text-4xl font-bold text-blue-600">
            {formatDistance(metrics?.distance || 0)}
          </Text>
        </View>
      </View>

      {/* Secondary Metrics Grid */}
      <View className="flex-row flex-wrap justify-between mb-6">
        {metrics?.currentSpeed !== undefined && (
          <View className="w-[48%] bg-card rounded-xl p-4 border mb-4">
            <Text className="text-xs text-muted-foreground">Speed</Text>
            <Text className="text-2xl font-semibold mt-1">
              {formatSpeed(metrics.currentSpeed)}
            </Text>
          </View>
        )}

        {metrics?.heartRate !== undefined && (
          <View className="w-[48%] bg-card rounded-xl p-4 border mb-4">
            <Text className="text-xs text-muted-foreground">Heart Rate</Text>
            <Text className="text-2xl font-semibold text-red-500 mt-1">
              {Math.round(metrics.heartRate)}{" "}
              <Text className="text-sm">bpm</Text>
            </Text>
          </View>
        )}

        {metrics?.power !== undefined && (
          <View className="w-[48%] bg-card rounded-xl p-4 border mb-4">
            <Text className="text-xs text-muted-foreground">Power</Text>
            <Text className="text-2xl font-semibold text-yellow-500 mt-1">
              {Math.round(metrics.power)} <Text className="text-sm">W</Text>
            </Text>
          </View>
        )}

        {metrics?.cadence !== undefined && (
          <View className="w-[48%] bg-card rounded-xl p-4 border mb-4">
            <Text className="text-xs text-muted-foreground">Cadence</Text>
            <Text className="text-2xl font-semibold text-blue-500 mt-1">
              {Math.round(metrics.cadence)} <Text className="text-sm">rpm</Text>
            </Text>
          </View>
        )}

        {metrics?.calories !== undefined && (
          <View className="w-[48%] bg-card rounded-xl p-4 border mb-4">
            <Text className="text-xs text-muted-foreground">Calories</Text>
            <Text className="text-2xl font-semibold text-orange-500 mt-1">
              {Math.round(metrics.calories)}
            </Text>
          </View>
        )}
      </View>

      {/* Connection Status */}
      <View className="bg-card rounded-xl p-4 border">
        <Text className="font-medium mb-3">Connection Status</Text>
        <View className="flex-row justify-between">
          <View className="flex-row items-center">
            <Icon
              as={MapPin}
              size={16}
              className={
                connectionStatus?.gps === "connected"
                  ? "text-green-500"
                  : "text-muted-foreground"
              }
            />
            <Text className="ml-2 text-sm">
              GPS{" "}
              {connectionStatus?.gps === "connected" ? "Connected" : "Disabled"}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Icon
              as={Bluetooth}
              size={16}
              className={
                connectedSensors?.length > 0
                  ? "text-blue-500"
                  : "text-muted-foreground"
              }
            />
            <Text className="ml-2 text-sm">
              {connectedSensors?.length || 0} Sensors
            </Text>
          </View>
        </View>
      </View>

      {/* Recording Status */}
      {uiState === "paused" && (
        <View className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mt-4">
          <Text className="text-yellow-800 font-medium text-center">
            ⏸️ Recording Paused
          </Text>
          <Text className="text-yellow-700 text-sm text-center mt-1">
            GPS tracking continues in background
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

/** GPS Map Card */
const GPSMapCard = ({ metrics }: { metrics: any }) => {
  return (
    <View
      style={{ width: SCREEN_WIDTH }}
      className="flex-1 items-center justify-center p-8"
    >
      <View className="w-24 h-24 bg-green-100 rounded-full items-center justify-center mb-6">
        <Icon as={MapPin} size={32} className="text-green-600" />
      </View>
      <Text className="text-xl font-semibold mb-2">GPS Map View</Text>
      <Text className="text-center text-muted-foreground mb-4">
        Live route tracking for outdoor activities
      </Text>
      <Text className="text-center text-sm text-muted-foreground">
        Map integration coming soon...
      </Text>
    </View>
  );
};

/** Planned Workout Card */
const PlannedWorkoutCard = ({ metrics }: { metrics: any }) => {
  return (
    <View
      style={{ width: SCREEN_WIDTH }}
      className="flex-1 items-center justify-center p-8"
    >
      <View className="w-24 h-24 bg-purple-100 rounded-full items-center justify-center mb-6">
        <Icon as={Activity} size={32} className="text-purple-600" />
      </View>
      <Text className="text-xl font-semibold mb-2">Planned Workout</Text>
      <Text className="text-center text-muted-foreground mb-4">
        Interval structure and target guidance
      </Text>
      <Text className="text-center text-sm text-muted-foreground">
        Workout planning coming soon...
      </Text>
    </View>
  );
};

/** Footer Controls */
const RecordModalFooter = ({
  uiState,
  onStart,
  onPause,
  onResume,
  onFinish,
  onDiscard,
}: {
  uiState: RecordingUIState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}) => {
  return (
    <View className="bg-background border-t border-border p-6 pb-8">
      {uiState === "pre-activity" && (
        <Button onPress={onStart} className="w-full h-14 rounded-xl">
          <Icon as={Play} size={24} />
          <Text className="ml-3 font-semibold text-lg">Begin Activity</Text>
        </Button>
      )}

      {uiState === "active" && (
        <View className="flex-row space-x-4">
          <Button
            onPress={onPause}
            variant="secondary"
            className="flex-1 h-14 rounded-xl"
          >
            <Icon as={Pause} size={24} />
            <Text className="ml-3 font-semibold">Pause</Text>
          </Button>
        </View>
      )}

      {uiState === "paused" && (
        <View className="space-y-4">
          <View className="flex-row space-x-4">
            <Button
              onPress={onResume}
              variant="default"
              className="flex-1 h-14 rounded-xl"
            >
              <Icon as={Play} size={24} />
              <Text className="ml-3 font-semibold">Resume</Text>
            </Button>
            <Button
              onPress={onFinish}
              variant="secondary"
              className="flex-1 h-14 rounded-xl"
            >
              <Icon as={Square} size={24} />
              <Text className="ml-3 font-semibold">Finish</Text>
            </Button>
          </View>
          <Button
            onPress={onDiscard}
            variant="outline"
            className="w-full h-12 rounded-xl"
          >
            <Icon as={RotateCcw} size={20} />
            <Text className="ml-2">Discard Recording</Text>
          </Button>
        </View>
      )}

      {uiState === "finished" && (
        <View className="items-center space-y-4">
          <Text className="text-green-600 font-medium text-lg">
            ✅ Activity completed successfully
          </Text>
          <Button
            onPress={onStart}
            variant="outline"
            className="w-full h-12 rounded-xl"
          >
            <Icon as={Activity} size={20} />
            <Text className="ml-2">Start New Activity</Text>
          </Button>
        </View>
      )}
    </View>
  );
};
