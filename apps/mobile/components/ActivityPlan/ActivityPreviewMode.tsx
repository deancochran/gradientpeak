// ================================
// Activity Preview Mode
// ================================

const ActivityPreviewMode = memo<{ structure: ActivityPlanStructure }>(
  function ActivityPreviewMode({ structure }) {
    const profileData = extractActivityProfile(structure);

    return (
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Activity Graph */}
        <View className="mb-6">
          <ActivityGraph structure={structure} />
        </View>

        {/* Key Activity Metrics */}
        <ActivityMetricsGrid structure={structure} />

        {/* Step Breakdown Preview */}
        <StepBreakdown
          steps={profileData.slice(0, 6)}
          maxSteps={6}
          showAll={false}
          title="Activity Steps"
        />
      </ScrollView>
    );
  },
);

ActivityPreviewMode.displayName = "ActivityPreviewMode";
