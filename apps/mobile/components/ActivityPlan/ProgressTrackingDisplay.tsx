// ================================
// Progress Tracking Display
// ================================

const ProgressTrackingDisplay = memo<{
  planProgress: any;
  structure: ActivityPlanStructure;
  currentMetrics: CurrentMetrics;
}>(function ProgressTrackingDisplay({
  planProgress,
  structure,
  currentMetrics,
}) {
  const overallProgress =
    (planProgress.completedSteps / planProgress.totalSteps) * 100;
  const stepProgress =
    planProgress.duration > 0
      ? (planProgress.elapsedInStep / planProgress.duration) * 100
      : 0;

  return (
    <View className="mb-6">
      {/* Big Picture Progress */}
      <View className="mb-4">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-sm font-medium">Activity Progress</Text>
          <Text className="text-sm text-muted-foreground">
            {Math.round(overallProgress)}%
          </Text>
        </View>

        {/* Overall progress bar */}
        <View className="h-3 bg-muted rounded-full overflow-hidden mb-3">
          <View
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </View>

        {/* Mini activity graph with current position indicator */}
        <ActivityProgressGraph
          structure={structure}
          currentStep={planProgress.currentStepIndex}
          className="h-8 mb-2"
        />

        <Text className="text-xs text-muted-foreground">
          Step {planProgress.currentStepIndex + 1} of {planProgress.totalSteps}
        </Text>
      </View>

      {/* Fine-grained Step Progress */}
      <View>
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-sm font-medium">Current Step Progress</Text>
          <Text className="text-sm text-muted-foreground">
            {formatDuration(planProgress.elapsedInStep / 1000)} /{" "}
            {formatDuration(planProgress.duration / 1000)}
          </Text>
        </View>

        <View className="h-2 bg-muted rounded-full overflow-hidden">
          <View
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(stepProgress, 100)}%` }}
          />
        </View>
      </View>
    </View>
  );
});

ProgressTrackingDisplay.displayName = "ProgressTrackingDisplay";
