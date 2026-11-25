import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type FrozenPlannedSessionScenarioOperation,
  freezePlannedSessionScenarioOperation,
  isCurrentPlannedSessionScenarioOperation,
  parseFrozenPlannedSessionScenarioOperation,
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
import { useAuth } from "@/lib/hooks/useAuth";

type ScenarioKind = "as_planned" | "less" | "more" | "substitute" | "skip";
type KnownScenarioOutcome = { actorId: string; message: string };
export type E2ERetryBoundary = "idle" | "received" | "guarded" | "dispatched";
export type E2ERetryBoundaryUpdate = {
  actorId: string;
  boundary: E2ERetryBoundary;
  generation: number;
  sessionId: string;
};

function isE2ERetryBoundaryEnabled() {
  return process.env.EXPO_PUBLIC_MAESTRO_E2E === "1";
}

function operationStorageKey(profileId: string, sessionId: string) {
  return `gradientpeak:planned-session-scenario:v1:${profileId}:${sessionId}`;
}

export function SessionScenarioPreview({
  ...props
}: {
  activityPlanRevision: number;
  e2eRetryBoundary?: E2ERetryBoundaryUpdate | null;
  e2eRetryBoundaryGeneration?: number;
  knownOutcome?: KnownScenarioOutcome | null;
  onE2ERetryBoundaryChange?: (update: E2ERetryBoundaryUpdate) => void;
  onKnownOutcomeChange?: (outcome: KnownScenarioOutcome | null) => void;
  session: { id: string; profileId: string; sessionRevision: number };
  timeZone: string | null;
}) {
  const { user } = useAuth();
  return (
    <SessionScenarioPreviewContents key={props.session.id} actorId={user?.id ?? null} {...props} />
  );
}

