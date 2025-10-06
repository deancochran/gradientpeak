interface TargetMetricsGridProps {
  targets?: IntensityTarget[];
  currentMetrics: {
    heartRate?: number;
    power?: number;
    cadence?: number;
    speed?: number;
  };
}

export const TargetMetricsGrid = memo<TargetMetricsGridProps>(
  function TargetMetricsGrid({
    targets,
    currentMetrics,
  }: TargetMetricsGridProps) {
    if (!targets || targets.length === 0) {
      return (
        <View className="p-4 bg-muted/20 rounded-lg">
          <Text className="text-center text-muted-foreground">
            No targets for this step
          </Text>
        </View>
      );
    }

    const getCurrentValue = (targetType: string): number | undefined => {
      switch (targetType) {
        case "%FTP":
        case "watts":
          return currentMetrics.power;
        case "%MaxHR":
        case "%ThresholdHR":
        case "bpm":
          return currentMetrics.heartRate;
        case "cadence":
          return currentMetrics.cadence;
        case "speed":
          return currentMetrics.speed;
        default:
          return undefined;
      }
    };

    return (
      <View className="gap-3">
        <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Targets & Current
        </Text>
        {targets.map((target, index) => (
          <TargetMetricsCard
            key={`${target.type}-${index}`}
            target={target}
            current={getCurrentValue(target.type)}
          />
        ))}
      </View>
    );
  },
);

TargetMetricsGrid.displayName = "TargetMetricsGrid";
