import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import type React from "react";
import { View } from "react-native";

type StructureSessionRow = {
  key: string;
  title: string;
  activityPlanId: string | null;
  dayOffset: number;
};

type GroupedMicrocycleSessions = {
  microcycle: number;
  days: Array<{
    dayOffset: number;
    sessions: StructureSessionRow[];
  }>;
};

interface TrainingPlanStructureSectionProps {
  activityPlanNameById: Map<string, string>;
  formatCompactDayLabel: (dayOffset: number) => string;
  groupedStructureSessions: GroupedMicrocycleSessions[];
  embedded?: boolean;
  hideMicrocycleHeaders?: boolean;
  renderSessionActivityContent?: (session: StructureSessionRow) => React.ReactNode;
  title?: string;
  description?: string;
}

export function TrainingPlanStructureSection({
  activityPlanNameById,
  description,
  embedded = false,
  formatCompactDayLabel,
  groupedStructureSessions,
  hideMicrocycleHeaders = false,
  renderSessionActivityContent,
  title,
}: TrainingPlanStructureSectionProps) {
  const microcycleContainerClassName = embedded
    ? "gap-3"
    : "gap-3 rounded-2xl border border-border bg-muted/20 p-3";
  const dayContainerClassName = embedded
    ? "gap-3 py-2"
    : "gap-3 rounded-xl border border-border/50 bg-background/70 p-3";
  const fallbackSessionClassName = embedded
    ? "gap-2 rounded-xl border border-border/40 bg-muted/10 px-3 py-2.5"
    : "rounded-xl border border-border/60 bg-background px-3 py-2.5";

  const sectionContent = (
    <View className="gap-3">
      <View className="gap-2">
        <Text className="text-xs text-muted-foreground">
          {description ||
            "Review how sessions are distributed across each week before scheduling the full plan."}
        </Text>
        {groupedStructureSessions.length === 0 ? (
          <Text className="text-xs text-muted-foreground">
            No structured sessions found in this template yet.
          </Text>
        ) : (
          groupedStructureSessions.map((microcycle) => (
            <View
              key={`microcycle-${microcycle.microcycle}`}
              className={microcycleContainerClassName}
            >
              {hideMicrocycleHeaders ? null : (
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-sm font-semibold text-foreground">
                    Week {microcycle.microcycle}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {microcycle.days.reduce((count, day) => count + day.sessions.length, 0)} session
                    {microcycle.days.reduce((count, day) => count + day.sessions.length, 0) === 1
                      ? ""
                      : "s"}
                  </Text>
                </View>
              )}
              {microcycle.days.map((day) => (
                <View key={`day-${day.dayOffset}`} className={dayContainerClassName}>
                  <Text className="text-xs font-medium text-muted-foreground">
                    {formatCompactDayLabel(day.dayOffset)}
                  </Text>
                  {day.sessions.map((session) => {
                    const linkedActivityName = session.activityPlanId
                      ? (activityPlanNameById.get(session.activityPlanId) ?? "Linked activity plan")
                      : null;
                    const primaryTitle = linkedActivityName ?? session.title;
                    const customActivityContent = renderSessionActivityContent
                      ? renderSessionActivityContent(session)
                      : null;
                    const showCustomLinkedContent = Boolean(
                      session.activityPlanId && customActivityContent,
                    );

                    return (
                      <View key={session.key} className="gap-2">
                        {showCustomLinkedContent ? (
                          customActivityContent
                        ) : (
                          <View className={fallbackSessionClassName}>
                            <View className="gap-2">
                              <Text className="text-sm font-medium text-foreground">
                                {primaryTitle}
                              </Text>
                              {!linkedActivityName ? (
                                <Text className="text-[11px] text-muted-foreground">
                                  No linked activity plan
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ))
        )}
      </View>
    </View>
  );

  return (
    <>
      {embedded ? (
        <View className="gap-2">
          {title ? <Text className="text-base font-semibold text-foreground">{title}</Text> : null}
          {sectionContent}
        </View>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{title || "Sessions by microcycle and day"}</CardTitle>
          </CardHeader>
          <CardContent>{sectionContent}</CardContent>
        </Card>
      )}
    </>
  );
}
