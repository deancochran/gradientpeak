import {
  type FrozenPlannedSessionScenarioOperation,
  freezePlannedSessionScenarioOperation,
  isCurrentPlannedSessionScenarioOperation,
  parseFrozenPlannedSessionScenarioOperation,
} from "@repo/api/client";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { SessionScenarioComparison } from "@repo/ui/components/session-scenario-comparison";
import { skipToken } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api/client";
import { useAuth } from "../providers/auth-provider";

type ScenarioKind = "as_planned" | "less" | "more" | "substitute" | "skip";

type PlannedSessionPreviewIdentity = {
  activityPlanId: string;
  id: string;
  profileId: string;
  sessionRevision: number;
};

type ActivityPlanPreviewIdentity = {
  detail: { activityPlanRevision: number };
};

function describeUnavailable(reason: string) {
  return `A comparison is not available: ${reason.replaceAll("_", " ")}.`;
}

function scenarioSummary(scenario: {
  kind: ScenarioKind;
  targetDurationSeconds?: number;
  activityPlanId?: string;
}) {
  if (scenario.kind === "less" || scenario.kind === "more")
    return `${scenario.kind === "less" ? "Reduce" : "Increase"} duration to ${scenario.targetDurationSeconds} seconds`;
  if (scenario.kind === "substitute") return "Use the selected substitute activity plan";
  if (scenario.kind === "skip") return "Skip this session";
  return "Keep the session as planned";
}

function operationStorageKey(profileId: string, sessionId: string) {
  return `gradientpeak:planned-session-scenario:v1:${profileId}:${sessionId}`;
}

export function SessionScenarioPreview({
  ...props
}: {
  activityPlan: ActivityPlanPreviewIdentity | undefined;
  session: PlannedSessionPreviewIdentity;
  timeZone: string | null;
}) {
  // A keyed child resets drafts before React can issue a query for a new session.
  return <SessionScenarioPreviewContents key={props.session.id} {...props} />;
}

