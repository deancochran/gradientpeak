import { Card, CardContent } from "@repo/ui/components/card";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { ListSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import { ChevronRight, Eye, EyeOff } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { EntityOwnerRow } from "@/components/shared/EntityOwnerRow";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatTargetDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPlanPreview(plan: any) {
  const structure = plan?.structure ?? {};
  const targetDate = formatTargetDate(structure?.periodization_template?.target_date);
  const tssMin = readNumber(structure?.target_weekly_tss_min);
  const tssMax = readNumber(structure?.target_weekly_tss_max);
  const sessionsPerWeek =
    readNumber(plan?.sessions_per_week_target) ?? readNumber(structure?.target_activities_per_week);
  const durationWeeks =
    readNumber(plan?.durationWeeks?.recommended) ??
    readNumber(plan?.durationWeeks?.min) ??
    readNumber(structure?.duration_weeks);
  const restDays = readNumber(structure?.min_rest_days_per_week);
  const sports = Array.isArray(plan?.sport)
    ? plan.sport.filter((item: unknown) => typeof item === "string")
    : [];

  return {
    targetDate,
    tssLabel:
      tssMin !== null || tssMax !== null
        ? `${Math.round(tssMin ?? tssMax ?? 0)}-${Math.round(tssMax ?? tssMin ?? 0)} TSS`
        : null,
    sessionsLabel: sessionsPerWeek !== null ? `${sessionsPerWeek} sessions/week` : null,
    durationLabel:
      durationWeeks !== null ? `${durationWeeks} week${durationWeeks === 1 ? "" : "s"}` : null,
    restLabel: restDays !== null ? `${restDays} rest day${restDays === 1 ? "" : "s"}` : null,
    sportsLabel: sports.length > 0 ? sports.slice(0, 2).join(" • ") : null,
  };
}

function PreviewPill({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
      <Text className="text-[11px] font-medium text-muted-foreground">{label}</Text>
    </View>
  );
}

function TrainingPlansListScreen() {
  const navigateTo = useAppNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: plans,
    isLoading,
    refetch,
  } = api.trainingPlans.list.useQuery({
    ownerScope: "own",
    includeOwnOnly: true,
    includeSystemTemplates: false,
  });

  const sortedPlans = useMemo(() => plans ?? [], [plans]);
  const planCount = sortedPlans.length;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <ScrollView className="flex-1 bg-background" testID="training-plans-list-loading">
        <View className="p-4">
          <ListSkeleton count={6} />
        </View>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="training-plans-list-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigateTo(ROUTES.PLAN.TRAINING_PLAN.CREATE as any)}
              className="mr-2 rounded-full px-2 py-1"
              testID="training-plans-list-create-trigger"
            >
              <Text className="text-sm font-medium text-primary">Create</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 py-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {planCount > 0 ? (
          <View
            className="rounded-2xl border border-border bg-muted/20 px-4 py-3"
            testID="training-plans-list-summary"
          >
            <Text className="text-sm text-muted-foreground">
              {planCount} {planCount === 1 ? "plan" : "plans"}
            </Text>
          </View>
        ) : null}

        {planCount === 0 ? (
          <View testID="training-plans-list-empty-state">
            <EmptyStateCard
              title="No training plans yet"
              description="Your saved training plans will appear here."
            />
          </View>
        ) : (
          sortedPlans.map((plan) => {
            const isPublic = plan.template_visibility === "public";
            const preview = getPlanPreview(plan);

            return (
              <TouchableOpacity
                key={plan.id}
                onPress={() => navigateTo(ROUTES.PLAN.TRAINING_PLAN.DETAIL(plan.id) as any)}
                activeOpacity={0.8}
                testID={`training-plans-list-item-${plan.id}`}
              >
                <Card className="rounded-3xl border border-border bg-card">
                  <CardContent className="p-4 gap-3">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 gap-1">
                        <Text className="text-base font-semibold text-foreground">
                          {plan.name || "Untitled training plan"}
                        </Text>
                        <Text className="text-sm text-muted-foreground">
                          {plan.description?.trim() ||
                            "No description added for this training plan."}
                        </Text>
                      </View>
                    </View>

                    {plan.owner ? (
                      <EntityOwnerRow owner={plan.owner} subtitle="Plan owner" />
                    ) : null}

                    <View className="rounded-2xl bg-muted/20 px-3 py-3">
                      <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Plan preview
                      </Text>
                      <View className="mt-2 flex-row flex-wrap gap-2">
                        {preview.durationLabel ? (
                          <PreviewPill label={preview.durationLabel} />
                        ) : null}
                        {preview.sessionsLabel ? (
                          <PreviewPill label={preview.sessionsLabel} />
                        ) : null}
                        {preview.tssLabel ? <PreviewPill label={preview.tssLabel} /> : null}
                        {preview.restLabel ? <PreviewPill label={preview.restLabel} /> : null}
                      </View>
                      {preview.targetDate || preview.sportsLabel ? (
                        <Text className="mt-2 text-xs text-muted-foreground">
                          {[
                            preview.targetDate ? `Target ${preview.targetDate}` : null,
                            preview.sportsLabel,
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </Text>
                      ) : (
                        <Text className="mt-2 text-xs text-muted-foreground">
                          Open the plan to review linked workouts, route-backed sessions, and the
                          full microcycle layout.
                        </Text>
                      )}
                    </View>

                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-1.5">
                        <Icon
                          as={isPublic ? Eye : EyeOff}
                          size={12}
                          className="text-muted-foreground"
                        />
                        <Text className="text-xs text-muted-foreground">
                          {isPublic ? "Public template" : "Private plan"}
                        </Text>
                      </View>
                      <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
                    </View>
                  </CardContent>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

export default function TrainingPlansListScreenWithBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <TrainingPlansListScreen />
    </ErrorBoundary>
  );
}
