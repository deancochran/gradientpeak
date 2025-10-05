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
import { PowerCard } from "@/components/dashboard/PowerCard";
import { HeartRateCard } from "@/components/dashboard/HeartRateCard";
import { AnalysisCard } from "@/components/dashboard/AnalysisCard";
import { ElevationCard } from "@/components/dashboard/ElevationCard";

const SCREEN_WIDTH = Dimensions.get("window").width;
type CarouselCard =
  | "dashboard"
  | "power"
  | "heartrate"
  | "analysis"
  | "elevation"
  | "map"
  | "plan";

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
  const isScrolling = useRef(false);

  // Memoize available cards to prevent unnecessary re-renders
  // Cards display reactively based on activity type and plan selection
  const cards = useMemo((): CarouselCard[] => {
    const cardList: CarouselCard[] = ["dashboard"];

    // Power card - always show (displays regardless of data availability)
    cardList.push("power");

    // Heart rate card - always show (displays regardless of data availability)
    cardList.push("heartrate");

    // Analysis card - always show (displays regardless of data availability)
    cardList.push("analysis");

    // Elevation card - always show (displays regardless of data availability)
    cardList.push("elevation");

    // Map card - show for outdoor activities at all times
    if (isOutdoorActivity(activityType)) {
      cardList.push("map");
    }

    // Plan card - show when template or user activity plan is selected, visible at all times
    if (activityPlan) {
      cardList.push("plan");
    }

    return cardList;
  }, [activityType, activityPlan]);

  // Create infinite scrolling by tripling the cards array
  const infiniteCards = useMemo(() => {
    return [...cards, ...cards, ...cards];
  }, [cards]);

  // Track current card index for carousel indicators (relative to original cards)
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  // Reset carousel to middle set (second copy) whenever cards array changes
  useEffect(() => {
    setCurrentCardIndex(0);
    // Start at the middle set for infinite scrolling
    const middleIndex = cards.length;
    setTimeout(() => {
      carouselRef.current?.scrollToIndex({
        index: middleIndex,
        animated: false,
        viewPosition: 0,
      });
    }, 50);
  }, [cards.length]);

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
          data={infiniteCards}
          extraData={infiniteCards.length}
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
          keyExtractor={(item, index) => `${item}-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={SCREEN_WIDTH}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onMomentumScrollEnd={(event) => {
            if (isScrolling.current) return;

            const offsetX = event.nativeEvent.contentOffset.x;
            const absoluteIndex = Math.round(offsetX / SCREEN_WIDTH);

            // Calculate which set we're in (0=first, 1=middle, 2=last)
            const setIndex = Math.floor(absoluteIndex / cards.length);
            const relativeIndex = absoluteIndex % cards.length;

            // Update indicator to show relative position
            setCurrentCardIndex(relativeIndex);
            setCurrentCard(cards[relativeIndex]);

            // If we've scrolled to first or last set, snap back to middle set
            if (setIndex === 0 || setIndex === 2) {
              isScrolling.current = true;
              const middleSetIndex = cards.length + relativeIndex;

              setTimeout(() => {
                carouselRef.current?.scrollToIndex({
                  index: middleSetIndex,
                  animated: false,
                });
                isScrolling.current = false;
              }, 10);
            }
          }}
          onScrollToIndexFailed={(info) => {
            // Handle scroll failure by scrolling to offset directly
            const offset = info.index * SCREEN_WIDTH;
            carouselRef.current?.scrollToOffset({
              offset,
              animated: false,
            });
          }}
          getItemLayout={(data, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          style={{ flex: 1 }}
        />

        {/* Carousel Navigation */}
        {cards.length > 1 && (
          <View className="pb-4">
            {/* Indicators */}
            <View className="flex-row justify-center gap-2">
              {cards.map((card, index) => (
                <Pressable
                  key={`indicator-${card}`}
                  onPress={() => {
                    // Scroll to middle set + index for infinite scroll
                    const middleSetIndex = cards.length + index;
                    carouselRef.current?.scrollToIndex({
                      index: middleSetIndex,
                      animated: true,
                    });
                  }}
                  className="p-1"
                >
                  <View
                    className={`w-2 h-2 rounded-full ${
                      index === currentCardIndex
                        ? "bg-primary"
                        : "bg-muted-foreground/30"
                    }`}
                  />
                </Pressable>
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
      case "power":
        return <PowerCard service={service} screenWidth={SCREEN_WIDTH} />;
      case "heartrate":
        return <HeartRateCard service={service} screenWidth={SCREEN_WIDTH} />;
      case "analysis":
        return <AnalysisCard service={service} screenWidth={SCREEN_WIDTH} />;
      case "elevation":
        return <ElevationCard service={service} screenWidth={SCREEN_WIDTH} />;
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
// Structured layout: Large elapsed time at top, grid of key metrics below
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

    // Determine if we're in prepared state (before recording)
    const isPrepared = state === "pending" || state === "ready";

    return (
      <View style={{ width: SCREEN_WIDTH }} className="flex-1 p-4">
        <Card className="flex-1">
          <CardContent className="p-6">
            {/* Large Time Display - Most Critical Metric */}
            <View className="items-center mb-8 pb-6 border-b border-border">
              <View className="flex-row items-center gap-2 mb-3">
                <Icon as={Clock} size={24} className="text-primary" />
                <Text className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Duration
                </Text>
              </View>
              <Text className="text-5xl font-bold tabular-nums">
                {formatDuration(displayElapsedTime)}
              </Text>
              {isPrepared && (
                <Text className="text-xs text-muted-foreground mt-2">
                  Ready to start
                </Text>
              )}
            </View>

            {/* Grid of 4-6 Key Metrics Below */}
            <View className="flex-1 justify-center">
              {isPrepared ? (
                // Prepared State - Show placeholders confirming sensor readiness
                <View className="gap-6">
                  <Text className="text-sm text-muted-foreground text-center mb-2">
                    Sensors prepared and ready
                  </Text>

                  {/* Top Row: Power, Heart Rate, Cadence */}
                  <View className="flex-row justify-around">
                    <MetricDisplay
                      icon={Zap}
                      label="Power"
                      value="n/a"
                      unit="W"
                      color="text-muted-foreground/50"
                    />
                    <MetricDisplay
                      icon={Heart}
                      label="Heart Rate"
                      value="n/a"
                      unit="bpm"
                      color="text-muted-foreground/50"
                    />
                    <MetricDisplay
                      icon={TrendingUp}
                      label="Cadence"
                      value="n/a"
                      unit="rpm"
                      color="text-muted-foreground/50"
                    />
                  </View>

                  {/* Bottom Row: Speed, Distance */}
                  <View className="flex-row justify-around">
                    <MetricDisplay
                      icon={TrendingUp}
                      label="Speed"
                      value="n/a"
                      unit="km/h"
                      color="text-muted-foreground/50"
                    />
                    <MetricDisplay
                      icon={MapPin}
                      label="Distance"
                      value="n/a"
                      unit="km"
                      color="text-muted-foreground/50"
                    />
                  </View>
                </View>
              ) : (
                // Active Recording State - Show live or placeholder values
                <View className="gap-6">
                  {/* Top Row: Power, Heart Rate, Cadence */}
                  <View className="flex-row justify-around">
                    <MetricDisplay
                      icon={Zap}
                      label="Power"
                      value={
                        power !== undefined
                          ? Math.round(power).toString()
                          : "n/a"
                      }
                      unit="W"
                      color={
                        power !== undefined
                          ? "text-yellow-500"
                          : "text-muted-foreground/50"
                      }
                    />
                    <MetricDisplay
                      icon={Heart}
                      label="Heart Rate"
                      value={
                        heartrate !== undefined
                          ? Math.round(heartrate).toString()
                          : "n/a"
                      }
                      unit="bpm"
                      color={
                        heartrate !== undefined
                          ? "text-red-500"
                          : "text-muted-foreground/50"
                      }
                    />
                    <MetricDisplay
                      icon={TrendingUp}
                      label="Cadence"
                      value={
                        cadence !== undefined
                          ? Math.round(cadence).toString()
                          : "n/a"
                      }
                      unit="rpm"
                      color={
                        cadence !== undefined
                          ? "text-blue-500"
                          : "text-muted-foreground/50"
                      }
                    />
                  </View>

                  {/* Bottom Row: Speed, Distance */}
                  <View className="flex-row justify-around">
                    <MetricDisplay
                      icon={TrendingUp}
                      label="Speed"
                      value={speed !== undefined ? formatSpeed(speed) : "n/a"}
                      unit={speed !== undefined ? "" : "km/h"}
                      color={
                        speed !== undefined
                          ? "text-green-500"
                          : "text-muted-foreground/50"
                      }
                    />
                    <MetricDisplay
                      icon={MapPin}
                      label="Distance"
                      value={
                        distance !== undefined
                          ? formatDistance(distance)
                          : "n/a"
                      }
                      unit={distance !== undefined ? "" : "km"}
                      color={
                        distance !== undefined
                          ? "text-purple-500"
                          : "text-muted-foreground/50"
                      }
                    />
                  </View>

                  {/* Connection Status Info */}
                  {sensorCount === 0 && !speed && !distance && (
                    <View className="items-center mt-6 pt-6 border-t border-border">
                      <Icon
                        as={Bluetooth}
                        size={20}
                        className="text-muted-foreground/50 mb-2"
                      />
                      <Text className="text-xs text-muted-foreground">
                        No sensors connected
                      </Text>
                      <Text className="text-xs text-muted-foreground/70 mt-1">
                        Data will show when available
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

// Metric Display Component - Clean, consistent visual pattern
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
  <View className="items-center flex-1">
    <Icon as={IconComponent} size={20} className={`${color} mb-2`} />
    <Text className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
      {label}
    </Text>
    <View className="flex-row items-baseline">
      <Text className={`text-2xl font-bold tabular-nums ${color}`}>
        {value}
      </Text>
      {unit && (
        <Text className="text-xs text-muted-foreground ml-1">{unit}</Text>
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
  isAdvancing,
  service,
}: {
  state: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onNextStep?: () => void;
  isAdvancing?: boolean;
  service: any;
}) => {
  const planProgress = usePlanProgress(service);
  const showNextStep =
    state === "recording" &&
    planProgress &&
    onNextStep &&
    (planProgress.duration === 0 || planProgress.duration === undefined);

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
              disabled={isAdvancing}
            >
              <Icon as={ChevronRight} size={20} />
              <Text className="ml-2 font-medium">
                {isAdvancing ? "Advancing..." : "Next Step"}
              </Text>
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