function SessionScenarioPreviewContents({
  activityPlan,
  session,
  timeZone,
}: {
  activityPlan: ActivityPlanPreviewIdentity | undefined;
  session: PlannedSessionPreviewIdentity;
  timeZone: string | null;
}) {
  const [kind, setKind] = useState<ScenarioKind>("as_planned");
  const [durationDraft, setDurationDraft] = useState("");
  const [substituteId, setSubstituteId] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [operation, setOperation] = useState<FrozenPlannedSessionScenarioOperation | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const operationRef = useRef<FrozenPlannedSessionScenarioOperation | null>(null);
  const submittingRef = useRef(false);
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const generationRef = useRef(0);
  const { user } = useAuth();
  const actorId = user?.id ?? null;
  const actorRef = useRef(actorId);
  actorRef.current = actorId;
  const utils = api.useUtils();
  const stateQuery = api.athleteIntelligence.getReadModel.useQuery(
    {
      profileId: session.profileId,
      sections: { publishedState: true, status: true },
    },
    { enabled: Boolean(activityPlan && timeZone) },
  );
  const alternativesQuery = api.activityPlans.list.useInfiniteQuery(
    { ownerScope: "all", limit: 25 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const duration = Number(durationDraft);
  const scenario = useMemo(() => {
    if (kind === "less" || kind === "more") {
      return Number.isInteger(duration) && duration > 0
        ? { kind, targetDurationSeconds: duration }
        : null;
    }
    if (kind === "substitute") return substituteId ? { kind, activityPlanId: substituteId } : null;
    return { kind };
  }, [duration, kind, substituteId]);
  const stateRevision = stateQuery.data?.publishedState?.baseline.stateRevision;
  const input =
    activityPlan && typeof stateRevision === "number" && scenario
      ? {
          sessionId: session.id,
          expectedSessionRevision: session.sessionRevision,
          expectedPlanRevision: activityPlan.detail.activityPlanRevision,
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
  const alternatives = alternativesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const storageKey = operationStorageKey(session.profileId, session.id);

  useEffect(() => {
    const generation = ++generationRef.current;
    operationRef.current = null;
    setOperation(null);
    setHydrated(false);
    try {
      const raw = window.localStorage.getItem(storageKey);
      const recovered = raw ? parseFrozenPlannedSessionScenarioOperation(JSON.parse(raw)) : null;
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
        setOperation(recovered);
      }
    } catch {
      setStorageUnavailable(true);
    } finally {
      if (generation === generationRef.current) setHydrated(true);
    }
  }, [actorId, session.id, storageKey]);

  useEffect(() => {
    if (confirmationOpen) confirmButtonRef.current?.focus();
  }, [confirmationOpen]);

  const persistOperation = (next: FrozenPlannedSessionScenarioOperation | null) => {
    try {
      if (next) window.localStorage.setItem(storageKey, JSON.stringify(next));
      else window.localStorage.removeItem(storageKey);
      operationRef.current = next;
      setOperation(next);
      return true;
    } catch {
      setStorageUnavailable(true);
      return false;
    }
  };
  const confirmApply = () => {
    if (
      !actorId ||
      !hydrated ||
      !input ||
      previewQuery.data?.status !== "available" ||
      operationRef.current
    )
      return;
    const id = globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? "";
    if (id.length < 32) {
      setOutcome("We could not create a safe operation identity. Try again.");
      return;
    }
    const next = freezePlannedSessionScenarioOperation({
      actorId,
      expectedPreviewFingerprint: previewQuery.data.previewFingerprint,
      operationId: id,
      preview: input,
    });
    if (!persistOperation(next)) {
      setOutcome("Unable to save safe recovery. Check browser storage and try again.");
      return;
    }
    setConfirmationOpen(false);
    setOutcome(null);
    void submitOperation(next);
  };
  const submitOperation = async (operationToSubmit = operation) => {
    if (
      !operationToSubmit ||
      !actorId ||
      !isCurrentPlannedSessionScenarioOperation(operationToSubmit, {
        actorId,
        sessionId: session.id,
      }) ||
      submittingRef.current
    )
      return;
    submittingRef.current = true;
    setOutcome(null);
    const generation = generationRef.current;
    const submittedActor = actorId;
    const isCurrentSubmission = () =>
      generation === generationRef.current &&
      actorRef.current === submittedActor &&
      isCurrentPlannedSessionScenarioOperation(operationToSubmit, {
        actorId: submittedActor,
        sessionId: session.id,
      });
    try {
      const result = await applyMutation.mutateAsync(operationToSubmit.request);
      if (!isCurrentSubmission()) return;
      if (result.status === "applied") {
        if (!persistOperation(null) || !isCurrentSubmission()) return;
        try {
          await Promise.all([
            utils.plannedSessions.invalidate(),
            utils.activityPlans.invalidate(),
            utils.calendar.invalidate(),
            utils.trainingPlans.getPlanningLedger.invalidate(),
            utils.athleteIntelligence.getReadModel.invalidate(),
          ]);
          if (!isCurrentSubmission()) return;
          setOutcome(`Applied: ${result.action}. The durable session result is now shown.`);
        } catch {
          if (!isCurrentSubmission()) return;
          setOutcome(
            `Applied: ${result.action}. The durable result is safe, but refreshing the screen failed.`,
          );
        }
      } else {
        if (!persistOperation(null) || !isCurrentSubmission()) return;
        void Promise.all([
          utils.plannedSessions.invalidate(),
          utils.activityPlans.invalidate(),
          utils.calendar.invalidate(),
          utils.trainingPlans.getPlanningLedger.invalidate(),
          utils.athleteIntelligence.getReadModel.invalidate(),
        ]).then(() => {
          if (!isCurrentSubmission()) return;
          setOutcome(
            "This preview is no longer current. Your draft is preserved; refresh the preview and confirm again.",
          );
          void previewRefetchRef.current();
        });
      }
    } catch {
      if (actorRef.current !== submittedActor) return;
      setOutcome(
        "We could not confirm whether the change was applied. Check or retry using the same operation; do not create a new request.",
      );
    } finally {
      submittingRef.current = false;
    }
  };
  const stateUnavailable =
    stateQuery.isSuccess && typeof stateRevision !== "number"
      ? "A published athlete state is required before a scenario can be compared."
      : null;

  return (
    <section className="space-y-4" aria-labelledby="session-scenario-preview-title">
      <div>
        <h2 className="text-lg font-semibold" id="session-scenario-preview-title">
          Explore a session scenario
        </h2>
        <p className="text-sm text-muted-foreground">
          This comparison is read-only. It does not change this session or its activity plan.
        </p>
      </div>
      {operation || outcome || storageUnavailable ? (
        <div className="space-y-2" data-testid="session-scenario-recovery">
          <h3 className="font-medium">
            {operation ? "Previous change needs confirmation" : "Change status"}
          </h3>
          {operation ? (
            <>
              <p className="text-sm text-muted-foreground">
                This saved change may already have been applied. Check or retry it before starting
                another change. The comparison below is read-only.
              </p>
              <Button
                disabled={applyMutation.isPending}
                onClick={() => void submitOperation()}
                type="button"
              >
                {applyMutation.isPending ? "Applying…" : "Check or retry this change"}
              </Button>
            </>
          ) : null}
          {outcome ? (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {outcome}
            </p>
          ) : null}
          {storageUnavailable ? (
            <p role="alert" className="text-sm text-destructive">
              Recovery storage is unavailable. Keep this screen open while checking or retrying this
              operation.
            </p>
          ) : null}
        </div>
      ) : null}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Scenario</legend>
        {(["as_planned", "less", "more", "substitute", "skip"] as const).map((value) => (
          <Button
            key={value}
            onClick={() => setKind(value)}
            type="button"
            variant={kind === value ? "default" : "outline"}
          >
            {value.replaceAll("_", " ")}
          </Button>
        ))}
      </fieldset>
      {(kind === "less" || kind === "more") && (
        <label
          className="block max-w-xs space-y-2 text-sm font-medium"
          htmlFor="session-scenario-target-duration"
        >
          Target duration (seconds)
          <Input
            inputMode="numeric"
            id="session-scenario-target-duration"
            min={1}
            onChange={(event) => setDurationDraft(event.target.value)}
            placeholder="Enter an explicit duration"
            type="number"
            value={durationDraft}
          />
        </label>
      )}
      {kind === "substitute" && (
        <label className="block max-w-md space-y-2 text-sm font-medium">
          Substitute activity plan
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            onChange={(event) => setSubstituteId(event.target.value)}
            value={substituteId}
          >
            <option value="">Choose an authorized activity plan</option>
            {alternatives.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {alternativesQuery.hasNextPage ? (
        <Button
          disabled={alternativesQuery.isFetchingNextPage}
          onClick={() => void alternativesQuery.fetchNextPage()}
          type="button"
          variant="outline"
        >
          {alternativesQuery.isFetchingNextPage
            ? "Loading activity plans…"
            : "Load more activity plans"}
        </Button>
      ) : null}
      {alternativesQuery.isError ? (
        <Button onClick={() => void alternativesQuery.refetch()} type="button" variant="outline">
          Retry activity plans
        </Button>
      ) : null}
      {!activityPlan ? (
        <p className="text-sm text-muted-foreground">Loading current plan…</p>
      ) : null}
      {stateUnavailable ? (
        <p className="text-sm text-muted-foreground">{stateUnavailable}</p>
      ) : null}
      {!scenario ? (
        <p className="text-sm text-muted-foreground">
          Enter a positive target duration or choose a substitute activity plan.
        </p>
      ) : null}
      {previewQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Comparing scenario…</p>
      ) : null}
      {previewQuery.isError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            We could not compare this scenario.
          </p>
          <Button onClick={() => void previewQuery.refetch()} type="button" variant="outline">
            Retry comparison
          </Button>
        </div>
      ) : null}
      {previewQuery.data?.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">
          {describeUnavailable(previewQuery.data.reason)}
        </p>
      ) : null}
      {previewQuery.data?.status === "stale" ? (
        <p role="alert" className="text-sm text-muted-foreground">
          This comparison is stale because the {previewQuery.data.reason.replace("_", " ")} changed.
          Refresh the session and try again.
        </p>
      ) : null}
      {previewQuery.data?.status === "available" ? (
        <div className="space-y-2">
          <SessionScenarioComparison
            alternative={previewQuery.data.alternative}
            baseline={previewQuery.data.baseline}
            timeZone={timeZone ?? "UTC"}
          />
          <p className="text-xs text-muted-foreground">
            Current plan revision {previewQuery.data.provenance.selectedPlan.revision}; athlete
            state revision {previewQuery.data.stateRevision};{" "}
            {previewQuery.data.horizon.sessionCount} sessions in the shared horizon.
          </p>
          {!operation ? (
            <Button
              disabled={!hydrated || !actorId}
              onClick={() => setConfirmationOpen(true)}
              ref={applyButtonRef}
              type="button"
            >
              Apply this scenario
            </Button>
          ) : null}
        </div>
      ) : null}
      {confirmationOpen && previewQuery.data?.status === "available" ? (
        <div
          className="space-y-3 rounded-md border p-3"
          role="dialog"
          aria-labelledby="apply-scenario-title"
        >
          <h3 className="font-medium" id="apply-scenario-title">
            Apply this session scenario?
          </h3>
          <p className="text-sm text-muted-foreground">
            {scenarioSummary(previewQuery.data.scenario)} for{" "}
            {previewQuery.data.selectedSession.planningDate}. This affects only this selected
            occurrence and creates a private copy when its activity plan changes.
          </p>
          {previewQuery.data.scenario.kind === "skip" ? (
            <p className="text-sm text-muted-foreground">
              This will{" "}
              {previewQuery.data.selectedSession.planningDate ===
              new Date().toISOString().slice(0, 10)
                ? "record a skipped outcome for today."
                : "cancel the scheduled session; it does not change past completion."}
            </p>
          ) : null}
          {previewQuery.data.scenario.kind === "as_planned" ? (
            <p className="text-sm text-muted-foreground">As planned makes no session change.</p>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={confirmApply} ref={confirmButtonRef} type="button">
              Confirm apply
            </Button>
            <Button
              onClick={() => {
                setConfirmationOpen(false);
                applyButtonRef.current?.focus();
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
