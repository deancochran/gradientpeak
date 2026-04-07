import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from "react-native";

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
  estimated_tss?: number | null;
  estimated_duration?: number | null;
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
  hasIntervals: (structure: unknown) => boolean;
  isLoadingActivityPlans: boolean;
  isLoadingLinkedPlans: boolean;
  isOwnedByUser: boolean;
  linkedActivityPlanItems: ActivityPlanListItem[];
  maxWeeklyLoad: number;
  onActivityPickerOpenChange: (open: boolean) => void;
  onOpenActivityPickerForSession: (session: StructureSessionRow) => void;
  onRefreshActivityPlans: () => void;
  onRemoveActivityFromSession: (session: StructureSessionRow) => void;
  onSelectActivityForSession: (activityPlan: ActivityPlanListItem) => void;
  onEditStructure: () => void;
  planStructure: any;
  selectedSessionRow: StructureSessionRow | null;
  showActivityPicker: boolean;
  uniqueLinkedActivityPlans: ActivityPlanListItem[];
  updatePlanStructurePending: boolean;
  weeklyLoadSummary: Array<{ microcycle: number; estimatedTss: number }>;
}

function TrainingPlanDetailChip({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
      <Text className="text-xs font-medium capitalize text-foreground">{label}</Text>
    </View>
  );
}

