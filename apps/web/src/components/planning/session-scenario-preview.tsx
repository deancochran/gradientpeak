import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { SessionScenarioComparison } from "@repo/ui/components/session-scenario-comparison";
import { skipToken } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api/client";

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

export function SessionScenarioPreview({
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
  useEffect(() => {
    setKind("as_planned");
    setDurationDraft("");
    setSubstituteId("");
  }, [session.id]);

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
  const alternatives = alternativesQuery.data?.pages.flatMap((page) => page.items) ?? [];
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
        </div>
      ) : null}
    </section>
  );
}
