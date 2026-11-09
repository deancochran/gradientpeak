import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api/client";

type EffectiveSessionRpe = {
  id: string;
  rpe: number;
};

const RPE_DESCRIPTIONS: Record<number, string> = {
  0: "No value found. Select a value from 1 to 10 to record session effort.",
  1: "Very light — no meaningful exertion.",
  2: "Light — comfortable and easy.",
  3: "Moderate — steady, controlled effort.",
  4: "Somewhat hard — purposeful but sustainable.",
  5: "Hard — strong and demanding.",
  6: "Hard — concentration is required to maintain pace.",
  7: "Very hard — difficult to sustain.",
  8: "Very hard — possible only briefly.",
  9: "Near maximal — almost all-out.",
  10: "Maximal — all-out effort.",
};

export function SessionRpeCard({
  activityId,
  effectiveSessionRpe,
}: {
  activityId: string;
  effectiveSessionRpe: EffectiveSessionRpe | null;
  estimatedMethod?: string | null;
}) {
  const utils = api.useUtils();
  const [rpeDraft, setRpeDraft] = useState(
    effectiveSessionRpe ? String(effectiveSessionRpe.rpe) : "",
  );
  const [savedEvidenceId, setSavedEvidenceId] = useState<string | null>(null);
  const [savedRpe, setSavedRpe] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const operationIdRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const evidenceId = effectiveSessionRpe?.id ?? savedEvidenceId;
  const isCorrection = evidenceId !== null;
  const currentRpe = effectiveSessionRpe?.rpe ?? savedRpe;
  const parsedRpe = Number(rpeDraft);
  const isValidRpe =
    rpeDraft.trim() !== "" && Number.isInteger(parsedRpe) && parsedRpe >= 1 && parsedRpe <= 10;
  const hasPendingChange = isValidRpe && parsedRpe !== currentRpe;

  useEffect(() => {
    setRpeDraft(effectiveSessionRpe ? String(effectiveSessionRpe.rpe) : "");
    setSavedEvidenceId(effectiveSessionRpe?.id ?? null);
    setSavedRpe(effectiveSessionRpe?.rpe ?? null);
    setError(null);
    operationIdRef.current = null;
    saveInFlightRef.current = false;
  }, [effectiveSessionRpe]);

  const recordRpe = api.activities.recordSessionRpe.useMutation({
    onError: (mutationError) => {
      saveInFlightRef.current = false;
      setError(mutationError.message || "RPE could not be saved. Try again.");
      toast.error(mutationError.message || "RPE could not be saved.");
    },
    onSuccess: async (evidence) => {
      setSavedEvidenceId(evidence.id);
      setSavedRpe(parsedRpe);
      await Promise.all([
        utils.activities.getById.invalidate({ id: activityId }),
        utils.activities.listPaginated.invalidate(),
        utils.activities.dailyCommonLoadObservations.invalidate(),
        utils.home.getDashboard.invalidate(),
        utils.athleteIntelligence.getReadModel.invalidate(),
        utils.trainingPlans.getPlanTabProjection.invalidate(),
        utils.trainingPlans.preview.invalidate(),
      ]);
      operationIdRef.current = null;
      saveInFlightRef.current = false;
      setError(null);
      toast.success("Session RPE saved.");
    },
  });

  const saveRpe = () => {
    if (recordRpe.isPending || saveInFlightRef.current) return;
    if (!isValidRpe) {
      setError("Enter a whole RPE from 1 to 10.");
      inputRef.current?.focus();
      return;
    }
    if (!hasPendingChange) return;
    saveInFlightRef.current = true;
    const operationId = operationIdRef.current ?? crypto.randomUUID();
    operationIdRef.current = operationId;
    recordRpe.mutate({
      activity_id: activityId,
      operation_id: operationId,
      rpe: parsedRpe,
      source: isCorrection ? "manual" : "user",
      ...(isCorrection ? { correction_of_id: evidenceId } : {}),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Session RPE
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <output aria-live="polite" className="block text-center text-sm font-medium">
            {currentRpe === null ? "No RPE recorded" : `Current RPE ${currentRpe}/10`}
          </output>
          <p aria-live="polite" className="text-center text-xs text-muted-foreground">
            {RPE_DESCRIPTIONS[isValidRpe ? parsedRpe : 0]}
          </p>
          <label className="block text-sm font-medium" htmlFor={`session-rpe-${activityId}`}>
            Perceived exertion
          </label>
          <Input
            aria-describedby={error ? `session-rpe-${activityId}-error` : undefined}
            aria-invalid={Boolean(error) || !isValidRpe}
            id={`session-rpe-${activityId}`}
            max={10}
            min={1}
            onChange={(event) => {
              setRpeDraft(event.currentTarget.value);
              setError(null);
              operationIdRef.current = null;
            }}
            ref={inputRef}
            step={1}
            type="number"
            value={rpeDraft}
          />
          {error || (!isValidRpe && rpeDraft !== "") ? (
            <p
              className="text-xs text-destructive"
              id={`session-rpe-${activityId}-error`}
              role="alert"
            >
              {error ?? "Enter a whole RPE from 1 to 10."}
            </p>
          ) : null}
          <Button
            disabled={!hasPendingChange || recordRpe.isPending}
            onClick={saveRpe}
            type="button"
          >
            {recordRpe.isPending ? "Saving RPE…" : "Save RPE"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
