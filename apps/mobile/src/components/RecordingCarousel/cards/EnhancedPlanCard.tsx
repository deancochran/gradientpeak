import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useCurrentReadings,
  usePlan,
  useRecordingState,
} from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { Activity, Calendar } from "lucide-react-native";
import React, { memo } from "react";
import { View } from "react-native";

// ================================
// Types
// ================================

interface EnhancedPlanCardProps {
  service: ActivityRecorderService | null;
  style?: { width: number };
  className?: string;
}

interface CurrentMetrics {
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
}

// ================================
// Empty State Component
// ================================

const EmptyPlanState = memo(() => (
  <View className="flex-1 items-center justify-center py-16">
    <View className="items-center">
      <View className="w-16 h-16 bg-muted/20 rounded-full items-center justify-center mb-4">
        <Icon as={Calendar} size={32} className="text-muted-foreground" />
      </View>
      <Text className="text-lg font-medium text-center mb-2">
        No Active Plan
      </Text>
      <Text className="text-center text-sm text-muted-foreground px-8">
        Select a training plan to see workout details and track your progress
      </Text>
    </View>
  </View>
));

EmptyPlanState.displayName = "EmptyPlanState";

// ================================
// Pending State Component
// ================================

const PendingPlanState = memo(() => (
  <View className="flex-1 items-center justify-center py-16">
    <View className="items-center">
      <View className="w-16 h-16 bg-muted/20 rounded-full items-center justify-center mb-4">
        <Icon as={Activity} size={32} className="text-muted-foreground" />
      </View>
      <Text className="text-lg font-medium text-center mb-2">
        Ready to Start
      </Text>
      <Text className="text-center text-sm text-muted-foreground px-8">
        Press Start Activity to begin your workout
      </Text>
    </View>
  </View>
));

PendingPlanState.displayName = "PendingPlanState";

// ================================
// Plan Overview Component
// ================================

interface PlanOverviewProps {
  planName: string;
  planDescription?: string;
  currentStepIndex: number;
  totalSteps: number;
}

const PlanOverview = memo<PlanOverviewProps>(
  ({ planName, planDescription, currentStepIndex, totalSteps }) => (
    <View className="mb-6">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-lg font-semibold">{planName}</Text>
        <View className="bg-primary/10 px-3 py-1 rounded-full">
          <Text className="text-xs font-medium text-primary">
            Step {currentStepIndex + 1} of {totalSteps}
          </Text>
        </View>
      </View>
      {planDescription && (
        <Text className="text-sm text-muted-foreground">{planDescription}</Text>
      )}
    </View>
  ),
);

PlanOverview.displayName = "PlanOverview";

// ================================
// Current Metrics Display
// ================================

interface MetricsDisplayProps {
  currentMetrics: CurrentMetrics;
}

const MetricsDisplay = memo<MetricsDisplayProps>(({ currentMetrics }) => {
  const hasMetrics =
    currentMetrics.heartRate ||
    currentMetrics.power ||
    currentMetrics.cadence ||
    currentMetrics.speed;

  if (!hasMetrics) {
    return (
      <View className="p-4 bg-muted/10 rounded-lg mb-6">
        <Text className="text-sm text-muted-foreground text-center">
          Waiting for sensor data...
        </Text>
      </View>
    );
  }

  return (
    <View className="mb-6">
      <Text className="text-sm font-medium text-muted-foreground mb-3">
        Current Metrics
      </Text>
      <View className="flex-row flex-wrap gap-3">
        {currentMetrics.heartRate && (
          <View className="flex-1 min-w-[45%] p-3 bg-red-500/10 rounded-lg">
            <Text className="text-xs text-muted-foreground mb-1">
              Heart Rate
            </Text>
            <Text className="text-xl font-semibold text-red-600">
              {Math.round(currentMetrics.heartRate)}
            </Text>
            <Text className="text-xs text-muted-foreground">bpm</Text>
          </View>
        )}
        {currentMetrics.power && (
          <View className="flex-1 min-w-[45%] p-3 bg-yellow-500/10 rounded-lg">
            <Text className="text-xs text-muted-foreground mb-1">Power</Text>
            <Text className="text-xl font-semibold text-yellow-600">
              {Math.round(currentMetrics.power)}
            </Text>
            <Text className="text-xs text-muted-foreground">watts</Text>
          </View>
        )}
        {currentMetrics.cadence && (
          <View className="flex-1 min-w-[45%] p-3 bg-blue-500/10 rounded-lg">
            <Text className="text-xs text-muted-foreground mb-1">Cadence</Text>
            <Text className="text-xl font-semibold text-blue-600">
              {Math.round(currentMetrics.cadence)}
            </Text>
            <Text className="text-xs text-muted-foreground">rpm</Text>
          </View>
        )}
        {currentMetrics.speed && (
          <View className="flex-1 min-w-[45%] p-3 bg-green-500/10 rounded-lg">
            <Text className="text-xs text-muted-foreground mb-1">Speed</Text>
            <Text className="text-xl font-semibold text-green-600">
              {(currentMetrics.speed * 3.6).toFixed(1)}
            </Text>
            <Text className="text-xs text-muted-foreground">km/h</Text>
          </View>
        )}
      </View>
    </View>
  );
});

