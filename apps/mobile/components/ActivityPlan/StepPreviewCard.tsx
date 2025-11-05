// ================================
// Step Preview Components
// ================================

interface StepPreviewCardProps {
  step: ActivityProfilePoint;
  isUpcoming?: boolean;
  showDuration?: boolean;
}

const StepPreviewCard = memo<StepPreviewCardProps>(function StepPreviewCard({
  step,
  isUpcoming = false,
  showDuration = true,
}: StepPreviewCardProps) {
  return (
    <View
      className={`p-3 rounded-lg border ${
        isUpcoming ? "border-blue-200 bg-blue-50" : "border-muted bg-background"
      }`}
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text
            className={`text-sm font-medium ${
              isUpcoming ? "text-blue-800" : "text-foreground"
            }`}
          >
            {step.name}
          </Text>
          {step.description && (
            <Text className="text-xs text-muted-foreground mt-1">
              {step.description}
            </Text>
          )}
        </View>

        {showDuration && (
          <View className="ml-2">
            <Text className="text-xs text-muted-foreground">
              {formatDurationCompact(step.duration)}
            </Text>
          </View>
        )}
      </View>

      {/* Intensity indicator */}
      <View className="flex-row items-center gap-2 mb-2">
        <View
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: step.color }}
        />
        <Text className="text-xs text-muted-foreground">
          {step.intensityType && step.intensity > 0
            ? `${Math.round(step.intensity)}% ${step.intensityType.replace("%", "")}`
            : "Recovery"}
        </Text>
      </View>

      {/* Targets preview */}
      {step.targets && step.targets.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {step.targets.map((target, index) => (
            <View key={index} className="px-2 py-1 bg-muted/50 rounded-md">
              <Text className="text-xs text-muted-foreground">
                {getMetricDisplayName(target.type)}: {formatTargetRange(target)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

StepPreviewCard.displayName = "StepPreviewCard";
