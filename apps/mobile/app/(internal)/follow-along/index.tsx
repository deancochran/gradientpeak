import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import {
  ActivityPayload,
  calculateTotalDurationSecondsV2,
  DurationV2,
  formatDurationCompact,
  formatIntensityTarget,
  getStepIntensityColor,
  getTargetUnit,
  IntensityTargetV2,
  PlanStepV2,
} from "@repo/core";
import { useRouter } from "expo-router";
import { ChevronLeft, Target, TrendingUp } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, View, ViewToken } from "react-native";

// ============================================================================
// TYPES
// ============================================================================

type ActivityCard =
  | { type: "overview"; id: string }
  | { type: "step"; id: string; step: PlanStepV2; stepNumber: number }
  | { type: "completion"; id: string };

// ============================================================================
// HELPER FUNCTIONS - DURATION
// ============================================================================

function getDurationMs(duration: DurationV2): number {
  switch (duration.type) {
    case "time":
      return duration.seconds * 1000;
    case "distance":
      // Estimate based on 5 min/km pace
      const km = duration.meters / 1000;
      return km * 5 * 60 * 1000;
    case "repetitions":
      // Estimate 10 seconds per rep
      return duration.count * 10 * 1000;
    case "untilFinished":
      return 0; // Unknown duration
    default:
      return 0;
  }
}

function getMetricDisplayName(type: string): string {
  switch (type) {
    case "%FTP":
      return "Power (FTP)";
    case "%MaxHR":
      return "Heart Rate (Max)";
    case "%ThresholdHR":
      return "Heart Rate (LT)";
    case "watts":
      return "Power";
    case "bpm":
      return "Heart Rate";
    case "speed":
      return "Speed";
    case "cadence":
      return "Cadence";
    case "RPE":
      return "Effort (RPE)";
    default:
      return type;
  }
}

function buildActivityCards(
  activity: any,
  steps: PlanStepV2[],
): ActivityCard[] {
  const cards: ActivityCard[] = [];

  // Overview card
  cards.push({ type: "overview", id: "overview" });

  // Step cards
  steps.forEach((step, index) => {
    cards.push({
      type: "step",
      id: `step-${index}`,
      step,
      stepNumber: index + 1,
    });
  });

  // Completion card
  cards.push({ type: "completion", id: "completion" });

  return cards;
}

function calculateProgress(currentIndex: number, totalCards: number): number {
  if (totalCards <= 1) return 0;
  return (currentIndex / (totalCards - 1)) * 100;
}

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

function useActivityInitialization(router: any) {
  const [activity, setActivity] = useState<any>(null);
  const [activityPayload, setActivityPayload] =
    useState<ActivityPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeFromStore = async () => {
      try {
        console.log("[FollowAlong] Loading selection from store");

        const selection = activitySelectionStore.consumeSelection();

        if (!selection) {
          console.error("[FollowAlong] No selection found in store");
          Alert.alert("Error", "No activity selected");
          router.back();
          return;
        }

        if (!selection.plan) {
          console.error("[FollowAlong] No activity plan found in selection");
          Alert.alert("Error", "No activity plan found");
          router.back();
          return;
        }

        console.log("[FollowAlong] Activity loaded successfully");
        setActivityPayload(selection);
        setActivity(selection.plan);
      } catch (error) {
        console.error("[FollowAlong] Initialization error:", error);
        Alert.alert("Error", "Failed to load activity. Please try again.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    initializeFromStore();
  }, [router]);

  return { activity, activityPayload, isLoading };
}

function useActiveCardTracking() {
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 100,
  }).current;

  return {
    activeIndex,
    onViewableItemsChanged,
    viewabilityConfig,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatActivitySummary(step: PlanStepV2): string {
  const parts: string[] = [];

  // Add duration
  if (step.duration && step.duration.type !== "untilFinished") {
    const ms = getDurationMs(step.duration);
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
      parts.push(`${minutes}m`);
    } else {
      parts.push(`${seconds}s`);
    }
  }

  // Add primary target (usually the first one)
  if (step.targets && step.targets.length > 0) {
    const primaryTarget = step.targets[0];
    const targetStr = formatTargetSummary(primaryTarget);
    if (targetStr) {
      parts.push(targetStr);
    }
  }

  // If we have both parts, join with @
  if (parts.length === 2) {
    return `${parts[0]} @ ${parts[1]}`;
  }

  // If only one part, return it
  if (parts.length === 1) {
    return parts[0];
  }

  // Fallback to step name or generic text
  return step.name || "Exercise";
}