MetricsDisplay.displayName = "MetricsDisplay";

// ================================
// Progress Bar Component
// ================================

interface ProgressBarProps {
  current: number;
  total: number;
}

const ProgressBar = memo<ProgressBarProps>(({ current, total }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-medium text-muted-foreground">
          Overall Progress
        </Text>
        <Text className="text-sm font-medium">{Math.round(percentage)}%</Text>
      </View>
      <View className="h-3 bg-muted rounded-full overflow-hidden">
        <View
          className="h-full bg-primary rounded-full"
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </View>
    </View>
  );
});

ProgressBar.displayName = "ProgressBar";

// ================================
// Main Enhanced Plan Card
// ================================

export const EnhancedPlanCard = memo<EnhancedPlanCardProps>(
  ({ service, style, className = "flex-1 p-4" }) => {
    // Get all data from hooks
    const current = useCurrentReadings(service);
    const { plan, progress } = usePlan(service);
    const state = useRecordingState(service);

    // Derive current metrics
    const currentMetrics: CurrentMetrics = {
      heartRate: current.heartRate,
      power: current.power,
      cadence: current.cadence,
      speed: current.speed,
    };

    // Handle no plan selected
    if (!plan) {
      return (
        <View style={style} className={className}>
          <Card className="flex-1">
            <CardContent className="p-4 flex-1">
              <EmptyPlanState />
            </CardContent>
          </Card>
        </View>
      );
    }

    // Handle pending state (plan selected but not started)
    if (!progress || state === "pending") {
      return (
        <View style={style} className={className}>
          <Card className="flex-1">
            <CardContent className="p-4 flex-1">
              <PendingPlanState />
            </CardContent>
          </Card>
        </View>
      );
    }

    // Calculate total steps from plan structure
    // For now, use a simple approach - can be enhanced later
    const totalSteps = progress.completedSteps + 1;

    return (
      <View style={style} className={className}>
        <Card className="flex-1">
          <CardContent className="p-4 flex-1">
            {/* Plan Overview */}
            <PlanOverview
              planName={plan.name}
              planDescription={plan.description}
              currentStepIndex={progress.currentStepIndex}
              totalSteps={totalSteps}
            />

            {/* Progress Bar */}
            <ProgressBar current={progress.completedSteps} total={totalSteps} />

            {/* Current Metrics */}
            <MetricsDisplay currentMetrics={currentMetrics} />

            {/* Plan State Info */}
            <View className="p-4 bg-muted/10 rounded-lg">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-xs text-muted-foreground mb-1">
                    Plan Status
                  </Text>
                  <Text className="text-base font-semibold capitalize">
                    {progress.state.replace("_", " ")}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-muted-foreground mb-1">
                    Recording State
                  </Text>
                  <Text className="text-base font-semibold capitalize">
                    {state}
                  </Text>
                </View>
              </View>
            </View>

            {/* Footer Info */}
            <View className="mt-6 pt-4 border-t border-muted/20">
              <Text className="text-xs text-muted-foreground text-center">
                Follow your plan to maximize training effectiveness
              </Text>
            </View>
          </CardContent>
        </Card>
      </View>
    );
  },
);

EnhancedPlanCard.displayName = "EnhancedPlanCard";
