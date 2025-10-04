import { useRouter } from "expo-router";
import {
  Activity,
  Bluetooth,
  ChevronDown,
  Clock,
  Heart,
  MapPin,
  Shield,
  TrendingUp,
  Zap,
  Play,
  Pause,
  Square,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Dimensions, FlatList, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  PublicActivityType,
} from "@repo/core";

const SCREEN_WIDTH = Dimensions.get("window").width;
type CarouselCard = "dashboard" | "map" | "plan";

const isOutdoorActivity = (type: PublicActivityType): boolean =>
  ["outdoor_run", "outdoor_bike", "outdoor_walk"].includes(type);

export default function RecordModal() {
  const router = useRouter();
  const {
    state,
    activityType,
    liveMetrics,
    connectedSensors,
    planProgress,
    activityPlan,
    startRecording,
    pauseRecording,
    resumeRecording,
    resumePlan,
  } = useActivityRecorder();

  const [currentCard, setCurrentCard] = useState<CarouselCard>("dashboard");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const carouselRef = useRef<FlatList>(null);
  const intervalRef = useRef<number | null>(null);

  const availableCards = (): CarouselCard[] => {
    const cards: CarouselCard[] = ["dashboard"];
    if (state !== "pending" && isOutdoorActivity(activityType))
      cards.push("map");
    if (activityPlan && state !== "pending") cards.push("plan");
    return cards;
  };

  // Timer
  useEffect(() => {
    if (state === "recording" && !startTime) {
      const now = Date.now();
      setStartTime(now);
      intervalRef.current = setInterval(
        () => setElapsedTime(Date.now() - now),
        1000,
      );
    } else if (state === "paused" && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    } else if (state === "finished" || state === "pending") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setStartTime(null);
      setElapsedTime(0);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state, startTime]);

  // Back handler
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (state === "pending" || state === "finished") {
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
  }, [router, state]);

  const handleFinishRecording = useCallback(async () => {
    try {
      router.push("/modals/record/submit");
    } catch (error) {
      console.error("Failed to finish recording:", error);
      Alert.alert("Error", "Failed to finish recording.");
    }
  }, [router]);

  // Auto-finish if plan completes
  useEffect(() => {
    if (planProgress?.state === "finished" && state === "recording") {
      handleFinishRecording();
    }
  }, [planProgress?.state, state, handleFinishRecording]);

  const cards = availableCards();

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <RecordModalHeader
        state={state}
        activityType={activityType}
        connectedSensors={connectedSensors}
        onClose={() => {
          if (state === "pending" || state === "finished") {
            router.back();
          } else {
            Alert.alert(
              "Recording in Progress",
              "Please pause and finish your recording before closing.",
              [{ text: "OK" }],
            );
          }
        }}
      />

      {/* Body */}
      <View className="flex-1">
        <FlatList
          ref={carouselRef}
          data={cards}
          renderItem={({ item }) => (
            <RecordModalCard
              type={item}
              state={state}
              liveMetrics={liveMetrics}
              connectedSensors={connectedSensors}
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
        state={state}
        onStart={startRecording}
        onPause={pauseRecording}
        onResume={resumeRecording}
        onFinish={handleFinishRecording}
        onNextStep={async () => {
          await resumePlan();
        }}
      />
    </View>
  );
}

const RecordModalHeader = ({
  state,
  activityType,
  connectedSensors,
  onClose,
}: {
  state: string;
  activityType: PublicActivityType;
  connectedSensors: any[];
  onClose: () => void;
}) => {
  const router = useRouter();

  const canClose = state === "pending" || state === "finished";
  const hasGPS = state === "recording" && isOutdoorActivity(activityType);

  return (
    <View className="bg-background border-b border-border p-4 ">
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
            {state === "pending" ? "Record Activity" : "Recording"}
          </Text>
          {state !== "pending" && (
            <Text className="text-xs text-muted-foreground capitalize">
              {state === "recording" ? "Active" : state}
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
            disabled={state !== "pending"}
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
  state,
  liveMetrics,
  connectedSensors,
  elapsedTime,
  planProgress,
  currentStep,
  activityPlan,
}: {
  type: CarouselCard;
  state: string;
  liveMetrics: any;
  connectedSensors: any[];
  elapsedTime: number;
  planProgress?: any;
  currentStep?: any;
  activityPlan?: any;
}) => {
  switch (type) {
    case "dashboard":
      return (
        <DashboardCard
          state={state}
          liveMetrics={liveMetrics}
          connectedSensors={connectedSensors}
          elapsedTime={elapsedTime}
        />
      );
    case "map":
      return <MapCard liveMetrics={liveMetrics} />;
    case "plan":
      return (
        <PlanCard
          planProgress={planProgress}
          currentStep={currentStep}
          activityPlan={activityPlan}
        />
      );
    default:
      return null;
  }
};

// Dashboard Card Component
const DashboardCard = ({
  state,
  liveMetrics,
  connectedSensors,
  elapsedTime,
}: {
  state: string;
  liveMetrics: any;
  connectedSensors: any[];
  elapsedTime: number;
}) => {
  const { heartrate, power, cadence, speed, distance } = liveMetrics;

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

          {/* Metrics */}
          <View className="flex-1 justify-center">
            {state === "pending" ? (
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
                <View className="flex-row justify-around">
                  {heartrate !== undefined && (
                    <MetricDisplay
                      icon={Heart}
                      label="Heart Rate"
                      value={Math.round(heartrate).toString()}
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

                {connectedSensors.length === 0 && !speed && !distance && (
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
const MapCard = ({ liveMetrics }: { liveMetrics: any }) => {
  const lat = liveMetrics.latitude;
  const lng = liveMetrics.longitude;
  const speed = liveMetrics.speed;
  const altitude = liveMetrics.altitude;

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
const PlanCard = ({
  planProgress,
  currentStep,
  activityPlan,
}: {
  planProgress?: any;
  currentStep?: any;
  activityPlan?: any;
}) => {
  if (!planProgress || !activityPlan) {
    return (
      <View style={{ width: SCREEN_WIDTH }} className="flex-1 p-4">
        <Card className="flex-1">
          <CardContent className="flex-1 items-center justify-center">
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
          <Text className="text-lg font-semibold mb-4">
            {activityPlan.name}
          </Text>

          {/* Progress bar, current step, targets… (same as your version) */}
          {/* but use `planProgress` and `currentStep` props instead of service.planManager */}
        </CardContent>
      </Card>
    </View>
  );
};

// Footer Component
const RecordModalFooter = ({
  state,
  currentStep,
  onStart,
  onPause,
  onResume,
  onFinish,
  onNextStep, // optional
}: {
  state: RecordState;
  currentStep?: any;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onNextStep?: () => void; // 👈 make optional
}) => {
  const showNextStep =
    state === "recording" && currentStep && !currentStep.duration;

  return (
    <View className="bg-background border-t border-border p-6 pb-8">
      {state === "pending" && (
        <Button onPress={onStart} className="w-full h-14 rounded-xl">
          <Icon as={Play} size={24} className="color-background" />
          <Text className="ml-3 font-semibold text-lg">Start Activity</Text>
        </Button>
      )}
      {state === "recording" && (
        <View className="gap-3">
          <Button
            onPress={onPause}
            variant="secondary"
            className="w-full h-14 rounded-xl"
          >
            <Icon as={Pause} size={24} />
            <Text className="ml-3 font-semibold">Pause Activity</Text>
          </Button>

          {showNextStep && onNextStep && (
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

      {state === "paused" && (
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

      {state === "finished" && (
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