function formatTargetSummary(target: IntensityTargetV2): string {
  return formatIntensityTarget(target);
}

// ============================================================================
// COMPONENTS
// ============================================================================

function ActivityHeader({
  activity,
  currentStep,
  totalSteps,
  onBack,
}: {
  activity: any;
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-border bg-card">
      <Button variant="ghost" size="icon" onPress={onBack} className="mr-2">
        <Icon as={ChevronLeft} size={24} />
      </Button>
      <View className="flex-1 items-center">
        <Text className="text-lg font-semibold" numberOfLines={1}>
          {activity.name}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Step {currentStep} of {totalSteps}
        </Text>
      </View>
      <View className="w-10" />
    </View>
  );
}

function OverviewCard({
  activity,
  totalSteps,
  totalDuration,
}: {
  activity: any;
  totalSteps: number;
  totalDuration: number;
}) {
  return (
    <View className="bg-card border-2 border-primary rounded-xl p-6 shadow-lg">
      <View className="items-center mb-6">
        <Icon as={TrendingUp} size={48} className="text-primary mb-3" />
        <Text className="text-2xl font-bold text-center">{activity.name}</Text>
      </View>

      {activity.description && (
        <View className="mb-6">
          <Text className="text-muted-foreground text-center leading-6">
            {activity.description}
          </Text>
        </View>
      )}

      <View className="gap-3">
        <InfoRow label="Total Steps" value={totalSteps.toString()} />
        {totalDuration > 0 && (
          <InfoRow
            label="Estimated Duration"
            value={formatDurationCompact(totalDuration / 1000)}
          />
        )}
      </View>

      <View className="mt-6 p-4 bg-primary/10 rounded-lg">
        <Text className="text-sm text-center font-medium">
          Swipe up to begin your activity
        </Text>
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between p-3 bg-muted rounded-lg">
      <Text className="font-medium">{label}</Text>
      <Text className="text-lg font-semibold">{value}</Text>
    </View>
  );
}

function StepCard({
  step,
  stepNumber,
  isActive,
}: {
  step: PlanStepV2;
  stepNumber: number;
  isActive: boolean;
}) {
  const activitySummary = useMemo(() => {
    return formatActivitySummary(step);
  }, [step]);

  return (
    <View
      className={`bg-card border-2 rounded-xl p-6 shadow-lg ${
        isActive ? "border-primary" : "border-border"
      }`}
    >
      <View className="mb-4">
        <Text className="text-sm text-muted-foreground mb-2">
          Step {stepNumber}
        </Text>
        <Text className="text-3xl font-bold leading-tight">
          {activitySummary}
        </Text>
      </View>

      {step.name && step.name !== "Exercise" && (
        <View className="mb-4 p-3 bg-primary/10 rounded-lg">
          <Text className="text-base font-medium">{step.name}</Text>
        </View>
      )}

      {step.description && (
        <View className="mb-4">
          <Text className="text-muted-foreground leading-6">
            {step.description}
          </Text>
        </View>
      )}

      {step.targets && step.targets.length > 0 && (
        <View className="mb-4">
          <View className="gap-2">
            {step.targets.map((target, index) => (
              <TargetChip key={`target-${index}`} target={target} />
            ))}
          </View>
        </View>
      )}

      {step.notes && (
        <View className="mt-4 p-4 bg-muted rounded-lg">
          <Text className="text-sm font-medium text-muted-foreground mb-2">
            Notes
          </Text>
          <Text className="text-sm leading-5">{step.notes}</Text>
        </View>
      )}
    </View>
  );
}

function TargetChip({ target }: { target: IntensityTargetV2 }) {
  // Create a mock step with just this target to get the color
  const color = useMemo(() => {
    const mockStep: PlanStepV2 = {
      name: "Step",
      duration: { type: "time", seconds: 60 },
      targets: [target],
    };
    return getStepIntensityColor(mockStep);
  }, [target]);

  return (
    <View className="flex-row items-center p-3 border border-border rounded-lg bg-background">
      <View
        className="w-4 h-4 rounded-full mr-3"
        style={{ backgroundColor: color }}
      />
      <Text className="font-medium text-base flex-1">
        {getMetricDisplayName(target.type)}: {target.intensity}
        {getTargetUnit(target)}
      </Text>
    </View>
  );
}

