import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { CalendarCheck } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface ActivityPlanSummarySectionProps {
  description?: string | null;
  detailBadges: string[];
  durationLabel: string;
  intensityFactor?: number | null;
  name: string;
  notes?: string | null;
  scheduledDate?: string | null;
  stepsCount: number;
  tss?: number | null;
}

export function ActivityPlanSummarySection({
  description,
  detailBadges,
  durationLabel,
  intensityFactor,
  name,
  notes,
  scheduledDate,
  stepsCount,
  tss,
}: ActivityPlanSummarySectionProps) {
  return (
    <>
      <Text className="mb-2 text-3xl font-bold text-foreground">{name}</Text>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {detailBadges.map((badge) => (
          <View key={badge} className="rounded-full bg-muted px-3 py-1.5">
            <Text className="text-xs font-medium capitalize text-muted-foreground">{badge}</Text>
          </View>
        ))}
      </View>
      {scheduledDate && (
        <View className="mb-4 flex-row items-center rounded-2xl bg-primary/10 px-4 py-3">
          <Icon as={CalendarCheck} size={20} className="text-primary mr-3" />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-primary mb-0.5">Scheduled activity</Text>
            <Text className="text-xs text-primary/80">
              {format(new Date(scheduledDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}
            </Text>
          </View>
        </View>
      )}
      <View className="mb-4 gap-3 rounded-2xl bg-muted/30 px-4 py-4">
        <View className="flex-row justify-between gap-3">
          <OverviewMetric label="Duration" value={durationLabel} />
          <OverviewMetric label="TSS" value={tss ? `${tss}` : "--"} />
          <OverviewMetric
            label="Intensity"
            value={intensityFactor ? intensityFactor.toFixed(2) : "--"}
          />
          <OverviewMetric label="Steps" value={`${stepsCount}`} />
        </View>
        {(description || notes) && (
          <View className="gap-2 border-t border-border/60 pt-3">
            {description ? (
              <View className="gap-1">
                <Text className="text-sm font-semibold text-foreground">Overview</Text>
                <Text className="text-sm leading-5 text-muted-foreground">{description}</Text>
              </View>
            ) : null}
            {notes ? (
              <View className="gap-1">
                <Text className="text-sm font-semibold text-foreground">Notes</Text>
                <Text className="text-sm leading-5 text-muted-foreground">{notes}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center gap-1">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-sm font-semibold text-foreground">{value}</Text>
    </View>
  );
}
