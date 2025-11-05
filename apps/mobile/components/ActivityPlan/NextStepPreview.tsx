interface UpcomingStepsPreviewProps {
  steps: ActivityProfilePoint[];
  title?: string;
}

export const UpcomingStepsPreview = memo<UpcomingStepsPreviewProps>(
  function UpcomingStepsPreview({
    steps,
    title = "Coming Up Next",
  }: UpcomingStepsPreviewProps) {
    if (steps.length === 0) {
      return null;
    }

    return (
      <View className="mb-4">
        <Text className="text-sm font-medium mb-3">{title}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="gap-3"
        >
          <View className="flex-row gap-3 px-1">
            {steps.map((step, index) => (
              <View key={step.index} className="w-64">
                <StepPreviewCard
                  step={step}
                  isUpcoming={true}
                  showDuration={true}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  },
);

UpcomingStepsPreview.displayName = "UpcomingStepsPreview";
