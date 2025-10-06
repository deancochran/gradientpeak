// ================================
// Current Step Display
// ================================

const CurrentStepDisplay = memo<{
  planProgress: any;
  currentMetrics: CurrentMetrics;
  onNextStep?: () => void;
  isAdvancing: boolean;
  structure: ActivityPlanStructure;
}>(function CurrentStepDisplay({
  planProgress,
  currentMetrics,
  onNextStep,
  isAdvancing,
  structure,
}) {


  return (
    <View className="mb-6">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-sm font-medium">Current Step</Text>

      {/* Current Step Details */}
      {currentStep && (
        <View className="p-4 bg-muted/20 rounded-lg mb-4">
          <View className="mb-3">
            <Text className="text-base font-semibold">
              {currentStep.name || `Step ${planProgress.currentStepIndex + 1}`}
            </Text>
            {currentStep.description && (
              <Text className="text-sm text-muted-foreground mt-1">
                {currentStep.description}
              </Text>
            )}
            {currentStep.notes && (
              <Text className="text-xs text-muted-foreground mt-2 italic">
                Note: {currentStep.notes}
              </Text>
            )}
          </View>

          {/* Step Duration Info */}
          <View className="flex-row items-center gap-2">
            <Icon as={Clock} size={16} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">
              {planProgress.duration > 0
                ? `${formatDuration(planProgress.duration / 1000)} duration`
                : "Manual advancement"}
            </Text>
          </View>
        </View>
      )}

      {/* Target vs Current Metrics */}
      {stepTargets && (
        <TargetMetricsGrid
          targets={stepTargets}
          currentMetrics={currentMetrics}
        />
      )}
    </View>
  );
});

CurrentStepDisplay.displayName = "CurrentStepDisplay";
