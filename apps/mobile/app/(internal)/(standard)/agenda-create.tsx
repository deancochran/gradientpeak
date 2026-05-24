import { invalidateGoalQueries } from "@repo/api/react";
import { buildGoalCreatePayload, createEmptyGoalDraft, type GoalEditorDraft } from "@repo/core";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import {
  type CreateEventDefaults,
  CreateEventFlow,
  type CreateEventFlowHandle,
} from "@/components/event/create/CreateEventFlow";
import { GoalEditorForm, type GoalEditorFormHandle } from "@/components/goals";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { markEstimated } from "@/lib/estimatedMetrics";
import { useAuthStore } from "@/lib/stores/auth-store";

type AgendaCreateType = "event" | "planned" | "goal";

const CREATE_TYPES: Array<{
  description: string;
  label: string;
  value: AgendaCreateType;
}> = [
  {
    value: "event",
    label: "Event",
    description: "Add a race, appointment, or calendar item.",
  },
  {
    value: "planned",
    label: "Planned activity",
    description: "Schedule one of your saved activity plans.",
  },
  {
    value: "goal",
    label: "Goal",
    description: "Create a target tied to this agenda date.",
  },
];

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isCreateType(value: string | undefined): value is AgendaCreateType {
  return value === "event" || value === "planned" || value === "goal";
}

function parseSuggestionTssDelta(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPlanSuggestionDefaults(input: {
  description?: string;
  tssDelta: number | null;
  type?: string;
}): (CreateEventDefaults & { targetType: AgendaCreateType }) | null {
  const roundedDelta = input.tssDelta === null ? null : Math.round(input.tssDelta);
  const absoluteDelta = roundedDelta === null ? null : Math.abs(roundedDelta);
  const targetCopy =
    absoluteDelta && absoluteDelta > 0
      ? `Target: about ${markEstimated(`${absoluteDelta} TSS`)}.`
      : null;
  const notes = [
    input.description?.trim() || null,
    targetCopy,
    "Created from the Plan tab readiness suggestion.",
  ]
    .filter(Boolean)
    .join("\n\n");

  if ((input.type === "add_load" || (roundedDelta ?? 0) > 0) && (roundedDelta ?? 0) > 0) {
    return {
      createEventType: "planned",
      notes,
      targetType: "planned",
    };
  }

  if ((input.type === "reduce_load" || (roundedDelta ?? 0) < 0) && (roundedDelta ?? 0) < 0) {
    return {
      createEventType: "custom",
      notes,
      title: "Training adjustment",
      targetType: "event",
    };
  }

  return null;
}

export default function AgendaCreateScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const profileId = useAuthStore((state) => state.profile?.id ?? null);
  const eventFlowRef = useRef<CreateEventFlowHandle>(null);
  const goalFormRef = useRef<GoalEditorFormHandle>(null);
  const params = useLocalSearchParams<{
    date?: string;
    planSuggestionDescription?: string;
    planSuggestionTssDelta?: string;
    planSuggestionType?: string;
    trainingPlanId?: string;
    type?: string;
  }>();
  const createDate = readParam(params.date);
  const trainingPlanId = readParam(params.trainingPlanId);
  const planSuggestionDefaults = useMemo(
    () =>
      buildPlanSuggestionDefaults({
        description: readParam(params.planSuggestionDescription),
        tssDelta: parseSuggestionTssDelta(readParam(params.planSuggestionTssDelta)),
        type: readParam(params.planSuggestionType),
      }),
    [params.planSuggestionDescription, params.planSuggestionTssDelta, params.planSuggestionType],
  );
  const requestedType = readParam(params.type);
  const initialType: AgendaCreateType = isCreateType(requestedType)
    ? requestedType
    : (planSuggestionDefaults?.targetType ?? "event");
  const [createType, setCreateType] = useState<AgendaCreateType>(initialType);
  const initialGoalDraft = useMemo(
    () => ({
      ...createEmptyGoalDraft(),
      targetDate: createDate ?? "",
    }),
    [createDate],
  );
  const createGoalMutation = api.goals.create.useMutation({
    onSuccess: async (goal) => {
      await invalidateGoalQueries(utils, { goalId: goal.id });
      router.replace(ROUTES.GOALS.DETAIL(goal.id) as never);
    },
  });

  const handleCreate = () => {
    if (createType === "goal") {
      goalFormRef.current?.submit();
      return;
    }

    eventFlowRef.current?.submit();
  };

  const handleCreateGoal = async (draft: GoalEditorDraft) => {
    if (!profileId) {
      Alert.alert("Unable to create goal", "Your profile is still loading. Please try again.");
      return;
    }

    try {
      await createGoalMutation.mutateAsync(buildGoalCreatePayload({ draft, profileId }));
    } catch (error) {
      Alert.alert(
        "Unable to create goal",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
      keyboardVerticalOffset={80}
      testID="agenda-create-screen"
    >
      <Stack.Screen
        options={{
          title: "Create",
          headerRight: () => (
            <LoadingButton
              disabled={createGoalMutation.isPending}
              loading={createGoalMutation.isPending}
              loadingLabel="Creating..."
              loadingTextClassName="text-primary"
              onPress={handleCreate}
              size="sm"
              testID="agenda-create-submit-button"
              variant="ghost"
            >
              <Text className="text-sm font-semibold text-primary">Create</Text>
            </LoadingButton>
          ),
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-3 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <Text className="text-xl font-semibold text-foreground">Create from agenda</Text>
          <Text className="text-sm text-muted-foreground">
            Choose the record type first; the form below changes to match it.
          </Text>
        </View>

        <View className="gap-2" testID="agenda-create-type-selector">
          {CREATE_TYPES.map((option) => {
            const selected = createType === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`rounded-2xl border px-4 py-3 ${selected ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                onPress={() => setCreateType(option.value)}
                testID={`agenda-create-type-${option.value}`}
              >
                <Text
                  className={`text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}
                >
                  {option.label}
                </Text>
                <Text className="mt-1 text-xs text-muted-foreground">{option.description}</Text>
              </Pressable>
            );
          })}
        </View>

        {createType === "goal" ? (
          <GoalEditorForm
            ref={goalFormRef}
            initialValue={initialGoalDraft}
            isSubmitting={createGoalMutation.isPending}
            onSubmit={handleCreateGoal}
            showSubmitAction={false}
            submitLabel="Create Goal"
          />
        ) : (
          <CreateEventFlow
            key={createType}
            ref={eventFlowRef}
            createDate={createDate}
            defaults={{
              ...planSuggestionDefaults,
              createEventType: createType === "planned" ? "planned" : "custom",
            }}
            onCancel={() => router.back()}
            onCreated={(createdEvent) => router.replace(ROUTES.PLAN.EVENT_DETAIL(createdEvent.id))}
            showFooterActions={false}
            testIDPrefix="agenda-create-event"
            trainingPlanId={trainingPlanId}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
