import { buildDirectPlannedSessionCreateInput } from "@repo/api/client";
import { usePlannedSessionMutations } from "@repo/api/react";
import { Text } from "@repo/ui/components/text";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuthStore } from "@/lib/stores/auth-store";

function approximateDuration(plan: {
  metrics: Array<{ key: string; status: string; value: number | null }>;
}) {
  const duration = plan.metrics.find((metric) => metric.key === "elapsed_duration");
  if (duration?.status !== "available" || duration.value === null) return "Unavailable";
  return `About ${Math.round(duration.value / 60)} min`;
}

function plannedSessionCreateError(error: unknown) {
  const data =
    error &&
    typeof error === "object" &&
    "data" in error &&
    error.data &&
    typeof error.data === "object"
      ? error.data
      : null;
  const code = data && "code" in data && typeof data.code === "string" ? data.code : null;
  const applicationErrorCode =
    data && "applicationErrorCode" in data && typeof data.applicationErrorCode === "string"
      ? data.applicationErrorCode
      : null;
  const httpStatus =
    data && "httpStatus" in data && typeof data.httpStatus === "number" ? data.httpStatus : null;
  const definitive =
    (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) ||
    code === "BAD_REQUEST" ||
    code === "CONFLICT" ||
    code === "FORBIDDEN" ||
    code === "NOT_FOUND" ||
    applicationErrorCode === "ACTIVITY_PLAN_INTEGRITY_FAILED";

  if (applicationErrorCode === "ACTIVITY_PLAN_INTEGRITY_FAILED") {
    return {
      definitive,
      message: "That activity plan needs repair. Choose another plan and try again.",
    };
  }
  switch (code) {
    case "BAD_REQUEST":
      return {
        definitive,
        message: "The schedule details are invalid. Review them and try again.",
      };
    case "CONFLICT":
      return {
        definitive,
        message: "This schedule has changed. Review the calendar and try again.",
      };
    case "FORBIDDEN":
    case "NOT_FOUND":
      return {
        definitive,
        message: "That activity plan is no longer available. Choose another plan.",
      };
    default:
      return {
        definitive,
        message:
          "We could not confirm scheduling. Retry the selected activity plan to keep the same request.",
      };
  }
}

export function PersonalPlannedSessionCreate({ planningDate }: { planningDate: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const profileId = useAuthStore((state) => state.profile?.id ?? null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [submittedPlanId, setSubmittedPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef<string | null>(null);
  const ownPlansQuery = api.activityPlans.list.useInfiniteQuery(
    { ownerScope: "own", limit: 25 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const systemPlansQuery = api.activityPlans.list.useInfiniteQuery(
    { ownerScope: "system", limit: 25 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const mutations = usePlannedSessionMutations({
    onConflict: async () => {
      await utils.calendar.page.invalidate();
    },
    onReceipt: () => router.replace(ROUTES.PLAN.CALENDAR),
  });
  const plans = [
    ...(ownPlansQuery.data?.pages.flatMap((page) => page.items) ?? []),
    ...(systemPlansQuery.data?.pages.flatMap((page) => page.items) ?? []),
  ].filter((plan, index, all) => all.findIndex((candidate) => candidate.id === plan.id) === index);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const plansError = ownPlansQuery.error ?? systemPlansQuery.error;
  const plansLoading = ownPlansQuery.isLoading || systemPlansQuery.isLoading;
  const selectionLocked = submittedPlanId !== null || mutations.create.isPending;
  const canLoadMore = ownPlansQuery.hasNextPage || systemPlansQuery.hasNextPage;

  const create = async () => {
    if (!profileId || !selectedPlan || (submittedPlanId && submittedPlanId !== selectedPlan.id)) {
      setError("Choose an activity plan after your profile has loaded.");
      return;
    }
    setError(null);
    setSubmittedPlanId(selectedPlan.id);
    const currentOperationId = operationId.current ?? randomUUID();
    operationId.current = currentOperationId;
    try {
      await mutations.create.mutateAsync(
        buildDirectPlannedSessionCreateInput({
          profileId,
          planningDate,
          operationId: currentOperationId,
          activityPlanId: selectedPlan.id,
        }),
      );
    } catch (reason) {
      const failure = plannedSessionCreateError(reason);
      if (failure.definitive) {
        // A definitive 4xx did not create this intent, so a corrected attempt needs a new key.
        operationId.current = null;
        setSubmittedPlanId(null);
      }
      setError(failure.message);
    }
  };

  const loadMore = () => {
    if (ownPlansQuery.hasNextPage) void ownPlansQuery.fetchNextPage();
    if (systemPlansQuery.hasNextPage) void systemPlansQuery.fetchNextPage();
  };

  return (
    <View className="gap-4" testID="personal-planned-session-create">
      <View className="gap-1">
        <Text className="text-lg font-semibold text-foreground">Personal planned session</Text>
        <Text className="text-sm text-muted-foreground">
          Choose a catalog activity plan for {planningDate}.
        </Text>
      </View>
      {plansError ? (
        <Pressable
          accessibilityRole="button"
          className="rounded-xl border border-border px-4 py-3"
          onPress={() => void Promise.all([ownPlansQuery.refetch(), systemPlansQuery.refetch()])}
        >
          <Text className="text-sm text-destructive">
            Catalog activity plans could not be loaded. Tap to retry.
          </Text>
        </Pressable>
      ) : (
        <View className="gap-2">
          {plansLoading ? (
            <Text className="text-sm text-muted-foreground">Loading catalog activity plans...</Text>
          ) : null}
          {plans.map((plan) => {
            const selected = plan.id === selectedPlanId;
            return (
              <Pressable
                accessibilityLabel={`Select ${plan.name}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: selectionLocked, selected }}
                className={
                  selected
                    ? "rounded-xl border-2 border-primary"
                    : "rounded-xl border border-border"
                }
                disabled={selectionLocked}
                key={plan.id}
                onPress={() => setSelectedPlanId(plan.id)}
                testID={`catalog-activity-plan-${plan.id}`}
              >
                <ActivityPlanCard plan={plan} variant="compact" />
              </Pressable>
            );
          })}
          {!plansLoading && plans.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              No saved or system catalog activity plans are available to schedule.
            </Text>
          ) : null}
          {canLoadMore ? (
            <Pressable
              accessibilityRole="button"
              className="rounded-xl border border-border px-4 py-3"
              disabled={ownPlansQuery.isFetchingNextPage || systemPlansQuery.isFetchingNextPage}
              onPress={loadMore}
            >
              <Text className="text-center text-sm font-medium text-foreground">
                {ownPlansQuery.isFetchingNextPage || systemPlansQuery.isFetchingNextPage
                  ? "Loading activity plans..."
                  : "Load more activity plans"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
      {selectedPlan ? (
        <View className="rounded-xl border border-border bg-card px-4 py-3">
          <Text className="text-sm font-medium text-foreground">
            Selected activity plan: {selectedPlan.name}
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            Approximate duration: {approximateDuration(selectedPlan)}
          </Text>
        </View>
      ) : null}
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
