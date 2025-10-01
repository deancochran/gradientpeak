import { useRouter } from "expo-router";
import {
  Activity,
  Bluetooth,
  ChevronDown,
  ChevronRight,
  Clock,
  Heart,
  MapPin,
  Pause,
  Play,
  Shield,
  Square,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { useActivityRecorder } from "@/lib/hooks/useActivityRecorder";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  PublicActivityType,
} from "@repo/core";

const SCREEN_WIDTH = Dimensions.get("window").width;

type CarouselCard = "dashboard" | "map" | "plan";

const isOutdoorActivity = (type: PublicActivityType): boolean => {
  return ["outdoor_run", "outdoor_bike", "outdoor_walk"].includes(type);
};

export default function RecordModal() {
  const router = useRouter();
  const service = useActivityRecorder();

  // UI-only state
  const [currentCard, setCurrentCard] = useState<CarouselCard>("dashboard");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Refs
  const carouselRef = useRef<FlatList>(null);
  const intervalRef = useRef<number | null>(null);

  // Determine available cards based on activity type and state
  const availableCards = (): CarouselCard[] => {
    const cards: CarouselCard[] = ["dashboard"];

    // Add map card for outdoor activities when recording
    if (
      service.state !== "pending" &&
      isOutdoorActivity(service.selectedActivityType)
    ) {
      cards.push("map");
    }

    // Add plan card if planned activity is selected
    if (service.planManager && service.state !== "pending") {
      cards.push("plan");
    }

    return cards;
  };

  // Timer for elapsed time
  useEffect(() => {
    if (service.state === "recording" && !startTime) {
      setStartTime(Date.now());
      intervalRef.current = setInterval(() => {
        setElapsedTime(Date.now() - (startTime || Date.now()));
      }, 1000);
    } else if (service.state === "paused" && intervalRef.current) {
      clearInterval(intervalRef.current);
    } else if (
      service.state === "recording" &&
      startTime &&
      !intervalRef.current
    ) {
      // Resume timer
      intervalRef.current = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 1000);
    } else if (service.state === "finished" || service.state === "pending") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setStartTime(null);
      setElapsedTime(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [service.state, startTime]);

  // Handle hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (service.state === "pending" || service.state === "finished") {
          router.back();
          return true;
        } else {
          Alert.alert(
            "Recording in Progress",
            "Please pause and finish your recording before leaving.",
            [{ text: "OK" }],
          );
          return true;
        }
      },
    );

    return () => backHandler.remove();
  }, [service.state, router]);

  const handleFinishRecording = useCallback(async () => {
    try {
      await service.finishRecording();
      const recordingId = service.recording?.id;
      if (recordingId) {
        // Navigate to submission modal
        router.push(`/modals/activity-recording/${recordingId}`);
      }
    } catch (error) {
      console.error("Failed to finish recording:", error);
      Alert.alert("Error", "Failed to finish recording.");
    }
  }, [service, router]);

  // Auto-finish when plan completes
  useEffect(() => {
    if (
      service.planManager?.planProgress?.state === "finished" &&
      service.state === "recording"
    ) {
      handleFinishRecording();
    }
  }, [
    service.planManager?.planProgress?.state,
    service.state,
    handleFinishRecording,
  ]);

  // Handle close modal
  const handleClose = useCallback(() => {
    if (service.state === "pending" || service.state === "finished") {
      router.back();
    } else {
      Alert.alert(
        "Recording in Progress",
        "Please pause and finish your recording before closing.",
        [{ text: "OK" }],
      );
    }
  }, [service.state, router]);

  // Recording controls
  const handleStartRecording = useCallback(async () => {
    try {
      await service.startRecording();
    } catch (error) {
      console.error("Failed to start recording:", error);
      Alert.alert(
        "Error",
        "Failed to start recording. Please check permissions and try again.",
      );
    }
  }, [service]);

  const handlePauseRecording = useCallback(async () => {
    try {
      await service.pauseRecording();
    } catch (error) {
      console.error("Failed to pause recording:", error);
      Alert.alert("Error", "Failed to pause recording.");
    }
  }, [service]);

  const handleResumeRecording = useCallback(async () => {
    try {
      await service.resumeRecording();
    } catch (error) {
      console.error("Failed to resume recording:", error);
      Alert.alert("Error", "Failed to resume recording.");
    }
  }, [service]);

  const handleNextStep = useCallback(() => {
    if (service.planManager) {
      service.advanceStep();
    }
  }, [service]);

  const cards = availableCards();

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <RecordModalHeader service={service} onClose={handleClose} />

      {/* Body - Carousel */}
      <View className="flex-1">
        <FlatList
          ref={carouselRef}
          data={cards}
          renderItem={({ item }) => (
            <RecordModalCard
              type={item}
              service={service}
              elapsedTime={elapsedTime}
            />
          )}
          keyExtractor={(item) => item}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(
              event.nativeEvent.contentOffset.x / SCREEN_WIDTH,
            );
            setCurrentCard(cards[index]);
          }}
          style={{ flex: 1 }}
        />
      </View>

      {/* Footer */}
      <RecordModalFooter
        service={service}
        onStart={handleStartRecording}
        onPause={handlePauseRecording}
        onResume={handleResumeRecording}
        onFinish={handleFinishRecording}
        onNextStep={handleNextStep}
      />
    </View>
  );
}