export function TrainingPlanStructureSection({
  activityPlanItems,
  activityPlanNameById,
  formatCompactDayLabel,
  groupedStructureSessions,
  hasIntervals,
  isLoadingActivityPlans,
  isLoadingLinkedPlans,
  isOwnedByUser,
  linkedActivityPlanItems,
  maxWeeklyLoad,
  onActivityPickerOpenChange,
  onEditStructure,
  onOpenActivityPickerForSession,
  onRefreshActivityPlans,
  onRemoveActivityFromSession,
  onSelectActivityForSession,
  planStructure,
  selectedSessionRow,
  showActivityPicker,
  uniqueLinkedActivityPlans,
  updatePlanStructurePending,
  weeklyLoadSummary,
}: TrainingPlanStructureSectionProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Plan overview and structure</CardTitle>
        </CardHeader>
        <CardContent>
          <View className="gap-3">
            {planStructure && (
              <>
                <View className="flex-row flex-wrap gap-2">
                  <TrainingPlanDetailChip
                    label={`${planStructure.target_weekly_tss_min} - ${planStructure.target_weekly_tss_max} weekly TSS`}
                  />
                  <TrainingPlanDetailChip
                    label={`${planStructure.target_activities_per_week} sessions/week`}
                  />
                  <TrainingPlanDetailChip
                    label={`${planStructure.max_consecutive_days} max consecutive days`}
                  />
                  <TrainingPlanDetailChip
                    label={`${planStructure.min_rest_days_per_week} rest days/week`}
                  />
                </View>
                {planStructure.periodization_template && (
                  <>
                    <View className="h-px bg-border" />
                    <View className="flex-row justify-between items-center">
                      <Text className="text-muted-foreground">Periodization</Text>
                      <Text className="font-semibold">
                        {planStructure.periodization_template.starting_ctl} →{" "}
                        {planStructure.periodization_template.target_ctl} CTL
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center">
                      <Text className="text-muted-foreground">Target Date</Text>
                      <Text className="font-semibold">
                        {new Date(
                          planStructure.periodization_template.target_date,
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </Text>
                    </View>
                  </>
                )}
                {isOwnedByUser && (
                  <>
                    <View className="h-px bg-border" />
                    <TouchableOpacity
                      onPress={onEditStructure}
                      className="pt-1"
                      testID="training-plan-edit-structure-link"
                    >
                      <Text className="text-sm font-semibold text-primary">
                        Edit structure in composer
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}

            <View className="h-px bg-border" />
            <View className="gap-2">
              <Text className="text-sm font-semibold">Microcycle weekly load (estimated)</Text>
              {weeklyLoadSummary.length === 0 ? (
                <Text className="text-xs text-muted-foreground">
                  Add linked activity plans to see estimated weekly TSS.
                </Text>
              ) : (
                <View className="gap-2">
                  {weeklyLoadSummary.map((week) => {
                    const widthPercent = Math.max(6, (week.estimatedTss / maxWeeklyLoad) * 100);
                    return (
                      <View key={`week-load-${week.microcycle}`} className="gap-1">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs font-medium text-foreground">
                            Week {week.microcycle}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {Math.round(week.estimatedTss)} TSS
                          </Text>
                        </View>
                        <View className="h-2 rounded-full bg-muted/60 overflow-hidden">
                          <View
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${widthPercent}%` }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View className="h-px bg-border" />
            <View className="gap-2">
              <Text className="text-sm font-semibold">Linked activity plan structures</Text>
              <Text className="text-xs text-muted-foreground">
                These are the workout building blocks referenced by this plan.
              </Text>
              {isLoadingLinkedPlans ? (
                <Text className="text-xs text-muted-foreground">
                  Loading linked activity plans...
                </Text>
              ) : uniqueLinkedActivityPlans.length === 0 ? (
                <Text className="text-xs text-muted-foreground">
                  No linked activity plans in this template yet.
                </Text>
              ) : (
                <View className="gap-2">
                  {uniqueLinkedActivityPlans.map((linkedPlan) => (
                    <View
                      key={`linked-plan-${linkedPlan.id}`}
                      className="rounded-md border border-border/60 bg-background px-2 py-2 gap-1"
                    >
                      <Text className="text-xs font-semibold text-foreground">
                        {linkedPlan.name}
                      </Text>
                      <Text className="text-[11px] text-muted-foreground">
                        {(linkedPlan.activity_category ?? "other").toUpperCase()} ·{" "}
                        {Math.round(
                          Number.isFinite(linkedPlan.estimated_tss)
                            ? (linkedPlan.estimated_tss ?? 0)
                            : 0,
                        )}{" "}
                        TSS ·{" "}
                        {Math.round(
                          Number.isFinite(linkedPlan.estimated_duration)
                            ? (linkedPlan.estimated_duration ?? 0)
                            : 0,
                        )}{" "}
                        min
                      </Text>
                      <Text className="text-[11px] text-muted-foreground">
                        {hasIntervals(linkedPlan.structure)
                          ? "Includes interval structure"
                          : "No interval structure available"}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View className="h-px bg-border" />
            <View className="gap-2">
              <Text className="text-sm font-semibold">Sessions by microcycle and day</Text>
              <Text className="text-xs text-muted-foreground">
                Review how sessions are distributed across each week before scheduling the full
                plan.
              </Text>
              {groupedStructureSessions.length === 0 ? (
                <Text className="text-xs text-muted-foreground">
                  No structured sessions found in this template yet.
                </Text>
              ) : (
                groupedStructureSessions.map((microcycle) => (
                  <View
                    key={`microcycle-${microcycle.microcycle}`}
                    className="gap-2 rounded-md border border-border bg-muted/20 p-2"
                  >
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-sm font-semibold text-foreground">
                        Week {microcycle.microcycle}
                      </Text>
                      <Text className="text-[11px] text-muted-foreground">
                        {microcycle.days.reduce((count, day) => count + day.sessions.length, 0)}{" "}
                        session
                        {microcycle.days.reduce((count, day) => count + day.sessions.length, 0) ===
                        1
                          ? ""
                          : "s"}
                      </Text>
                    </View>
                    {microcycle.days.map((day) => (
                      <View
                        key={`day-${day.dayOffset}`}
                        className="gap-1 rounded-md border border-border/50 bg-background/70 p-2"
                      >
                        <View className="flex-row items-center justify-between gap-2">
                          <Text className="text-xs font-medium text-muted-foreground">
                            {formatCompactDayLabel(day.dayOffset)}
                          </Text>
                          <Text className="text-[11px] text-muted-foreground">
                            {day.sessions.length} item{day.sessions.length === 1 ? "" : "s"}
                          </Text>
                        </View>
                        {day.sessions.map((session) => (
                          <View
                            key={session.key}
                            className="rounded-md border border-border/60 bg-background px-2 py-2"
                          >
                            <View className="flex-row items-start justify-between gap-3">
                              <View className="flex-1 gap-1">
                                <Text className="text-xs font-medium text-foreground">
                                  {session.title}
                                </Text>
                                <Text className="text-[11px] text-muted-foreground">
                                  {session.activityPlanId
                                    ? (activityPlanNameById.get(session.activityPlanId) ??
                                      "Linked activity plan")
                                    : "No linked activity plan"}
                                </Text>
                              </View>
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
                            </View>
                            {isOwnedByUser && session.activityPlanId ? (
                              <View className="mt-2 flex-row items-center gap-2">
                                <TouchableOpacity
                                  onPress={() => onRemoveActivityFromSession(session)}
                                  disabled={updatePlanStructurePending}
                                  className="flex-row items-center gap-1 rounded-full border border-destructive/30 px-2 py-1"
                                  activeOpacity={0.8}
                                >
                                  <Text className="text-[11px] font-medium text-destructive">
                                    Remove
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                ))
              )}
            </View>
          </View>
        </CardContent>
      </Card>

      <Dialog open={showActivityPicker} onOpenChange={onActivityPickerOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {selectedSessionRow?.activityPlanId
                ? "Replace activity plan"
                : "Assign activity plan"}
            </DialogTitle>
            <DialogDescription>
              {selectedSessionRow
                ? `Select an activity plan for ${selectedSessionRow.title}.`
                : "Select an activity plan for this session."}
            </DialogDescription>
          </DialogHeader>

          <View className="max-h-80">
            {isLoadingActivityPlans ? (
              <View className="py-6 items-center gap-2">
                <ActivityIndicator size="small" />
                <Text className="text-xs text-muted-foreground">Loading activity plans...</Text>
              </View>
            ) : activityPlanItems.length === 0 ? (
              <View className="py-6 items-center gap-2">
                <Text className="text-sm text-muted-foreground text-center">
                  You do not have any activity plans yet.
                </Text>
              </View>
            ) : (
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
                      <Text className="text-sm font-medium text-foreground">
                        {activityPlan.name}
                      </Text>
                      <Text className="text-[11px] text-muted-foreground">{activityPlan.id}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={updatePlanStructurePending}>
                <Text className="text-foreground font-medium">Close</Text>
              </Button>
            </DialogClose>
            <Button
              variant="outline"
              disabled={isLoadingActivityPlans || updatePlanStructurePending}
              onPress={onRefreshActivityPlans}
            >
              <Text className="text-foreground font-medium">Refresh</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
