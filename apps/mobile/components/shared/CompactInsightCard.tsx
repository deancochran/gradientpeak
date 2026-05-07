import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import type React from "react";
import { Pressable, View } from "react-native";
import type {
  CompactInsightLayout,
  InsightSource,
  InsightVisualType,
} from "@/lib/insights/visualPolicy";

const COMPACT_INSIGHT_CARD_SIZE = 160;

const insightSourceLabels = {
  profileMetric: "profile measurement",
  activityAnalysis: "activity analysis",
  planForecast: "plan forecast",
} satisfies Record<InsightSource, string>;

const insightVisualLabels = {
  line: "trend line",
  bar: "bar chart",
  scatter: "activity dots",
  stacked: "stacked distribution",
  calendarDots: "calendar activity dots",
  rankedLollipop: "ranked effort bars",
  loadMultiLine: "multi-line load trend",
  readinessTrajectory: "readiness trajectory",
} satisfies Record<InsightVisualType, string>;

function getVisualPolicyHint(visualPolicy?: {
  source: InsightSource;
  visualType: InsightVisualType;
}) {
  if (!visualPolicy) return undefined;
  return `${insightSourceLabels[visualPolicy.source]} shown as ${insightVisualLabels[visualPolicy.visualType]}.`;
}

function CompactInsightFooter({
  value,
  hasData,
  layout,
  summary,
}: {
  value: string;
  hasData: boolean;
  layout: CompactInsightLayout;
  summary?: string;
}) {
  if (!hasData) {
    return (
      <Text className="text-2xl font-semibold text-muted-foreground" numberOfLines={1}>
        No data
      </Text>
    );
  }

  if (layout === "visualFirst") return null;

  if (layout === "summaryFooter") {
    return (
      <Text className="text-xs font-semibold text-muted-foreground" numberOfLines={2}>
        {summary ?? value}
      </Text>
    );
  }

  return (
    <Text className="text-2xl font-semibold text-foreground" numberOfLines={1}>
      {value}
    </Text>
  );
}

export function CompactInsightCard({
  title,
  value,
  icon,
  children,
  hasData = true,
  layout = "metricFooter",
  summary,
  visualPolicy,
  onPress,
  testID,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<any>;
  children: React.ReactNode;
  hasData?: boolean;
  layout?: CompactInsightLayout;
  summary?: string;
  visualPolicy?: { source: InsightSource; visualType: InsightVisualType };
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={getVisualPolicyHint(visualPolicy)}
      onPress={onPress}
      style={{ width: COMPACT_INSIGHT_CARD_SIZE, height: COMPACT_INSIGHT_CARD_SIZE }}
      testID={testID}
    >
      <Card className="h-full rounded-[28px] border border-border/70 bg-muted/20">
        <CardContent
          className={`h-full p-3.5 ${layout === "visualFirst" && hasData ? "gap-3" : "justify-between"}`}
        >
          <View className="flex-row items-center gap-2">
            <Icon as={icon} size={16} className="text-muted-foreground" />
            <Text className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
              {title}
            </Text>
          </View>

          <View
            className={layout === "visualFirst" && hasData ? "flex-1 justify-center" : "shrink-0"}
          >
            {children}
          </View>

          <CompactInsightFooter value={value} hasData={hasData} layout={layout} summary={summary} />
        </CardContent>
      </Card>
    </Pressable>
  );
}
