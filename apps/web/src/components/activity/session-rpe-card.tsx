import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api/client";

type EffectiveSessionRpe = {
  corrected_at: Date | string | null;
  id: string;
  provenance: Record<string, unknown>;
  recorded_at: Date | string;
  rpe: number;
  scale: "borg_cr10";
  scale_version: "1";
  source: "manual" | "provider" | "user";
};

function estimatedMethodLabel(method: string | null | undefined) {
  switch (method) {
    case "session_rpe":
      return "Session RPE estimate";
    case "power_threshold":
      return "Power threshold estimate";
    case "critical_power_threshold":
      return "Critical power estimate";
    case "run_pace_threshold":
      return "Run pace threshold estimate";
    case "swim_pace_threshold":
      return "Swim pace threshold estimate";
    case "heart_rate_zones":
    case "heart_rate_threshold":
      return "Heart-rate estimate";
    default:
      return null;
  }
}

function rpeProvenance(evidence: EffectiveSessionRpe) {
  const observationType = evidence.provenance.observation_type;
  const enteredBy = evidence.provenance.entered_by;
  return [
    `Current RPE ${evidence.rpe}/10`,
    evidence.source === "manual" ? "manual correction" : evidence.source,
    typeof observationType === "string" ? observationType.replaceAll("_", " ") : null,
    typeof enteredBy === "string" ? `entered by ${enteredBy}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

export function SessionRpeCard({
  activityId,
  effectiveSessionRpe,
  estimatedMethod,
}: {
  activityId: string;
  effectiveSessionRpe: EffectiveSessionRpe | null;
  estimatedMethod?: string | null;
}) {
  const utils = api.useUtils();
  const [rpe, setRpe] = useState("5");
  const [savedEvidenceId, setSavedEvidenceId] = useState<string | null>(null);
  const evidenceId = effectiveSessionRpe?.id ?? savedEvidenceId;
  const isCorrection = evidenceId !== null;
  const currentEstimatedMethod = useMemo(
    () => estimatedMethodLabel(estimatedMethod),
    [estimatedMethod],
  );

  useEffect(() => {
    if (!effectiveSessionRpe) return;
    setRpe(String(effectiveSessionRpe.rpe));
    setSavedEvidenceId(effectiveSessionRpe.id);
  }, [effectiveSessionRpe]);

  const recordRpe = api.activities.recordSessionRpe.useMutation({
    onError: (error) => toast.error(error.message || "RPE could not be saved."),
    onSuccess: async (evidence) => {
      setSavedEvidenceId(evidence.id);
      await Promise.all([
        utils.activities.getById.invalidate({ id: activityId }),
        utils.activities.listPaginated.invalidate(),
        utils.activities.dailyCommonLoadObservations.invalidate(),
        utils.activities.commonLoadHistory.invalidate(),
        utils.home.getDashboard.invalidate(),
        utils.trends.invalidate(),
        utils.trainingPlans.getEffectiveLoad.invalidate(),
        utils.trainingPlans.getCurrentStatus.invalidate(),
      ]);
      toast.success(isCorrection ? "Session RPE correction saved." : "Session RPE saved.");
    },
  });
  const parsedRpe = Number(rpe);
  const validRpe = Number.isInteger(parsedRpe) && parsedRpe >= 1 && parsedRpe <= 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session RPE</CardTitle>
        <CardDescription>
          Rate how hard this activity felt on a 1–10 Borg CR10 scale.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!validRpe) return;
            recordRpe.mutate({
              activity_id: activityId,
              operation_id: crypto.randomUUID(),
              rpe: parsedRpe,
              source: evidenceId ? "manual" : "user",
              ...(evidenceId ? { correction_of_id: evidenceId } : {}),
            });
          }}
        >
          <label className="grid gap-1 text-sm" htmlFor="session-rpe">
            <span>Perceived exertion</span>
            <Input
              aria-describedby="session-rpe-help"
              id="session-rpe"
              inputMode="numeric"
              max={10}
              min={1}
              onChange={(event) => setRpe(event.currentTarget.value)}
              required
              type="number"
              value={rpe}
            />
          </label>
          <Button disabled={!validRpe || recordRpe.isPending} type="submit">
            {recordRpe.isPending ? "Saving…" : isCorrection ? "Save correction" : "Save RPE"}
          </Button>
        </form>
        {effectiveSessionRpe ? (
          <div className="mt-4 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{rpeProvenance(effectiveSessionRpe)}</p>
            <p className="mt-1">
              Borg CR10 · recorded {new Date(effectiveSessionRpe.recorded_at).toLocaleDateString()}
              {effectiveSessionRpe.corrected_at
                ? ` · corrected ${new Date(effectiveSessionRpe.corrected_at).toLocaleDateString()}`
                : ""}
            </p>
          </div>
        ) : null}
        {currentEstimatedMethod ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Current estimated-method provenance: {currentEstimatedMethod}.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground" id="session-rpe-help">
          {isCorrection
            ? "Saving appends a manual correction to the current evidence; it does not overwrite it."
            : "Your RPE is saved as activity evidence and does not replace recorded training data."}
        </p>
      </CardContent>
    </Card>
  );
}