// Header Component
const RecordModalHeader = ({
  service,
  onClose,
}: {
  service: any;
  onClose: () => void;
}) => {
  const router = useRouter();
  const canClose = service.state === "pending" || service.state === "finished";
  const connectedSensors = service.getConnectedSensors();
  const hasGPS =
    service.state === "recording" &&
    isOutdoorActivity(service.selectedActivityType);

  return (
    <View className="bg-background border-b border-border px-4 py-3 pt-12">
      <View className="flex-row items-center justify-between">
        {/* Left - Back/Close */}
        {canClose ? (
          <Button size="icon" variant="ghost" onPress={onClose}>
            <Icon as={ChevronDown} size={24} />
          </Button>
        ) : (
          <View className="w-10" />
        )}

        {/* Center - Title */}
        <View className="flex-1 items-center">
          <Text className="font-semibold text-lg">
            {service.state === "pending" ? "Record Activity" : "Recording"}
          </Text>
          {service.state !== "pending" && (
            <Text className="text-xs text-muted-foreground capitalize">
              {service.state === "recording" ? "Active" : service.state}
            </Text>
          )}
        </View>

        {/* Right - Icons */}
        <View className="flex-row gap-1">
          {/* Activity Selection */}
          <Button
            variant="ghost"
            size="icon"
            onPress={() => router.push("/modals/record/activity")}
            disabled={service.state !== "pending"}
          >
            <Icon as={Activity} size={20} />
          </Button>

          {/* Permissions */}
          <Button
            variant="ghost"
            size="icon"
            onPress={() => router.push("/modals/record/permissions")}
          >
            <Icon as={Shield} size={20} />
            {hasGPS && (
              <View className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
            )}
          </Button>

          {/* Sensors */}
          <Button
            variant="ghost"
            size="icon"
            onPress={() => router.push("/modals/record/sensors")}
          >
            <Icon as={Bluetooth} size={20} />
            {connectedSensors.length > 0 && (
              <View className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </Button>
        </View>
      </View>
    </View>
  );
};

// Carousel Card Component
const RecordModalCard = ({
  type,
  service,
  elapsedTime,
}: {
  type: CarouselCard;
  service: any;
  elapsedTime: number;
}) => {
  switch (type) {
    case "dashboard":
      return <DashboardCard service={service} elapsedTime={elapsedTime} />;
    case "map":
      return <MapCard service={service} />;
    case "plan":
      return <PlanCard service={service} />;
    default:
      return null;
  }
};

// Dashboard Card Component
const DashboardCard = ({
  service,
  elapsedTime,
}: {
  service: any;
  elapsedTime: number;
}) => {
  // Get metrics from service
  const heartRate = service.liveMetrics.get("heartrate");
  const power = service.liveMetrics.get("power");
  const cadence = service.liveMetrics.get("cadence");
  const speed = service.liveMetrics.get("speed");
  const distance = service.liveMetrics.get("distance");

  return (
    <View style={{ width: SCREEN_WIDTH }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent className="p-6">
          {/* Time Display */}
          <View className="items-center mb-6">
            <View className="flex-row items-center gap-2 mb-2">
              <Icon as={Clock} size={20} className="text-muted-foreground" />
              <Text className="text-sm text-muted-foreground">Duration</Text>
            </View>
            <Text className="text-4xl font-bold">
              {formatDuration(elapsedTime)}
            </Text>
          </View>

          {/* Metrics Grid */}
          <View className="flex-1 justify-center">
            {service.state === "pending" ? (
              <View className="items-center">
                <Text className="text-lg text-muted-foreground mb-2">
                  Ready to start recording
                </Text>
                <Text className="text-sm text-muted-foreground text-center">
                  Select your activity type and press Start Activity
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                {/* Primary Metrics Row */}
                <View className="flex-row justify-around">
                  {heartRate !== undefined && (
                    <MetricDisplay
                      icon={Heart}
                      label="Heart Rate"
                      value={Math.round(heartRate).toString()}
                      unit="bpm"
                      color="text-red-500"
                    />
                  )}
                  {power !== undefined && (
                    <MetricDisplay
                      icon={Zap}
                      label="Power"
                      value={Math.round(power).toString()}
                      unit="W"
                      color="text-yellow-500"
                    />
                  )}
                  {cadence !== undefined && (
                    <MetricDisplay
                      icon={TrendingUp}
                      label="Cadence"
                      value={Math.round(cadence).toString()}
                      unit="rpm"
                      color="text-blue-500"
                    />
                  )}
                </View>

                {/* Secondary Metrics Row */}
                {(speed !== undefined || distance !== undefined) && (
                  <View className="flex-row justify-around mt-4">
                    {speed !== undefined && (
                      <MetricDisplay
                        icon={TrendingUp}
                        label="Speed"
                        value={formatSpeed(speed)}
                        unit=""
                        color="text-green-500"
                      />
                    )}
                    {distance !== undefined && (
                      <MetricDisplay
                        icon={MapPin}
                        label="Distance"
                        value={formatDistance(distance)}
                        unit=""
                        color="text-purple-500"
                      />
                    )}
                  </View>
                )}

                {/* No sensors connected message */}
                {service.getConnectedSensors().length === 0 &&
                  !speed &&
                  !distance && (
                    <View className="items-center mt-8">
                      <Text className="text-sm text-muted-foreground">
                        No sensors connected
                      </Text>
                      <Text className="text-xs text-muted-foreground mt-1">
                        Connect devices to see live metrics
                      </Text>
                    </View>
                  )}
              </View>
            )}
          </View>
        </CardContent>
      </Card>
    </View>
  );
};

// Metric Display Component
const MetricDisplay = ({
  icon: IconComponent,
  label,
  value,
  unit,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  unit: string;
  color: string;
}) => (
  <View className="items-center">
    <Icon as={IconComponent} size={24} className={`${color} mb-1`} />
    <Text className="text-xs text-muted-foreground mb-1">{label}</Text>
    <View className="flex-row items-baseline">
      <Text className="text-2xl font-semibold">{value}</Text>
      {unit && (
        <Text className="text-sm text-muted-foreground ml-1">{unit}</Text>
      )}
    </View>
  </View>
);

// Map Card Component
const MapCard = ({ service }: { service: any }) => {
  const lat = service.liveMetrics.get("latitude");
  const lng = service.liveMetrics.get("longitude");
  const speed = service.liveMetrics.get("speed");
  const altitude = service.liveMetrics.get("altitude");

  return (
    <View style={{ width: SCREEN_WIDTH }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent className="p-4 flex-1">
          <View className="flex-1 items-center justify-center">
            <Icon
              as={MapPin}
              size={48}
              className="text-muted-foreground mb-4"
            />
            <Text className="text-lg font-semibold mb-2">GPS Map</Text>
            <Text className="text-sm text-muted-foreground text-center">
              Map view will display your route here
            </Text>
            {lat && lng && (
              <View className="mt-4">
                <Text className="text-xs text-muted-foreground">
                  Location: {lat.toFixed(6)}, {lng.toFixed(6)}
                </Text>
                {altitude !== undefined && (
                  <Text className="text-xs text-muted-foreground mt-1">
                    Altitude: {altitude.toFixed(0)}m
                  </Text>
                )}
                {speed !== undefined && (
                  <Text className="text-xs text-muted-foreground mt-1">
                    Pace: {formatPace(speed)}
                  </Text>
                )}
              </View>
            )}
          </View>
        </CardContent>
      </Card>
    </View>
  );
};

// Plan Card Component
const PlanCard = ({ service }: { service: any }) => {
  const progress = service.planManager?.planProgress;
  const currentStep = service.planManager?.getCurrentStep();
  const plan = service.planManager?.selectedPlannedActivity?.activity_plan;

  if (!progress || !plan) {
    return (
      <View style={{ width: SCREEN_WIDTH }} className="flex-1 p-4">
        <Card className="flex-1">
          <CardContent className="p-4 flex-1 items-center justify-center">
            <Text className="text-lg text-muted-foreground">
              No plan loaded
            </Text>
          </CardContent>
        </Card>
      </View>
    );
  }

  return (
    <View style={{ width: SCREEN_WIDTH }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent className="p-4">
          <Text className="text-lg font-semibold mb-4">{plan.name}</Text>

          {/* Progress indicator */}
          <View className="mb-4">
            <View className="flex-row justify-between mb-1">
              <Text className="text-sm text-muted-foreground">
                Step {progress.currentStepIndex + 1} of {progress.totalSteps}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {Math.round(
                  (progress.completedSteps / progress.totalSteps) * 100,
                )}
                % Complete
              </Text>
            </View>
            <View className="h-2 bg-muted rounded-full">
              <View
                className="h-2 bg-primary rounded-full"
                style={{
                  width: `${(progress.completedSteps / progress.totalSteps) * 100}%`,
                }}
              />
            </View>
          </View>

          {/* Current Step Details */}
          {currentStep && (
            <View className="bg-muted/50 rounded-lg p-4">
              <Text className="font-semibold mb-2">
                {currentStep.name || `Step ${progress.currentStepIndex + 1}`}
              </Text>

              {currentStep.description && (
                <Text className="text-sm text-muted-foreground mb-2">
                  {currentStep.description}
                </Text>
              )}

              {/* Step Duration */}
              {currentStep.duration && (
                <View className="flex-row items-center gap-2 mb-2">
                  <Icon
                    as={Clock}
                    size={16}
                    className="text-muted-foreground"
                  />
                  <Text className="text-sm">
                    Duration: {formatDuration(currentStep.duration * 1000)}
                  </Text>
                </View>
              )}

              {/* Step Progress */}
              {progress.elapsedInStep !== undefined && currentStep.duration && (
                <View className="mt-2">
                  <Text className="text-sm text-muted-foreground mb-1">
                    Step Progress: {formatDuration(progress.elapsedInStep)} /{" "}
                    {formatDuration(currentStep.duration * 1000)}
                  </Text>
                  <View className="h-1 bg-muted rounded-full">
                    <View
                      className="h-1 bg-blue-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (progress.elapsedInStep / (currentStep.duration * 1000)) * 100)}%`,
                      }}
                    />
                  </View>
                </View>
              )}

              {/* Step Targets */}
              {currentStep.targets && (
                <View className="mt-3 gap-2">
                  {currentStep.targets.heartRateZone && (
                    <View className="flex-row items-center gap-2">
                      <Icon as={Heart} size={16} className="text-red-500" />
                      <Text className="text-sm">
                        HR Zone: {currentStep.targets.heartRateZone}
                      </Text>
                    </View>
                  )}
                  {currentStep.targets.powerZone && (
                    <View className="flex-row items-center gap-2">
                      <Icon as={Zap} size={16} className="text-yellow-500" />
                      <Text className="text-sm">
                        Power Zone: {currentStep.targets.powerZone}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* No duration indicator */}
              {!currentStep.duration && (
                <View className="mt-2 p-2 bg-yellow-500/10 rounded">
                  <Text className="text-sm text-yellow-700">
                    Manual progression required - press Next Step when ready
                  </Text>
                </View>
              )}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
};

// Footer Component
const RecordModalFooter = ({
  service,
  onStart,
  onPause,
  onResume,
  onFinish,
  onNextStep,
}: {
  service: any;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onNextStep: () => void;
}) => {
  const currentStep = service.planManager?.getCurrentStep();
  const showNextStep =
    service.state === "recording" &&
    service.planManager &&
    currentStep &&
    !currentStep.duration;

  return (
    <View className="bg-background border-t border-border p-6 pb-8">
      {service.state === "pending" && (
        <Button onPress={onStart} className="w-full h-14 rounded-xl">
          <Icon as={Play} size={24} />
          <Text className="ml-3 font-semibold text-lg">Start Activity</Text>
        </Button>
      )}

      {service.state === "recording" && (
        <View className="gap-3">
          <Button
            onPress={onPause}
            variant="secondary"
            className="w-full h-14 rounded-xl"
          >
            <Icon as={Pause} size={24} />
            <Text className="ml-3 font-semibold">Pause Activity</Text>
          </Button>

          {showNextStep && (
            <Button
              onPress={onNextStep}
              variant="outline"
              className="w-full h-12 rounded-xl"
            >
              <Icon as={ChevronRight} size={20} />
              <Text className="ml-2 font-medium">Next Step</Text>
            </Button>
          )}
        </View>
      )}

      {service.state === "paused" && (
        <View className="flex-row gap-3">
          <Button onPress={onResume} className="flex-1 h-14 rounded-xl">
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
      )}

      {service.state === "finished" && (
        <View className="items-center">
          <Text className="text-green-600 font-medium text-lg mb-3">
            ✅ Activity completed
          </Text>
          <Text className="text-sm text-muted-foreground">
            Processing your recording...
          </Text>
        </View>
      )}
    </View>
  );
};
