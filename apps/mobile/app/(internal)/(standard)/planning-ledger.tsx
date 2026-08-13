import { planningLedgerRequestSchema } from "@repo/core";
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
  const request = planningLedgerRequestSchema.safeParse({
    anchorDate: typeof params.anchorDate === "string" ? params.anchorDate : "",
    period: typeof params.period === "string" ? params.period : "",
  });
  const query = api.trainingPlans.getPlanningLedger.useQuery(
    request.success ? request.data : { anchorDate: "1970-01-01", period: "day" },
    { enabled: request.success },
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
      <Stack.Screen options={{ title: "Planning Ledger" }} />
      {!request.success ? (
        <ErrorState
          description="Return to Plan and select a valid day, week, or month."
          title="Planning period is invalid"
        />
      ) : query.isLoading ? (
        <LoadingState message="Loading planning ledger..." testID="planning-ledger-loading" />
      ) : query.isError ? (
        <ErrorState
          description="Check your connection and try again."
          onAction={() => void query.refetch()}
          title="Planning ledger could not be loaded"
        />
      ) : query.data ? (
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          <PlanningLedgerView ledger={query.data} onOpenEntry={openEntry} />
        </ScrollView>
      ) : (
        <ErrorState
          description="No factual planning record is available for this period."
          onAction={() => void query.refetch()}
          title="Planning ledger is unavailable"
        />
      )}
    </View>
  );
}
