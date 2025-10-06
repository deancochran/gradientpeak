// ================================
// Activity Graph Component
// ================================

interface ActivityGraphProps {
  structure: ActivityPlanStructure;
  currentStep?: number;
  onStepPress?: (stepIndex: number) => void;
  className?: string;
}
export const ActivityGraph = memo<ActivityGraphProps>(function ActivityGraph({
  structure,
  currentStep,
  onStepPress,
  className = "h-24",
}: ActivityGraphProps) {
  const profileData = extractActivityProfile(structure);
  const totalDuration = profileData.reduce(
    (sum, step) => sum + step.duration,
    0,
  );

  if (profileData.length === 0) {
    return (
      <View className={`bg-muted/30 rounded-lg p-4 ${className}`}>
        <Text className="text-center text-muted-foreground">No plan data</Text>
      </View>
    );
  }

  return (
    <View className={`bg-muted/30 rounded-lg p-2 ${className}`}>
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-xs font-medium">Activity Profile</Text>
        <Text className="text-xs text-muted-foreground">
          {formatDurationCompact(totalDuration)}
        </Text>
      </View>

      <View className="flex-1 flex-row items-end overflow-hidden rounded">
        {profileData.map((step, index) => {
          const width = Math.max(2, (step.duration / totalDuration) * 100);
          const height = Math.max(
            20,
            Math.min(100, (step.intensity / 120) * 100),
          ); // Scale to 120% FTP max
          const isCurrentStep = currentStep === index;

          return (
            <Pressable
              key={index}
              style={{
                width: `${width}%`,
                height: `${height}%`,
                marginRight: 1,
                opacity: isCurrentStep ? 1 : 0.8,
              }}
              className={`rounded-sm ${isCurrentStep ? "ring-2 ring-blue-500" : ""}`}
              onPress={() => onStepPress?.(index)}
            >
              <View
                className="flex-1 rounded-sm"
                style={{ backgroundColor: step.color }}
              >
                {/* Step indicator for current step */}
                {isCurrentStep && (
                  <View className="absolute -top-1 left-1/2 transform -translate-x-1/2">
                    <View className="w-2 h-2 bg-blue-500 rounded-full" />
                  </View>
                )}

                {/* Step name for wider steps */}
                {width > 8 && step.name && (
                  <Text
                    className="text-xs text-white text-center px-1"
                    numberOfLines={1}
                    style={{ fontSize: Math.max(8, Math.min(10, width / 2)) }}
                  >
                    {step.name}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row justify-between mt-1">
        <Text className="text-xs text-muted-foreground">0:00</Text>
        <Text className="text-xs text-muted-foreground">
          {formatDurationCompact(totalDuration)}
        </Text>
      </View>
    </View>
  );
});

ActivityGraph.displayName = "ActivityGraph";
