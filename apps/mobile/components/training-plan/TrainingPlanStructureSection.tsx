import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from "react-native";
import { AppSelectionModal } from "@/components/shared/AppSelectionModal";

type StructureSessionRow = {
  key: string;
  title: string;
  activityPlanId: string | null;
  dayOffset: number;
  sourcePath: Array<string | number>;
};

type ActivityPlanListItem = {
  id: string;
  name: string;
  activity_category?: string | null;
  authoritative_metrics?: {
    estimated_tss?: number | null;
    estimated_duration?: number | null;
  } | null;
  structure?: unknown;
};

type GroupedMicrocycleSessions = {
  microcycle: number;
  days: Array<{
    dayOffset: number;
    sessions: StructureSessionRow[];
  }>;
};

interface TrainingPlanStructureSectionProps {
  activityPlanItems: ActivityPlanListItem[];
  activityPlanNameById: Map<string, string>;
  formatCompactDayLabel: (dayOffset: number) => string;
  groupedStructureSessions: GroupedMicrocycleSessions[];
  embedded?: boolean;
  hideMicrocycleHeaders?: boolean;
  isLoadingActivityPlans: boolean;
  isOwnedByUser: boolean;
  onActivityPickerOpenChange: (open: boolean) => void;
  onOpenActivityPickerForSession: (session: StructureSessionRow) => void;
  onRefreshActivityPlans: () => void;
  onRemoveActivityFromSession: (session: StructureSessionRow) => void;
  renderSessionActivityContent?: (session: StructureSessionRow) => React.ReactNode;
  onSelectActivityForSession: (activityPlan: ActivityPlanListItem) => void;
  selectedSessionRow: StructureSessionRow | null;
  showActivityPicker: boolean;
  title?: string;
  description?: string;
  updatePlanStructurePending: boolean;
}

export function TrainingPlanStructureSection({
  activityPlanItems,
  activityPlanNameById,
  description,
  embedded = false,
  formatCompactDayLabel,
  groupedStructureSessions,
  hideMicrocycleHeaders = false,
  isLoadingActivityPlans,
  isOwnedByUser,
  onActivityPickerOpenChange,
  onOpenActivityPickerForSession,
  onRefreshActivityPlans,
  onRemoveActivityFromSession,
  renderSessionActivityContent,
  onSelectActivityForSession,
  selectedSessionRow,
  showActivityPicker,
  title,
  updatePlanStructurePending,
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
                        <View className="flex-row flex-wrap gap-2">
                          {isOwnedByUser ? (
                            <TouchableOpacity
                              onPress={() => onOpenActivityPickerForSession(session)}
                              disabled={updatePlanStructurePending}
                              className="rounded-full border border-border px-2 py-1"
                              activeOpacity={0.8}
                            >
                              <Text className="text-[11px] font-medium text-primary">
                                {session.activityPlanId ? "Change" : "Add"}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {isOwnedByUser && session.activityPlanId ? (
                            <TouchableOpacity
                              onPress={() => onRemoveActivityFromSession(session)}
                              disabled={updatePlanStructurePending}
                              className="rounded-full border border-destructive/30 px-2 py-1"
                              activeOpacity={0.8}
                            >
                              <Text className="text-[11px] font-medium text-destructive">
                                Remove
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
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

      {showActivityPicker ? (
        <AppSelectionModal
          description={
            selectedSessionRow
              ? `Select an activity plan for ${selectedSessionRow.title}.`
              : "Select an activity plan for this session."
          }
          emptyMessage={
            !isLoadingActivityPlans && activityPlanItems.length === 0
              ? "You do not have any activity plans yet."
              : undefined
          }
          isLoading={isLoadingActivityPlans}
          loadingMessage="Loading activity plans..."
          onClose={() => onActivityPickerOpenChange(false)}
          onRefresh={onRefreshActivityPlans}
          refreshDisabled={isLoadingActivityPlans || updatePlanStructurePending}
          testID="training-plan-activity-picker-modal"
          title={
            selectedSessionRow?.activityPlanId ? "Replace activity plan" : "Assign activity plan"
          }
        >
          <ScrollView>
            <View className="gap-2 py-1">
              {activityPlanItems.map((activityPlan) => (
                <TouchableOpacity
                  key={activityPlan.id}
                  className="rounded-md border border-border px-3 py-2"
                  activeOpacity={0.8}
                  disabled={updatePlanStructurePending}
                  onPress={() => void onSelectActivityForSession(activityPlan)}
                >
                  <Text className="text-sm font-medium text-foreground">{activityPlan.name}</Text>
                  <Text className="text-[11px] text-muted-foreground">{activityPlan.id}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </AppSelectionModal>
      ) : null}
    </>
  );
}
