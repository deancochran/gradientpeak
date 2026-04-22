import { Icon } from "@repo/ui/components/icon";
import { Progress } from "@repo/ui/components/progress";
import { Text } from "@repo/ui/components/text";
import { CheckCircle2, Target } from "lucide-react-native";
import { View } from "react-native";

interface WeeklyProgressCardProps {
  completedTSS: number;
  plannedTSS: number;
  targetTSS: number;
  completedActivities: number;
  totalPlannedActivities: number;
}

export function WeeklyProgressCard({
  completedTSS,
  plannedTSS,
  targetTSS,
  completedActivities,
  totalPlannedActivities,
}: WeeklyProgressCardProps) {
  // Calculate progress percentages
  const tssProgress = targetTSS > 0 ? (completedTSS / targetTSS) * 100 : 0;
  const activityProgress =
    totalPlannedActivities > 0 ? (completedActivities / totalPlannedActivities) * 100 : 0;

  // Determine progress bar color based on completion
  const getTSSProgressColor = () => {
    if (tssProgress >= 90) return "bg-green-500";
    if (tssProgress >= 70) return "bg-emerald-500";
    if (tssProgress >= 50) return "bg-yellow-500";
    return "bg-orange-500";
  };

  const getActivityProgressColor = () => {
    if (activityProgress >= 90) return "bg-green-500";
    if (activityProgress >= 70) return "bg-emerald-500";
    if (activityProgress >= 50) return "bg-yellow-500";
    return "bg-orange-500";
  };

  return (
    <View className="gap-6 rounded-xl border border-border bg-card p-4">
      <Text className="text-base font-semibold text-foreground">This Week&apos;s Progress</Text>

      <ProgressSection
        icon={Target}
        indicatorClassName={getTSSProgressColor()}
        label="Training Stress Score"
        progress={tssProgress}
        summary={`${Math.round(completedTSS)}`}
        targetLabel={`/ ${Math.round(targetTSS)} TSS target`}
      />

      {plannedTSS > completedTSS ? (
        <Text className="text-xs font-medium text-blue-500">
          {Math.round(plannedTSS - completedTSS)} TSS remaining
        </Text>
      ) : null}

      <View className="h-px bg-border" />

      <ProgressSection
        icon={CheckCircle2}
        indicatorClassName={getActivityProgressColor()}
        label="Activity Completion"
        progress={activityProgress}
        summary={`${completedActivities}`}
        targetLabel={`/ ${totalPlannedActivities} activities`}
      />

      {tssProgress >= 100 ? (
        <Text className="text-sm font-medium text-green-600">
          Weekly TSS target achieved. Great work.
        </Text>
      ) : null}

      {tssProgress < 50 && totalPlannedActivities > completedActivities ? (
        <Text className="text-sm font-medium text-orange-600">
          Behind on weekly target. Consider completing scheduled activities.
        </Text>
      ) : null}
    </View>
  );
}

function ProgressSection({
  icon,
  indicatorClassName,
  label,
  progress,
  summary,
  targetLabel,
}: {
  icon: any;
  indicatorClassName: string;
  label: string;
  progress: number;
  summary: string;
  targetLabel: string;
}) {
  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Icon as={icon} size={18} className="text-primary" />
          <Text className="font-semibold text-foreground">{label}</Text>
        </View>
        <Text className="text-sm text-muted-foreground">{Math.round(progress)}%</Text>
      </View>

      <Progress
        value={Math.min(progress, 100)}
        className="mb-2 h-3"
        indicatorClassName={indicatorClassName}
      />

      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-foreground">{summary}</Text>
        <Text className="text-sm text-muted-foreground">{targetLabel}</Text>
      </View>
    </View>
  );
}