function SessionScenarioPreviewContents({
  activityPlanRevision,
  actorId,
  e2eRetryBoundary,
  e2eRetryBoundaryGeneration = 0,
  knownOutcome,
  onE2ERetryBoundaryChange,
  onKnownOutcomeChange,
  session,
  timeZone,
}: {
  activityPlanRevision: number;
  actorId: string | null;
  e2eRetryBoundary?: E2ERetryBoundaryUpdate | null;
  e2eRetryBoundaryGeneration?: number;
  knownOutcome?: KnownScenarioOutcome | null;
  onE2ERetryBoundaryChange?: (update: E2ERetryBoundaryUpdate) => void;
  onKnownOutcomeChange?: (outcome: KnownScenarioOutcome | null) => void;
  session: { id: string; profileId: string; sessionRevision: number };
  timeZone: string | null;
}) {
  const [kind, setKind] = useState<ScenarioKind>("as_planned");
  const [durationDraft, setDurationDraft] = useState("");
  const [substituteId, setSubstituteId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [operation, setOperation] = useState<FrozenPlannedSessionScenarioOperation | null>(null);
  const [outcome, setOutcome] = useState<KnownScenarioOutcome | null>(null);
  const [knownOutcomeSuppressed, setKnownOutcomeSuppressed] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [localE2ERetryBoundary, setE2ERetryBoundary] = useState<E2ERetryBoundaryUpdate | null>(
    null,
  );
  const operationRef = useRef<FrozenPlannedSessionScenarioOperation | null>(null);
  const latestOperationIdRef = useRef<string | null>(null);
  const armingRef = useRef(false);
  const submittingRef = useRef(false);
  const generationRef = useRef(0);
  const actorRef = useRef(actorId);
  actorRef.current = actorId;
  useEffect(() => {
    setE2ERetryBoundary((current) =>
      current?.actorId === actorId &&
      current.generation === e2eRetryBoundaryGeneration &&
      current.sessionId === session.id
        ? current
        : null,
    );
  }, [actorId, e2eRetryBoundaryGeneration, session.id]);
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
  const previewRefetchRef = useRef(previewQuery.refetch);
  previewRefetchRef.current = previewQuery.refetch;
  const applyMutation = api.plannedSessions.applyScenario.useMutation({ retry: false });
  const plans = plansQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const storageKey = operationStorageKey(session.profileId, session.id);
  const displayableOperation =
    operation &&
    actorId &&
    isCurrentPlannedSessionScenarioOperation(operation, {
      actorId,
      sessionId: session.id,
    })
      ? operation
      : null;
  const visibleOutcome =
    outcome?.actorId === actorId
      ? outcome.message
      : !knownOutcomeSuppressed && knownOutcome?.actorId === actorId
        ? knownOutcome.message
        : null;

  useEffect(() => {
    let active = true;
    const generation = ++generationRef.current;
    operationRef.current = null;
    latestOperationIdRef.current = null;
    setOperation(null);
    setOutcome(null);
    setKnownOutcomeSuppressed(false);
    setHydrated(false);
    void AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!raw || !active) return;
        const recovered = parseFrozenPlannedSessionScenarioOperation(JSON.parse(raw));
        if (
          recovered &&
          actorId &&
          isCurrentPlannedSessionScenarioOperation(recovered, {
            actorId,
            sessionId: session.id,
          })
        ) {
          if (generation !== generationRef.current) return;
          operationRef.current = recovered;
          latestOperationIdRef.current = recovered.request.operationId;
          setOperation(recovered);
        }
      })
      .catch(() => active && setStorageUnavailable(true))
      .finally(() => {
        if (active && generation === generationRef.current) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [actorId, session.id, storageKey]);

  const persistOperation = async (next: FrozenPlannedSessionScenarioOperation | null) => {
    const generation = generationRef.current;
    const actor = actorRef.current;
    const selectedSessionId = session.id;
    try {
      if (next) await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      else await AsyncStorage.removeItem(storageKey);
      if (
        generation !== generationRef.current ||
        actor !== actorRef.current ||
        selectedSessionId !== session.id
      )
        return false;
      operationRef.current = next;
      if (next) latestOperationIdRef.current = next.request.operationId;
      setOperation(next);
      return true;
    } catch {
      setStorageUnavailable(true);
      return false;
    }
  };
  const recordE2ERetryBoundary = (boundary: E2ERetryBoundary) => {
    if (!isE2ERetryBoundaryEnabled()) return;
    if (!actorId) return;
    const update = {
      actorId,
      boundary,
      generation: e2eRetryBoundaryGeneration,
      sessionId: session.id,
    };
    setE2ERetryBoundary(update);
    onE2ERetryBoundaryChange?.(update);
  };
  const displayedE2ERetryBoundary =
    e2eRetryBoundary?.actorId === actorId &&
    e2eRetryBoundary.generation === e2eRetryBoundaryGeneration &&
    e2eRetryBoundary.sessionId === session.id
      ? e2eRetryBoundary.boundary
      : localE2ERetryBoundary?.actorId === actorId && localE2ERetryBoundary.sessionId === session.id
        ? localE2ERetryBoundary.boundary
        : "idle";
  const confirmApply = async () => {
    if (
      !actorId ||
      !hydrated ||
      !input ||
      previewQuery.data?.status !== "available" ||
      operationRef.current ||
      armingRef.current
    )
      return;
    armingRef.current = true;
    const next = freezePlannedSessionScenarioOperation({
      actorId,
      expectedPreviewFingerprint: previewQuery.data.previewFingerprint,
      operationId: randomUUID().replaceAll("-", ""),
      preview: input,
    });
    try {
      if (!(await persistOperation(next))) {
        setOutcome({
          actorId,
          message: "Unable to save safe recovery. Check device storage and try again.",
        });
        return;
      }
      setConfirming(false);
      setKnownOutcomeSuppressed(true);
      setOutcome(null);
      onKnownOutcomeChange?.(null);
      void submitOperation(next);
    } finally {
      armingRef.current = false;
    }
  };
  const submitOperation = async (operationToSubmit = operation, isRetry = false) => {
    if (
      !operationToSubmit ||
      !actorId ||
      !isCurrentPlannedSessionScenarioOperation(operationToSubmit, {
        actorId,
        sessionId: session.id,
      }) ||
      submittingRef.current
    ) {
      if (isRetry) recordE2ERetryBoundary("guarded");
      return;
    }
    submittingRef.current = true;
    const generation = generationRef.current;
    const submittedActor = actorId;
    const submittedOperationId = operationToSubmit.request.operationId;
    const isCurrentSubmission = () =>
      generation === generationRef.current &&
      actorRef.current === submittedActor &&
      latestOperationIdRef.current === submittedOperationId &&
      isCurrentPlannedSessionScenarioOperation(operationToSubmit, {
        actorId: submittedActor,
        sessionId: session.id,
      });
    try {
      if (isRetry) recordE2ERetryBoundary("dispatched");
      const result = await applyMutation.mutateAsync(operationToSubmit.request);
      if (!isCurrentSubmission()) return;
      if (result.status === "applied") {
        if (!(await persistOperation(null)) || !isCurrentSubmission()) return;
        const appliedOutcome = { actorId: submittedActor, message: `Applied: ${result.action}.` };
        setKnownOutcomeSuppressed(false);
        setOutcome(appliedOutcome);
        onKnownOutcomeChange?.(appliedOutcome);
        try {
          await Promise.all([
            utils.plannedSessions.invalidate(),
            utils.activityPlans.invalidate(),
            utils.calendar.invalidate(),
            utils.trainingPlans.getPlanningLedger.invalidate(),
            utils.athleteIntelligence.getReadModel.invalidate(),
          ]);
          if (!isCurrentSubmission()) return;
        } catch {
          if (!isCurrentSubmission()) return;
          const refreshFailureOutcome = {
            actorId: submittedActor,
            message: `Applied: ${result.action}. The screen refresh failed; reopen this session.`,
          };
          setOutcome(refreshFailureOutcome);
          onKnownOutcomeChange?.(refreshFailureOutcome);
        }
      } else {
        if (!(await persistOperation(null)) || !isCurrentSubmission()) return;
        void Promise.all([
          utils.plannedSessions.invalidate(),
          utils.activityPlans.invalidate(),
          utils.calendar.invalidate(),
          utils.trainingPlans.getPlanningLedger.invalidate(),
          utils.athleteIntelligence.getReadModel.invalidate(),
        ]).then(() => {
          if (!isCurrentSubmission()) return;
          setOutcome({
            actorId: submittedActor,
            message:
              "This preview is no longer current. Refresh it, then confirm again; your draft remains visible.",
          });
          void previewRefetchRef.current();
        });
      }
    } catch {
      if (!isCurrentSubmission()) return;
      setOutcome({
        actorId,
        message: "We could not confirm the result. Check or retry with the same operation.",
      });
    } finally {
      submittingRef.current = false;
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
      {displayableOperation || visibleOutcome || storageUnavailable ? (
        <View className="gap-2" testID="session-scenario-recovery">
          <Text className="font-medium text-foreground">
            {displayableOperation
              ? applyMutation.isPending
                ? "Checking saved change"
                : "Previous change needs confirmation"
              : "Change status"}
          </Text>
          {displayableOperation ? (
            <>
              <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
                {applyMutation.isPending
                  ? "Checking the saved change now. Wait for its result before trying anything else. The comparison below is read-only."
                  : "This saved change may already have been applied. Check or retry it before starting another change. The comparison below is read-only."}
              </Text>
              <Button
                disabled={applyMutation.isPending}
                onPress={() => {
                  recordE2ERetryBoundary("received");
                  void submitOperation(displayableOperation, true);
                }}
                testID="session-scenario-retry-apply"
              >
                <Text>{applyMutation.isPending ? "Applying…" : "Check or retry this change"}</Text>
              </Button>
            </>
          ) : null}
          {visibleOutcome && !applyMutation.isPending ? (
            <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
              {visibleOutcome}
            </Text>
          ) : null}
          {storageUnavailable ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              Recovery storage is unavailable. Keep this screen open while checking or retrying.
            </Text>
          ) : null}
        </View>
      ) : null}
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
          {!displayableOperation ? (
            <Button
              disabled={!hydrated || !actorId}
              onPress={() => setConfirming(true)}
              testID="session-scenario-apply"
            >
              <Text>Apply this scenario</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
      {isE2ERetryBoundaryEnabled() ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            opacity: 0.01,
            maxWidth: 2,
            maxHeight: 2,
          }}
        >
          <Text testID={`e2e-session-scenario-retry-boundary-${displayedE2ERetryBoundary}`}>
            E2E_RETRY_BOUNDARY={displayedE2ERetryBoundary}
          </Text>
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
    </View>
  );
}
