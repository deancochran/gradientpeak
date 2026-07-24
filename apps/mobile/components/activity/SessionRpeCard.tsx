import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/lib/api";

type EffectiveSessionRpe = {
  id: string;
  rpe: number;
  scale: "borg_cr10";
  scale_version: "1";
  source: "user" | "provider" | "manual";
  recorded_at: Date | string;
  corrected_at: Date | string | null;
  provenance: Record<string, unknown>;
};

function loadMethodLabel(method: string | null | undefined) {
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

function evidenceProvenance(evidence: EffectiveSessionRpe) {
  const observationType = evidence.provenance.observation_type;
  const enteredBy = evidence.provenance.entered_by;
  const source = evidence.source === "manual" ? "manual correction" : evidence.source;
  const details = [
    `Current RPE ${evidence.rpe}/10`,
    typeof observationType === "string" ? observationType.replaceAll("_", " ") : null,
    typeof enteredBy === "string" ? `entered by ${enteredBy}` : source,
  ].filter((value): value is string => Boolean(value));
  return details.join(" · ");
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
  const [selectedRpe, setSelectedRpe] = useState<number | null>(null);
  const [savedEvidenceId, setSavedEvidenceId] = useState<string | null>(null);
  const evidenceId = effectiveSessionRpe?.id ?? savedEvidenceId;
  const isCorrection = evidenceId !== null;
  const estimatedMethodLabel = useMemo(() => loadMethodLabel(estimatedMethod), [estimatedMethod]);

  useEffect(() => {
    if (effectiveSessionRpe) {
      setSelectedRpe(effectiveSessionRpe.rpe);
      setSavedEvidenceId(effectiveSessionRpe.id);
    }
  }, [effectiveSessionRpe]);

  const recordSessionRpe = api.activities.recordSessionRpe.useMutation({
    onSuccess: async (evidence) => {
      setSavedEvidenceId(evidence.id);
      await Promise.all([
        utils.activities.getById.invalidate({ id: activityId }),
        utils.activities.listPaginated.invalidate(),
        utils.activities.dailyCommonLoadObservations.invalidate(),
        utils.activities.commonLoadHistory.invalidate(),
        utils.home.getDashboard.invalidate(),
        utils.trends.invalidate(),
        utils.trainingPlans.getActivePlan.invalidate(),
        utils.trainingPlans.getCurrentStatus.invalidate(),
        utils.trainingPlans.getActualCurve.invalidate(),
        utils.trainingPlans.getEffectiveLoad.invalidate(),
      ]);
    },
  });

  const submit = () => {
    if (selectedRpe === null || recordSessionRpe.isPending) return;
    recordSessionRpe.mutate({
      activity_id: activityId,
      operation_id: randomUUID(),
      rpe: selectedRpe,
      source: isCorrection ? "manual" : "user",
      ...(isCorrection ? { correction_of_id: evidenceId } : {}),
    });
  };

  return (
    <Card testID="activity-session-rpe-card">
      <CardHeader>
        <CardTitle>Session effort</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        <Text className="text-sm text-muted-foreground">
          How hard did this session feel? Your 1–10 RPE is saved as evidence. When a training-load
          method is estimated, this helps explain the estimate; it does not replace recorded data.
        </Text>
        {effectiveSessionRpe ? (
          <View className="gap-1 rounded-xl bg-muted/50 px-3 py-2">
            <Text className="text-xs font-medium text-foreground">
              {evidenceProvenance(effectiveSessionRpe)}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Borg CR10 · recorded {new Date(effectiveSessionRpe.recorded_at).toLocaleDateString()}
            </Text>
          </View>
        ) : null}
        {estimatedMethodLabel ? (
          <Text className="text-xs text-muted-foreground">
            Current estimated-method provenance: {estimatedMethodLabel}.
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((rpe) => (
            <Pressable
              key={rpe}
              accessibilityLabel={`Session RPE ${rpe}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedRpe === rpe }}
              className={`h-10 min-w-10 items-center justify-center rounded-full border ${selectedRpe === rpe ? "border-primary bg-primary" : "border-border bg-background"}`}
              onPress={() => setSelectedRpe(rpe)}
              testID={`activity-session-rpe-${rpe}`}
            >
              <Text
                className={`text-sm font-semibold ${selectedRpe === rpe ? "text-primary-foreground" : "text-foreground"}`}
              >
                {rpe}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: selectedRpe === null || recordSessionRpe.isPending }}
          className="self-start rounded-xl bg-primary px-4 py-2.5 disabled:opacity-50"
          disabled={selectedRpe === null || recordSessionRpe.isPending}
          onPress={submit}
          testID="activity-session-rpe-submit"
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            {recordSessionRpe.isPending
              ? "Saving…"
              : isCorrection
                ? "Save correction"
                : "Save session effort"}
          </Text>
        </Pressable>
        {recordSessionRpe.isError ? (
          <Text className="text-xs text-destructive">
            Could not save your session effort. Try again.
          </Text>
        ) : null}
        {isCorrection ? (
          <Text className="text-xs text-muted-foreground">
            Saving appends a manual correction to the current evidence; it does not overwrite it.
          </Text>
        ) : null}
      </CardContent>
    </Card>
  );
}
