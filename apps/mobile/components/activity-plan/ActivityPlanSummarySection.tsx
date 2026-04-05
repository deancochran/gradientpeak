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
      <Text className="text-3xl font-bold mb-2">{name}</Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {detailBadges.map((badge) => (
          <View key={badge} className="rounded-full border border-border bg-muted/30 px-3 py-1.5">
            <Text className="text-xs font-medium capitalize text-muted-foreground">{badge}</Text>
          </View>
        ))}
      </View>
      {scheduledDate && (
        <View className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-4 flex-row items-center">
          <Icon as={CalendarCheck} size={20} className="text-primary mr-3" />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-primary mb-0.5">Scheduled Activity</Text>
            <Text className="text-xs text-primary/80">
              {format(new Date(scheduledDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}
            </Text>
          </View>
        </View>
      )}
      <View className="bg-card border border-border rounded-xl p-4 mb-4 gap-3">
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
          <View className="gap-2 border-t border-border pt-3">
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
      <Text className="text-base font-semibold text-foreground">{value}</Text>
    </View>
  );
}
