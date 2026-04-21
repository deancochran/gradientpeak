import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { CalendarCheck } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { getActivityCategoryConfig } from "@/lib/constants/activities";

interface ActivityPlanSummarySectionProps {
  activityCategory: string;
  description?: string | null;
  headerAction?: React.ReactNode;
  name: string;
  notes?: string | null;
  scheduledDate?: string | null;
}

export function ActivityPlanSummarySection({
  activityCategory,
  description,
  headerAction,
  name,
  notes,
  scheduledDate,
}: ActivityPlanSummarySectionProps) {
  const activityConfig = getActivityCategoryConfig(activityCategory);

  return (
    <>
      <View className="flex-row items-start gap-3">
        <View className={`rounded-full p-2.5 ${activityConfig.bgColor}`}>
          <Icon as={activityConfig.icon} size={18} className={activityConfig.color} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-2xl font-semibold text-foreground">{name}</Text>
          {description ? (
            <Text className="text-sm leading-5 text-muted-foreground">{description}</Text>
          ) : null}
        </View>
        {headerAction ? <View>{headerAction}</View> : null}
      </View>
      {scheduledDate && (
        <View className="mt-4 flex-row items-center rounded-2xl bg-primary/10 px-4 py-3">
          <Icon as={CalendarCheck} size={20} className="text-primary mr-3" />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-primary mb-0.5">Scheduled activity</Text>
            <Text className="text-xs text-primary/80">
              {format(new Date(scheduledDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}
            </Text>
          </View>
        </View>
      )}
      {notes ? (
        <View className="mt-4 rounded-2xl bg-muted/30 px-4 py-3">
          <Text className="text-sm leading-5 text-muted-foreground">{notes}</Text>
        </View>
      ) : null}
    </>
  );
}
