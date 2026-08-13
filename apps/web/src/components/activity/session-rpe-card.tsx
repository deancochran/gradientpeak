import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Slider } from "@repo/ui/components/slider";
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
  const [rpe, setRpe] = useState(0);
  const [savedEvidenceId, setSavedEvidenceId] = useState<string | null>(null);
  const [hasPendingChange, setHasPendingChange] = useState(false);
  const evidenceId = effectiveSessionRpe?.id ?? savedEvidenceId;
  const isCorrection = evidenceId !== null;

  useEffect(() => {
    if (!effectiveSessionRpe) return;
    setRpe(effectiveSessionRpe.rpe);
    setSavedEvidenceId(effectiveSessionRpe.id);
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
    },
  });

  useEffect(() => {
    if (!hasPendingChange || rpe === 0 || recordRpe.isPending) return;
    const timeout = window.setTimeout(() => {
      recordRpe.mutate({
        activity_id: activityId,
        operation_id: crypto.randomUUID(),
        rpe,
        source: isCorrection ? "manual" : "user",
        ...(isCorrection ? { correction_of_id: evidenceId } : {}),
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [activityId, evidenceId, hasPendingChange, isCorrection, recordRpe, rpe]);

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
            {rpe === 0 ? "0/10 · No value found" : `${rpe}/10`}
          </output>
          <p aria-live="polite" className="text-center text-xs text-muted-foreground">
            {RPE_DESCRIPTIONS[rpe]}
          </p>
          <Slider
            accessibilityLabel="Session RPE"
            maximumValue={10}
            minimumValue={0}
            onValueChange={(nextRpe) => {
              if (nextRpe === 0 && isCorrection) return;
              setRpe(nextRpe);
              setHasPendingChange(nextRpe !== 0);
            }}
            step={1}
            value={rpe}
          />
        </div>
      </CardContent>
    </Card>
  );
}
