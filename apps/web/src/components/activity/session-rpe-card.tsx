import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { useEffect, useState } from "react";
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
  const [rpe, setRpe] = useState(effectiveSessionRpe?.rpe ?? 5);
  const [savedEvidenceId, setSavedEvidenceId] = useState<string | null>(null);
  const [hasPendingChange, setHasPendingChange] = useState(false);
  const evidenceId = effectiveSessionRpe?.id ?? savedEvidenceId;
  const isCorrection = evidenceId !== null;

  useEffect(() => {
    setRpe(effectiveSessionRpe?.rpe ?? 5);
    setSavedEvidenceId(effectiveSessionRpe?.id ?? null);
    setHasPendingChange(false);
  }, [effectiveSessionRpe]);

  const recordRpe = api.activities.recordSessionRpe.useMutation({
    onError: (error) => toast.error(error.message || "RPE could not be saved."),
    onSuccess: async (evidence) => {
      setSavedEvidenceId(evidence.id);
      await Promise.all([
        utils.activities.getById.invalidate({ id: activityId }),
        utils.activities.listPaginated.invalidate(),
        utils.activities.dailyCommonLoadObservations.invalidate(),
        utils.home.getDashboard.invalidate(),
        utils.athleteIntelligence.getReadModel.invalidate(),
        utils.trainingPlans.getPlanTabProjection.invalidate(),
        utils.trainingPlans.preview.invalidate(),
      ]);
      setHasPendingChange(false);
      toast.success("Session RPE saved.");
    },
  });

  const saveRpe = () => {
    recordRpe.mutate({
      activity_id: activityId,
      operation_id: crypto.randomUUID(),
      rpe,
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
            {effectiveSessionRpe || savedEvidenceId
              ? `Current RPE ${rpe}/10`
              : `${rpe}/10 · Not saved`}
          </output>
          <p aria-live="polite" className="text-center text-xs text-muted-foreground">
            {RPE_DESCRIPTIONS[rpe]}
          </p>
          <label className="block text-sm font-medium" htmlFor={`session-rpe-${activityId}`}>
            Perceived exertion
          </label>
          <Input
            id={`session-rpe-${activityId}`}
            max={10}
            min={1}
            onChange={(event) => {
              const nextRpe = Number(event.currentTarget.value);
              setRpe(nextRpe);
              setHasPendingChange(nextRpe !== effectiveSessionRpe?.rpe);
            }}
            step={1}
            type="number"
            value={rpe}
          />
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
