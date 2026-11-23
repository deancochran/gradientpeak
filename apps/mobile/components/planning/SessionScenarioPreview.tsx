import { Button } from "@repo/ui/components/button";
import { SessionScenarioComparison } from "@repo/ui/components/session-scenario-comparison";
import { Text } from "@repo/ui/components/text";
import { skipToken } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { ActivitySelector } from "@/components/training-plan/modals/components/ActivitySelector";
import { api } from "@/lib/api";

type ScenarioKind = "as_planned" | "less" | "more" | "substitute" | "skip";

export function SessionScenarioPreview({
  activityPlanRevision,
  session,
  timeZone,
}: {
  activityPlanRevision: number;
  session: { id: string; profileId: string; sessionRevision: number };
  timeZone: string | null;
}) {
  const [kind, setKind] = useState<ScenarioKind>("as_planned");
  const [durationDraft, setDurationDraft] = useState("");
  const [substituteId, setSubstituteId] = useState<string | null>(null);
  useEffect(() => {
    setKind("as_planned");
    setDurationDraft("");
    setSubstituteId(null);
  }, [session.id]);
  const stateQuery = api.athleteIntelligence.getReadModel.useQuery(
    { profileId: session.profileId, sections: { publishedState: true, status: true } },
    { enabled: Boolean(timeZone) },
  );
  const plansQuery = api.activityPlans.list.useInfiniteQuery(
    { ownerScope: "all", limit: 25 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const duration = Number(durationDraft);
  const scenario = useMemo(() => {
    if (kind === "less" || kind === "more")
      return Number.isInteger(duration) && duration > 0
        ? { kind, targetDurationSeconds: duration }
        : null;
    if (kind === "substitute") return substituteId ? { kind, activityPlanId: substituteId } : null;
    return { kind };
  }, [duration, kind, substituteId]);
  const stateRevision = stateQuery.data?.publishedState?.baseline.stateRevision;
  const input =
    typeof stateRevision === "number" && scenario
      ? {
          sessionId: session.id,
          expectedSessionRevision: session.sessionRevision,
          expectedPlanRevision: activityPlanRevision,
          expectedStateRevision: stateRevision,
          scenario,
        }
      : null;
  const previewQuery = api.plannedSessions.previewScenario.useQuery(input ?? skipToken, {
    enabled: Boolean(input),
    retry: false,
  });
  const plans = plansQuery.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <View className="gap-3 rounded-2xl border border-border p-4" testID="session-scenario-preview">
      <View className="gap-1">
        <Text className="text-base font-semibold text-foreground">Explore a session scenario</Text>
        <Text className="text-sm text-muted-foreground">
          This comparison is read-only and does not change the session.
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {(["as_planned", "less", "more", "substitute", "skip"] as const).map((value) => (
          <Button
            key={value}
            onPress={() => setKind(value)}
            testID={`session-scenario-${value}`}
            variant={kind === value ? "default" : "outline"}
          >
            <Text>{value.replaceAll("_", " ")}</Text>
          </Button>
        ))}
      </View>
      {kind === "less" || kind === "more" ? (
        <View className="gap-1">
          <Text className="text-sm font-medium text-foreground">Target duration (seconds)</Text>
          <TextInput
            className="rounded-xl border border-border px-3 py-2 text-foreground"
            keyboardType="number-pad"
            onChangeText={setDurationDraft}
            placeholder="Enter an explicit duration"
            placeholderTextColor="#71717a"
            value={durationDraft}
          />
        </View>
      ) : null}
      {kind === "substitute" ? (
        <ActivitySelector
          activities={plans}
          onSelect={(plan) => setSubstituteId(plan.id)}
          selectedActivityId={substituteId}
        />
      ) : null}
      {stateQuery.isSuccess && typeof stateRevision !== "number" ? (
        <Text className="text-sm text-muted-foreground">
          A published athlete state is required before a scenario can be compared.
        </Text>
      ) : null}
      {!scenario ? (
        <Text className="text-sm text-muted-foreground">
          Enter a positive target duration or choose a substitute plan.
        </Text>
      ) : null}
      {previewQuery.isLoading ? (
        <Text className="text-sm text-muted-foreground">Comparing scenario…</Text>
      ) : null}
      {previewQuery.isError ? (
        <View className="gap-2">
          <Text className="text-sm text-destructive">We could not compare this scenario.</Text>
          <Button onPress={() => void previewQuery.refetch()} variant="outline">
            <Text>Retry comparison</Text>
          </Button>
        </View>
      ) : null}
      {previewQuery.data?.status === "unavailable" ? (
        <Text className="text-sm text-muted-foreground">
          Comparison unavailable: {previewQuery.data.reason.replaceAll("_", " ")}.
        </Text>
      ) : null}
      {previewQuery.data?.status === "stale" ? (
        <Text className="text-sm text-muted-foreground">
          This comparison is stale because the {previewQuery.data.reason.replace("_", " ")} changed.
          Refresh the session and try again.
        </Text>
      ) : null}
      {previewQuery.data?.status === "available" ? (
        <View className="gap-2">
          <SessionScenarioComparison
            alternative={previewQuery.data.alternative}
            baseline={previewQuery.data.baseline}
            timeZone={timeZone ?? "UTC"}
          />
          <Text className="text-xs text-muted-foreground">
            Current plan revision {previewQuery.data.provenance.selectedPlan.revision}; athlete
            state revision {previewQuery.data.stateRevision};{" "}
            {previewQuery.data.horizon.sessionCount} sessions.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
