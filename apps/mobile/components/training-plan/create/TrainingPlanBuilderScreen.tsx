import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Stack, useRouter } from "expo-router";
import { CalendarDays, CircleAlert, Minus, Plus, Trash2 } from "lucide-react-native";
import { useMemo, useReducer, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { ActivityPlanCard, type ActivityPlanCardData } from "@/components/shared/ActivityPlanCard";
import { AppSelectionModal } from "@/components/shared/AppSelectionModal";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { createDefaultTrainingPlanBuilderState } from "@/lib/training-plan-creation/defaults";
import { toTrainingPlanCreatePayload } from "@/lib/training-plan-creation/mappers";
import { trainingPlanBuilderReducer } from "@/lib/training-plan-creation/reducer";
import {
  selectBuilderSummary,
  selectSaveReadiness,
  selectSessionById,
} from "@/lib/training-plan-creation/selectors";
import type {
  TrainingPlanActivityPlanFacts,
  TrainingPlanBuilderSession,
} from "@/lib/training-plan-creation/types";

type ActivityPlanListItem = {
  id: string;
  name: string;
  activity_category: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  likes_count?: number | null;
  has_liked?: boolean;
  authoritative_metrics?: {
    estimated_duration?: number | null;
    estimated_tss?: number | null;
    intensity_factor?: number | null;
    estimated_distance?: number | null;
  } | null;
  template_visibility?: string | null;
  is_system_template?: boolean | null;
};

const createLocalId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function formatRelativeDay(offsetDays: number) {
  if (offsetDays === 0) {
    return "Day 1";
  }
  return `Day ${offsetDays + 1}`;
}

function toActivityPlanFacts(activityPlan: ActivityPlanListItem): TrainingPlanActivityPlanFacts {
  return {
    id: activityPlan.id,
    name: activityPlan.name,
    published:
      activityPlan.template_visibility === "public" || activityPlan.is_system_template === true,
    accessible: true,
    estimatedTss: activityPlan.authoritative_metrics?.estimated_tss ?? null,
    estimatedDurationSeconds: activityPlan.authoritative_metrics?.estimated_duration ?? null,
  };
}

function toActivityPlanCardData(activityPlan: ActivityPlanListItem): ActivityPlanCardData {
  return {
    id: activityPlan.id,
    name: activityPlan.name,
    activityType: activityPlan.activity_category,
    description: activityPlan.description ?? undefined,
    estimatedDuration: activityPlan.authoritative_metrics?.estimated_duration ?? undefined,
    estimatedTss: activityPlan.authoritative_metrics?.estimated_tss ?? undefined,
    intensityFactor: activityPlan.authoritative_metrics?.intensity_factor ?? undefined,
    estimatedDistance: activityPlan.authoritative_metrics?.estimated_distance ?? undefined,
    createdAt: activityPlan.created_at,
    updatedAt: activityPlan.updated_at,
    likes_count: activityPlan.likes_count ?? undefined,
    has_liked: activityPlan.has_liked,
  };
}

function createSession(offsetDays: number): TrainingPlanBuilderSession {
  return {
    localId: createLocalId(),
    offsetDays,
    activityPlan: null,
  };
}

export function TrainingPlanBuilderScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const [state, dispatch] = useReducer(trainingPlanBuilderReducer, undefined, () =>
    createDefaultTrainingPlanBuilderState({ createId: createLocalId }),
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const activityPlansQuery = api.activityPlans.list.useQuery({
    ownerScope: "all",
    includeEstimation: true,
    limit: 100,
  });
  const createPlanMutation = useReliableMutation(api.trainingPlans.create, {
    invalidate: [utils.trainingPlans],
    onSuccess: (createdPlan) => {
      router.replace({ pathname: "/training-plan-detail", params: { id: createdPlan.id } });
    },
    onError: (error) => {
      Alert.alert("Could not create plan", error.message || "Try again after reviewing the plan.");
    },
  });

  const summary = selectBuilderSummary(state);
  const saveReadiness = selectSaveReadiness(state);
  const selectedSession = selectedSessionId ? selectSessionById(state, selectedSessionId) : null;
  const activityPlanItems = useMemo(
    () =>
      (activityPlansQuery.data?.items ?? []).filter(
        (plan) => plan.template_visibility === "public" || plan.is_system_template === true,
      ),
    [activityPlansQuery.data?.items],
  );

  const addSession = () => {
    const nextOffsetDays = summary.sessionCount === 0 ? 0 : summary.durationDays;
    const session = createSession(nextOffsetDays);
    dispatch({ type: "session.add", session });
    dispatch({ type: "selection.set", selection: { type: "session", sessionId: session.localId } });
    setSelectedSessionId(session.localId);
  };

  const handleCreate = async () => {
    if (!saveReadiness.canSave) {
      Alert.alert(
        "Plan needs attention",
        saveReadiness.blockers.map((blocker) => blocker.message).join("\n"),
      );
      return;
    }

    await createPlanMutation.mutateAsync(toTrainingPlanCreatePayload(state));
  };

  const handleSelectActivityPlan = (activityPlan: ActivityPlanListItem) => {
    if (!selectedSessionId) {
      return;
    }
    dispatch({
      type: "session.assignActivityPlan",
      sessionId: selectedSessionId,
      activityPlan: toActivityPlanFacts(activityPlan),
    });
    setSelectedSessionId(null);
  };

  const updateSessionTitle = (session: TrainingPlanBuilderSession, title: string) => {
    const nextOverrides = {
      ...session.eventOverrides,
      title: title.trim().length > 0 ? title : undefined,
    };
    dispatch({
      type: "session.updateEventOverrides",
      sessionId: session.localId,
      eventOverrides: nextOverrides,
    });
  };

  const updateSessionStartTime = (session: TrainingPlanBuilderSession, startTime: string) => {
    const nextOverrides = {
      ...session.eventOverrides,
      start_time: startTime.trim().length > 0 ? startTime : undefined,
    };
    dispatch({
      type: "session.updateEventOverrides",
      sessionId: session.localId,
      eventOverrides: nextOverrides,
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Create training plan",
          headerRight: () => (
            <Button
              disabled={!saveReadiness.canSave || createPlanMutation.isPending}
              onPress={() => void handleCreate()}
              size="sm"
            >
              {createPlanMutation.isPending ? <ActivityIndicator size="small" /> : null}
              <Text>Create</Text>
            </Button>
          ),
        }}
      />

      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4 pb-10">
        <View className="gap-2">
          <Text className="text-2xl font-semibold text-foreground">Build a reusable plan</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Assign published activity plans to relative days. Real calendar dates are chosen later
            when this plan is applied.
          </Text>
        </View>

        <View className="gap-3 rounded-2xl border border-border bg-card p-4">
          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">Plan name</Text>
            <Input
              value={state.details.name}
              onChangeText={(name) => dispatch({ type: "details.update", patch: { name } })}
              placeholder="Base builder, race prep, return to training..."
            />
          </View>
          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">Description</Text>
            <Input
              value={state.details.description}
              onChangeText={(description) =>
                dispatch({ type: "details.update", patch: { description } })
              }
              placeholder="What this plan is designed to do"
              multiline
              className="min-h-24"
            />
          </View>
        </View>

        <View className="gap-3 rounded-2xl border border-border bg-card p-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-base font-semibold text-foreground">Timeline</Text>
              <Text className="text-xs leading-5 text-muted-foreground">
                {summary.sessionCount} session{summary.sessionCount === 1 ? "" : "s"} across{" "}
                {summary.durationDays} day{summary.durationDays === 1 ? "" : "s"}
              </Text>
            </View>
            <Button onPress={addSession} size="sm" variant="outline">
              <Plus size={14} className="text-foreground" />
              <Text>Add</Text>
            </Button>
          </View>

          <View className="gap-2 rounded-xl bg-muted/30 p-3">
            <View className="h-16 flex-row items-end gap-1">
              {state.schedule.sessions.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                  <Text className="text-xs text-muted-foreground">
                    Add a session to start the plan.
                  </Text>
                </View>
              ) : (
                state.schedule.sessions.map((session) => (
                  <View key={session.localId} className="flex-1 justify-end gap-1">
                    <View
                      className={
                        session.activityPlan
                          ? "min-h-8 rounded-t-md bg-primary"
                          : "min-h-5 rounded-t-md border border-dashed border-muted-foreground/40 bg-background"
                      }
                    />
                    <Text className="text-center text-[10px] text-muted-foreground">
                      {session.offsetDays + 1}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View className="flex-row flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onPress={() =>
                Alert.alert(
                  "Profile assumptions",
                  "Profile assumptions stay local to this builder session.",
                )
              }
            >
              <Text>Profile assumptions</Text>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onPress={() =>
                Alert.alert("Goals", "Builder-local goals are optional and default to priority 10.")
              }
            >
              <Text>Goals</Text>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onPress={() => router.push(ROUTES.PLAN.TRAINING_PREFERENCES)}
            >
              <Text>Training preferences</Text>
            </Button>
          </View>

          <View className="gap-3">
            {state.schedule.sessions.map((session) => (
              <View
                key={session.localId}
                className="gap-2 rounded-xl border border-border bg-background p-3"
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-row items-center gap-2">
                    <CalendarDays size={16} className="text-muted-foreground" />
                    <Text className="text-sm font-semibold text-foreground">
                      {formatRelativeDay(session.offsetDays)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() =>
                        dispatch({
                          type: "session.move",
                          sessionId: session.localId,
                          offsetDays: Math.max(0, session.offsetDays - 1),
                        })
                      }
                      className="rounded-full border border-border p-1.5"
                    >
                      <Minus size={13} className="text-foreground" />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        dispatch({
                          type: "session.move",
                          sessionId: session.localId,
                          offsetDays: session.offsetDays + 1,
                        })
                      }
                      className="rounded-full border border-border p-1.5"
                    >
                      <Plus size={13} className="text-foreground" />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        dispatch({ type: "session.remove", sessionId: session.localId })
                      }
                      className="rounded-full border border-destructive/30 p-1.5"
                    >
                      <Trash2 size={13} className="text-destructive" />
                    </Pressable>
                  </View>
                </View>
                <View className="gap-2">
                  <Text className="text-xs font-medium text-muted-foreground">Session title</Text>
                  <Input
                    value={session.eventOverrides?.title ?? ""}
                    onChangeText={(title) => updateSessionTitle(session, title)}
                    placeholder={session.activityPlan?.name ?? "Optional custom event title"}
                  />
                </View>
                <View className="gap-2">
                  <Text className="text-xs font-medium text-muted-foreground">Start time</Text>
                  <Input
                    value={session.eventOverrides?.start_time ?? ""}
                    onChangeText={(startTime) => updateSessionStartTime(session, startTime)}
                    placeholder="07:30"
                  />
                </View>
                {session.activityPlan ? (
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="flex-1 text-sm text-foreground">
                      {session.activityPlan.name}
                    </Text>
                    <Pressable
                      onPress={() => setSelectedSessionId(session.localId)}
                      className="rounded-full border border-border px-3 py-1"
                    >
                      <Text className="text-xs font-medium text-primary">Change</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1 flex-row items-center gap-2">
                      <CircleAlert size={14} className="text-muted-foreground" />
                      <Text className="text-xs text-muted-foreground">
                        Assign a published activity plan before saving.
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setSelectedSessionId(session.localId)}
                      className="rounded-full border border-border px-3 py-1"
                    >
                      <Text className="text-xs font-medium text-primary">Assign</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>

        {!saveReadiness.canSave ? (
          <View className="gap-2 rounded-2xl border border-border bg-muted/20 p-4">
            <Text className="text-sm font-semibold text-foreground">Before creating</Text>
            {saveReadiness.blockers.slice(0, 3).map((blocker) => (
              <Text key={blocker.code} className="text-xs leading-5 text-muted-foreground">
                {blocker.message}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {selectedSession ? (
        <AppSelectionModal
          description={`Choose the activity plan for ${formatRelativeDay(selectedSession.offsetDays)}.`}
          emptyMessage={
            activityPlansQuery.isLoading ? undefined : "No published activity plans available."
          }
          isLoading={activityPlansQuery.isLoading}
          loadingMessage="Loading activity plans..."
          onClose={() => setSelectedSessionId(null)}
          onRefresh={() => void activityPlansQuery.refetch()}
          refreshDisabled={activityPlansQuery.isFetching}
          title={selectedSession.activityPlan ? "Replace activity plan" : "Assign activity plan"}
        >
          <ScrollView>
            <View className="gap-3 py-1">
              {activityPlanItems.map((activityPlan) => (
                <ActivityPlanCard
                  key={activityPlan.id}
                  activity={toActivityPlanCardData(activityPlan)}
                  onPress={() => handleSelectActivityPlan(activityPlan)}
                  variant="compact"
                />
              ))}
            </View>
          </ScrollView>
        </AppSelectionModal>
      ) : null}
    </>
  );
}