function CompletionCard() {
  return (
    <View className="bg-card border-2 border-primary rounded-xl p-6 shadow-lg items-center justify-center min-h-[400px]">
      <View className="items-center">
        <View className="w-20 h-20 bg-primary rounded-full items-center justify-center mb-6">
          <Text className="text-4xl">✓</Text>
        </View>
        <Text className="text-3xl font-bold mb-3">Activity Complete!</Text>
        <Text className="text-muted-foreground text-center text-lg">
          Great job finishing your activity.
        </Text>
      </View>
    </View>
  );
}

function LoadingState() {
  return (
    <View className="flex-1 bg-background items-center justify-center">
      <Text className="text-muted-foreground">Loading activity...</Text>
    </View>
  );
}

function ErrorState({ onBack }: { onBack: () => void }) {
  return (
    <View className="flex-1 bg-background items-center justify-center p-6">
      <Icon as={Target} size={48} className="text-muted-foreground mb-4" />
      <Text className="text-lg font-semibold mb-2">Activity Not Found</Text>
      <Text className="text-muted-foreground text-center mb-6">
        Unable to load the activity plan.
      </Text>
      <Button onPress={onBack}>
        <Text>Go Back</Text>
      </Button>
    </View>
  );
}

function CardWrapper({
  isActive,
  children,
}: {
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      className="px-4 justify-center"
      style={{
        opacity: isActive ? 1 : 0.4,
        minHeight: 500,
      }}
    >
      {children}
    </View>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function FollowAlongScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const { activity, isLoading } = useActivityInitialization(router);
  const { activeIndex, onViewableItemsChanged, viewabilityConfig } =
    useActiveCardTracking();

  const baseSteps = useMemo(() => activity?.structure?.steps || [], [activity]);

  const totalDuration = useMemo(
    () => calculateTotalDurationSecondsV2(baseSteps) * 1000, // Convert to ms
    [baseSteps],
  );

  const allCards = useMemo(
    () => buildActivityCards(activity, baseSteps),
    [activity, baseSteps],
  );

  const progress = useMemo(
    () => calculateProgress(activeIndex, allCards.length),
    [activeIndex, allCards.length],
  );

  const renderCard = useCallback(
    ({ item, index }: { item: ActivityCard; index: number }) => {
      const isActive = index === activeIndex;

      return (
        <CardWrapper isActive={isActive}>
          {item.type === "overview" && (
            <OverviewCard
              activity={activity}
              totalSteps={baseSteps.length}
              totalDuration={totalDuration}
            />
          )}
          {item.type === "step" && item.step && item.stepNumber && (
            <StepCard
              step={item.step}
              stepNumber={item.stepNumber}
              isActive={isActive}
            />
          )}
          {item.type === "completion" && <CompletionCard />}
        </CardWrapper>
      );
    },
    [activeIndex, activity, baseSteps.length, totalDuration],
  );

  const keyExtractor = useCallback((item: ActivityCard) => item.id, []);

  const snapToOffsets = useMemo(() => {
    return allCards.map((_, index) => index * 500);
  }, [allCards]);

  const getItemLayout = useCallback(
    (_: ArrayLike<ActivityCard> | null | undefined, index: number) => ({
      length: 500,
      offset: 500 * index,
      index,
    }),
    [],
  );

  if (isLoading) return <LoadingState />;
  if (!activity) return <ErrorState onBack={() => router.back()} />;

  return (
    <View className="flex-1 bg-background">
      <ActivityHeader
        activity={activity}
        currentStep={activeIndex}
        totalSteps={allCards.length - 1}
        onBack={() => router.back()}
      />

      <View className="px-4 pt-3 pb-2 bg-card border-b border-border">
        <Progress value={progress} className="h-2" />
      </View>

      <FlatList
        ref={flatListRef}
        data={allCards}
        renderItem={renderCard}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        showsVerticalScrollIndicator={false}
        snapToOffsets={snapToOffsets}
        snapToAlignment="center"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
        removeClippedSubviews={true}
        maxToRenderPerBatch={3}
        windowSize={5}
        initialNumToRender={2}
        contentContainerStyle={{ paddingVertical: 20 }}
      />
    </View>
  );
}

export default function FollowAlongScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <FollowAlongScreen />
    </ErrorBoundary>
  );
}
