import { buildDirectPlannedSessionCreateInput } from "@repo/api/client";
import { usePlannedSessionMutations } from "@repo/api/react";
import { Text } from "@repo/ui/components/text";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuthStore } from "@/lib/stores/auth-store";

export function PersonalPlannedSessionCreate({ planningDate }: { planningDate: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const profileId = useAuthStore((state) => state.profile?.id ?? null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef(randomUUID());
  const plansQuery = api.activityPlans.list.useQuery({ ownerScope: "own", limit: 100 });
  const mutations = usePlannedSessionMutations({
    onConflict: async () => {
      await Promise.all([
        utils.calendar.page.invalidate(),
        utils.plannedSessions.range.invalidate(),
      ]);
    },
    onReceipt: () => router.replace(ROUTES.PLAN.CALENDAR),
  });
  const selectedPlan = plansQuery.data?.items.find((plan) => plan.id === selectedPlanId) ?? null;

  const create = async () => {
    if (!profileId || !selectedPlan) {
      setError("Choose an activity plan after your profile has loaded.");
      return;
    }
    setError(null);
    try {
      await mutations.create.mutateAsync(
        buildDirectPlannedSessionCreateInput({
          profileId,
          planningDate,
          operationId: operationId.current,
          activityPlanId: selectedPlan.id,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create this planned session.");
    }
  };

  return (
    <View className="gap-4" testID="personal-planned-session-create">
      <View className="gap-1">
        <Text className="text-lg font-semibold text-foreground">Personal planned session</Text>
        <Text className="text-sm text-muted-foreground">
          Schedule an immutable copy of one saved activity plan for {planningDate}.
        </Text>
      </View>
      {plansQuery.isError ? (
        <Pressable
          accessibilityRole="button"
          className="rounded-xl border border-border px-4 py-3"
          onPress={() => void plansQuery.refetch()}
        >
          <Text className="text-sm text-destructive">Plans could not be loaded. Tap to retry.</Text>
        </Pressable>
      ) : (
        <View className="gap-2">
          {(plansQuery.data?.items ?? []).map((plan) => {
            const selected = plan.id === selectedPlanId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`rounded-xl border px-4 py-3 ${selected ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                key={plan.id}
                onPress={() => setSelectedPlanId(plan.id)}
              >
                <Text className="font-medium text-foreground">{plan.name}</Text>
                <Text className="mt-1 text-xs capitalize text-muted-foreground">
                  {plan.activityCategory} · revision {plan.activityPlanRevision}
                </Text>
              </Pressable>
            );
          })}
          {!plansQuery.isLoading && plansQuery.data?.items.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              Create an activity plan before scheduling a personal session.
            </Text>
          ) : null}
        </View>
      )}
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !selectedPlan || mutations.create.isPending }}
        className="rounded-xl bg-primary px-4 py-3 disabled:opacity-50"
        disabled={!selectedPlan || mutations.create.isPending}
        onPress={() => void create()}
        testID="personal-planned-session-submit"
      >
        <Text className="text-center font-semibold text-primary-foreground">
          {mutations.create.isPending ? "Scheduling..." : "Schedule session"}
        </Text>
      </Pressable>
    </View>
  );
}
