import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type FrozenPlannedSessionScenarioOperation,
  freezePlannedSessionScenarioOperation,
  isCurrentPlannedSessionScenarioOperation,
} from "@repo/api/client";
import { Button } from "@repo/ui/components/button";
import { SessionScenarioComparison } from "@repo/ui/components/session-scenario-comparison";
import { Text } from "@repo/ui/components/text";
import { skipToken } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { ActivitySelector } from "@/components/training-plan/modals/components/ActivitySelector";
import { api } from "@/lib/api";

type ScenarioKind = "as_planned" | "less" | "more" | "substitute" | "skip";

function operationStorageKey(profileId: string, sessionId: string) {
  return `gradientpeak:planned-session-scenario:v1:${profileId}:${sessionId}`;
}

export function SessionScenarioPreview({
  ...props
}: {
  activityPlanRevision: number;
  session: { id: string; profileId: string; sessionRevision: number };
  timeZone: string | null;
}) {
  return <SessionScenarioPreviewContents key={props.session.id} {...props} />;
}

function SessionScenarioPreviewContents({
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
  const [confirming, setConfirming] = useState(false);
  const [operation, setOperation] = useState<FrozenPlannedSessionScenarioOperation | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const operationRef = useRef<FrozenPlannedSessionScenarioOperation | null>(null);
  const utils = api.useUtils();
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
  const applyMutation = api.plannedSessions.applyScenario.useMutation({ retry: false });
  const plans = plansQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const storageKey = operationStorageKey(session.profileId, session.id);

  useEffect(() => {
    let active = true;
    operationRef.current = null;
    setOperation(null);
    void AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!raw || !active) return;
        const recovered = JSON.parse(raw) as FrozenPlannedSessionScenarioOperation;
        if (
          isCurrentPlannedSessionScenarioOperation(recovered, {
            actorId: session.profileId,
            sessionId: session.id,
          })
        ) {
          operationRef.current = recovered;
          setOperation(recovered);
        } else void AsyncStorage.removeItem(storageKey);
      })
      .catch(() => active && setStorageUnavailable(true));
    return () => {
      active = false;
    };
  }, [session.id, session.profileId, storageKey]);

  const persistOperation = async (next: FrozenPlannedSessionScenarioOperation | null) => {
    operationRef.current = next;
    setOperation(next);
    try {
      if (next) await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      else await AsyncStorage.removeItem(storageKey);
      return true;
    } catch {
      setStorageUnavailable(true);
      return false;
    }
  };
  const confirmApply = async () => {
    if (!input || previewQuery.data?.status !== "available" || operationRef.current) return;
    const next = freezePlannedSessionScenarioOperation({
      actorId: session.profileId,
      expectedPreviewFingerprint: previewQuery.data.previewFingerprint,
      operationId: randomUUID().replaceAll("-", ""),
      preview: input,
    });
    if (!(await persistOperation(next))) {
      setOutcome("Unable to save safe recovery. Check device storage and try again.");
      return;
    }
    setConfirming(false);
    setOutcome(null);
  };
  const submitOperation = async () => {
    if (
      !operation ||
      !isCurrentPlannedSessionScenarioOperation(operation, {
        actorId: session.profileId,
        sessionId: session.id,
      })
    )
      return;
    try {
      const result = await applyMutation.mutateAsync(operation.request);
      if (result.status === "applied") {
        await persistOperation(null);
        try {
          await Promise.all([
            utils.plannedSessions.invalidate(),
            utils.calendar.invalidate(),
            utils.athleteIntelligence.getReadModel.invalidate(),
          ]);
          setOutcome(`Applied: ${result.action}.`);
        } catch {
          setOutcome(`Applied: ${result.action}. The screen refresh failed; reopen this session.`);
        }
      } else {
        await persistOperation(null);
        setOutcome(
          "This preview is no longer current. Refresh it, then confirm again; your draft remains visible.",
        );
        void previewQuery.refetch();
      }
    } catch {
      setOutcome("We could not confirm the result. Check or retry with the same operation.");
    }
  };
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
          footer={
            plansQuery.hasNextPage || plansQuery.isError ? (
              <View className="gap-2 pt-2">
                {plansQuery.isError ? (
                  <Text className="text-sm text-destructive">Unable to load activity plans.</Text>
                ) : null}
                <Button
                  disabled={plansQuery.isFetchingNextPage}
                  onPress={() =>
                    void (plansQuery.isError ? plansQuery.refetch() : plansQuery.fetchNextPage())
                  }
                  testID="session-scenario-load-more-plans"
                  variant="outline"
                >
                  <Text>
                    {plansQuery.isError
                      ? "Retry activity plans"
                      : plansQuery.isFetchingNextPage
                        ? "Loading activity plans…"
                        : "Load more activity plans"}
                  </Text>
                </Button>
              </View>
            ) : null
          }
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
          {!operation ? (
            <Button onPress={() => setConfirming(true)} testID="session-scenario-apply">
              <Text>Apply this scenario</Text>
            </Button>
          ) : (
            <Button
              disabled={applyMutation.isPending}
              onPress={() => void submitOperation()}
              testID="session-scenario-retry-apply"
            >
              <Text>{applyMutation.isPending ? "Applying…" : "Check or retry this change"}</Text>
            </Button>
          )}
        </View>
      ) : null}
      {confirming && previewQuery.data?.status === "available" ? (
        <View accessibilityRole="alert" className="gap-2 rounded-xl border border-border p-3">
          <Text className="font-medium text-foreground">Apply this session scenario?</Text>
          <Text className="text-sm text-muted-foreground">
            This affects only the selected {previewQuery.data.selectedSession.planningDate}{" "}
            occurrence. A changed activity plan is copied privately; other occurrences and the
            source plan stay unchanged.
          </Text>
          {previewQuery.data.scenario.kind === "skip" ? (
            <Text className="text-sm text-muted-foreground">
              {previewQuery.data.selectedSession.planningDate ===
              new Date().toISOString().slice(0, 10)
                ? "This records a skipped outcome for today."
                : "This cancels the scheduled session, not a past completion."}
            </Text>
          ) : null}
          {previewQuery.data.scenario.kind === "as_planned" ? (
            <Text className="text-sm text-muted-foreground">
              As planned does not change the session.
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <Button onPress={() => void confirmApply()} testID="session-scenario-confirm-apply">
              <Text>Confirm apply</Text>
            </Button>
            <Button
              onPress={() => setConfirming(false)}
              testID="session-scenario-cancel-apply"
              variant="outline"
            >
              <Text>Cancel</Text>
            </Button>
          </View>
        </View>
      ) : null}
      {outcome ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
          {outcome}
        </Text>
      ) : null}
      {storageUnavailable ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          Recovery storage is unavailable. Keep this screen open while checking or retrying.
        </Text>
      ) : null}
    </View>
  );
}
