import { useRouter } from "expo-router";
import {
  Activity,
  Bluetooth,
  ChevronDown,
  ChevronRight,
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
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
  useMemo,
} from "react";
import {
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  View,
  ActivityIndicator,
  Pressable,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useActivityRecorderInit } from "@/lib/hooks/useActivityRecorderInit";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import {
  useRecordingState,
  useActivityType,
  useRecordingActions,
  usePlanActions,
  useSensorCount,
  usePlanProgress,
  useActivityPlan,
  useMetric,
} from "@/lib/hooks/useActivityRecorderEvents";
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  PublicActivityType,
} from "@repo/core";
import { EnhancedPlanCard } from "@/components/plan/EnhancedPlanCard";

const SCREEN_WIDTH = Dimensions.get("window").width;
type CarouselCard = "dashboard" | "map" | "plan";

const isOutdoorActivity = (type: PublicActivityType): boolean =>
  ["outdoor_run", "outdoor_bike", "outdoor_walk"].includes(type);

export default function RecordModal() {
  const router = useRouter();
  const { profile } = useRequireAuth();

  // Get service lifecycle management
  const { service, serviceState, createNewService, isReady } =
    useActivityRecorderInit();

  // Auto-create service when modal opens
  useEffect(() => {
    if (!service && profile && serviceState === "uninitialized") {
      console.log("Creating new service for recording session");
      createNewService(profile);
    }
  }, [service, profile, serviceState, createNewService]);

  // Use event-based hooks for better performance - only when service is ready
  const state = useRecordingState(isReady ? service : null);
  const activityType = useActivityType(isReady ? service : null);
  const sensorCount = useSensorCount(isReady ? service : null);
  const planProgress = usePlanProgress(isReady ? service : null);
  const activityPlan = useActivityPlan(isReady ? service : null);
  const { start, pause, resume } = useRecordingActions(
    isReady ? service : null,
  );
  const { resumePlan, isAdvancing } = usePlanActions(isReady ? service : null);

  // Get individual GPS metrics to avoid object recreation and infinite loops
  const latitude = useMetric(isReady ? service : null, "latitude");
  const longitude = useMetric(isReady ? service : null, "longitude");
  const altitude = useMetric(isReady ? service : null, "altitude");

  const [, setCurrentCard] = useState<CarouselCard>("dashboard");
  const carouselRef = useRef<FlatList>(null);

  // Memoize available cards to prevent unnecessary re-renders
  const cards = useMemo((): CarouselCard[] => {
    const cardList: CarouselCard[] = ["dashboard"];

    // Show map card for outdoor activities regardless of state
    if (isOutdoorActivity(activityType)) {
      cardList.push("map");
    }

    // Show plan card when activity plan is available, regardless of state
    if (activityPlan) {
      cardList.push("plan");
    }
    return cardList;
  }, [activityType, activityPlan]);

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
      // Get the recording ID from the service
      const recordingId = service?.recording?.id;
      if (recordingId) {
        router.push(`/modals/submit-recording?recording_id=${recordingId}`);
      } else {
        throw new Error("No recording ID available");
      }
    } catch (error) {
      console.error("Failed to finish recording:", error);
      Alert.alert("Error", "Failed to finish recording.");
    }
  }, [router, service]);

  // Auto-finish if plan completes
  useEffect(() => {
    if (planProgress?.state === "finished" && state === "recording") {
      handleFinishRecording();
    }
  }, [planProgress?.state, state, handleFinishRecording]);

  // Track current card index for carousel indicators
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  // Don't render until service is initialized to prevent errors
  if (!isReady) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="mt-4 text-muted-foreground">Loading recorder...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <RecordModalHeader
        state={state}
        activityType={activityType}
        sensorCount={sensorCount}
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
              activityType={activityType}
              planProgress={planProgress}
              activityPlan={activityPlan}
              latitude={latitude}
              longitude={longitude}
              altitude={altitude}
              service={service}
              onNextStep={resumePlan}
              isAdvancing={isAdvancing}
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
            setCurrentCardIndex(index);
          }}
          onScrollToIndexFailed={(info) => {
            // Handle scroll failure gracefully
            console.warn("Scroll to index failed:", info);
          }}
          style={{ flex: 1 }}
        />

        {/* Carousel Navigation */}
        {cards.length > 1 && (
          <View className="pb-4">
            {/* Card Labels */}
            <View className="flex-row justify-center mb-3 gap-4">
              {cards.map((card, index) => (
                <Pressable
                  key={card}
                  onPress={() => {
                    carouselRef.current?.scrollToIndex({
                      index,
                      animated: true,
                    });
                  }}
                  className={`px-3 py-1 rounded-full ${
                    index === currentCardIndex
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-muted/30"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      index === currentCardIndex
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {card === "dashboard"
                      ? "Dashboard"
                      : card === "map"
                        ? "Map"
                        : card === "plan"
                          ? "Plan"
                          : card}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Indicators */}
            <View className="flex-row justify-center gap-2">
              {cards.map((card, index) => (
                <View
                  key={`indicator-${card}`}
                  className={`w-2 h-2 rounded-full ${
                    index === currentCardIndex
                      ? "bg-primary"
                      : "bg-muted-foreground/30"
                  }`}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Footer */}
      <RecordModalFooter
        state={state}
        onStart={start}
        onPause={pause}
        onResume={resume}
        onFinish={handleFinishRecording}
        onNextStep={resumePlan}
        isAdvancing={isAdvancing}
        service={service}
      />
    </View>
  );
}

const RecordModalHeader = ({
  state,
  activityType,
  sensorCount,
  onClose,
}: {
  state: string;
  activityType: PublicActivityType;
  sensorCount: number;
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
            {sensorCount > 0 && (
              <View className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </Button>
        </View>
      </View>
    </View>
  );
};

// Carousel Card Component
const RecordModalCard = memo(
  ({
    type,
    state,
    activityType,
    planProgress,
    activityPlan,
    latitude,
    longitude,
    altitude,
    service,
    onNextStep,
    isAdvancing,
  }: {
    type: CarouselCard;
    state: string;
    activityType: PublicActivityType;
    planProgress?: any;
    activityPlan?: any;
    latitude?: number;
    longitude?: number;
    altitude?: number;
    service: any;
    onNextStep?: () => void;
    isAdvancing?: boolean;
  }) => {
    switch (type) {
      case "dashboard":
        return (
          <DashboardCard
            state={state}
            activityType={activityType}
            service={service}
          />
        );
      case "map":
        return (
          <MapCard
            latitude={latitude}
            longitude={longitude}
            altitude={altitude}
          />
        );
      case "plan":
        return (
          <PlanCard
            planProgress={planProgress}
            activityPlan={activityPlan}
            onNextStep={onNextStep}
            isAdvancing={isAdvancing}
            state={state}
            service={service}
          />
        );
      default:
        return null;
    }
  },
);
RecordModalCard.displayName = "RecordModalCard";

// Dashboard Card Component
const DashboardCard = memo(
  ({
    state,
    activityType,
    service,
  }: {
    state: string;
    activityType: PublicActivityType;
    service: any;
  }) => {
    // Get metrics directly in component for optimal re-rendering
    const heartrate = useMetric(service, "heartrate");
    const power = useMetric(service, "power");
    const cadence = useMetric(service, "cadence");
    const speed = useMetric(service, "speed");
    const distance = useMetric(service, "distance");
    const elapsedTime = useMetric(service, "elapsedTime");

    // Fallback to 0 if elapsed time is undefined and ensure it's a valid number
    const displayElapsedTime =
      typeof elapsedTime === "number" ? elapsedTime : 0;
    const sensorCount = useSensorCount(service);

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
                {formatDuration(displayElapsedTime)}
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

                  {sensorCount === 0 && !speed && !distance && (
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
  },
);
DashboardCard.displayName = "DashboardCard";

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
const MapCard = memo(
  ({
    latitude: lat,
    longitude: lng,
    altitude,
  }: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
  }) => {
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
                </View>
              )}
            </View>
          </CardContent>
        </Card>
      </View>
    );
  },
);
MapCard.displayName = "MapCard";

// Plan Card Component
const PlanCard = memo(
  ({
    planProgress,
    activityPlan,
    onNextStep,
    isAdvancing,
    state,
    service,
  }: {
    planProgress?: any;
    activityPlan?: any;
    onNextStep?: () => void;
    isAdvancing?: boolean;
    state?: string;
    service?: any;
  }) => {
    return (
      <EnhancedPlanCard
        planProgress={planProgress}
        activityPlan={activityPlan}
        state={state}
        onNextStep={onNextStep}
        isAdvancing={isAdvancing}
        service={service}
        style={{ width: SCREEN_WIDTH }}
        className="flex-1 p-4"
      />
    );
  },
);
PlanCard.displayName = "PlanCard";

// Footer Component
const RecordModalFooter = ({
  state,
  onStart,
  onPause,
  onResume,
  onFinish,
  onNextStep,
  service,
}: {
  state: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onNextStep?: () => void;
  service: any;
}) => {
  const planProgress = usePlanProgress(service);
  const showNextStep = state === "recording" && planProgress && onNextStep;

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
