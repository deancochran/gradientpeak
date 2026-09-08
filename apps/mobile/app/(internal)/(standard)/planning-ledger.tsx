import { addDaysDateKey, planningLedgerRequestSchema } from "@repo/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { PlanningLedgerView } from "@/components/plan/ledger/PlanningLedgerView";
import { ErrorState, LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";

export default function PlanningLedgerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    anchorDate?: string | string[];
    period?: string | string[];
  }>();
  const parsedRequest = planningLedgerRequestSchema.safeParse({
    anchorDate: typeof params.anchorDate === "string" ? params.anchorDate : "",
    period: typeof params.period === "string" ? params.period : "",
  });
  const request =
    parsedRequest.success && parsedRequest.data.period !== "month" ? parsedRequest.data : null;
  const query = api.trainingPlans.getPlanningLedger.useQuery(
    request ?? { anchorDate: "1970-01-01", period: "day" },
    { enabled: request !== null },
  );
  const calendarQuery = api.calendar.range.useQuery(
    query.data
      ? {
          startDate: query.data.periodStart,
          endDateExclusive: addDaysDateKey(query.data.periodEnd, 1),
          limit: 500,
        }
      : { startDate: "1970-01-01", endDateExclusive: "1970-01-02", limit: 500 },
    { enabled: request !== null && query.data !== undefined },
  );
  const completedActivities = Array.from(
    new Map(
      (calendarQuery.data?.items ?? []).flatMap((item) =>
        item.activity ? [[item.activity.id, item.activity] as const] : [],
      ),
    ).values(),
  );

  const openEntry = (target: {
    target: "activity" | "event" | "group_event" | "goal";
    id: string;
  }) => {
    const route =
      target.target === "activity"
        ? { pathname: "/activity-detail", params: { id: target.id } }
        : target.target === "event"
          ? { pathname: "/event-detail", params: { id: target.id } }
          : target.target === "group_event"
            ? { pathname: "/group-event-detail", params: { groupEventId: target.id } }
            : { pathname: "/goal-detail", params: { id: target.id } };
    router.navigate(route as never);
  };

  return (
    <View className="flex-1 bg-background" testID="planning-ledger-screen">
      <Stack.Screen options={{ title: "Training Breakdown" }} />
      {!request ? (
        <ErrorState
          description="Return to Plan or Calendar and select a valid day or week."
          title="Planning period is invalid"
        />
      ) : query.isLoading ? (
        <LoadingState message="Loading training breakdown..." testID="planning-ledger-loading" />
      ) : query.isError ? (
        <ErrorState
          description="Check your connection and try again."
          onAction={() => void query.refetch()}
          title="Training breakdown could not be loaded"
        />
      ) : query.data ? (
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          <PlanningLedgerView
            completedActivities={completedActivities}
            ledger={query.data}
            onOpenEntry={openEntry}
            trainingComposition={query.data.trainingComposition}
          />
        </ScrollView>
      ) : (
        <ErrorState
          description="No factual planning record is available for this period."
          onAction={() => void query.refetch()}
          title="Training breakdown is unavailable"
        />
      )}
    </View>
  );
}
