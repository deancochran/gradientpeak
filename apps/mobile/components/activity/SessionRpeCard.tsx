import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Slider } from "@repo/ui/components/slider";
import { Text } from "@repo/ui/components/text";
import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";

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
}) {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const [selectedRpe, setSelectedRpe] = useState(0);
  const [savedEvidenceId, setSavedEvidenceId] = useState<string | null>(null);
  const [hasPendingChange, setHasPendingChange] = useState(false);
  const evidenceId = effectiveSessionRpe?.id ?? savedEvidenceId;
  const isCorrection = evidenceId !== null;

  useEffect(() => {
    if (effectiveSessionRpe) {
      setSelectedRpe(effectiveSessionRpe.rpe);
      setSavedEvidenceId(effectiveSessionRpe.id);
      setHasPendingChange(false);
    }
  }, [effectiveSessionRpe]);

  const recordSessionRpe = api.activities.recordSessionRpe.useMutation({
    onSuccess: async (evidence) => {
      setSavedEvidenceId(evidence.id);
      await Promise.all([
        utils.activities.getById.invalidate({ id: activityId }),
        utils.activities.dailyCommonLoadObservations.invalidate(),
        invalidatePostActivityIngestionQueries(queryClient),
        utils.trainingPlans.preview.invalidate(),
      ]);
      setHasPendingChange(false);
    },
  });

  useEffect(() => {
    if (!hasPendingChange || selectedRpe === 0 || recordSessionRpe.isPending) return;
    const timeout = setTimeout(() => {
      recordSessionRpe.mutate({
        activity_id: activityId,
        operation_id: randomUUID(),
        rpe: selectedRpe,
        source: isCorrection ? "manual" : "user",
        ...(isCorrection ? { correction_of_id: evidenceId } : {}),
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [activityId, evidenceId, hasPendingChange, isCorrection, recordSessionRpe, selectedRpe]);

  return (
    <Card testID="activity-session-rpe-card">
      <CardHeader>
        <CardTitle>Session effort</CardTitle>
      </CardHeader>
      <CardContent>
        <View className="gap-2">
          <Text
            accessibilityLiveRegion="polite"
            className="text-center text-sm font-medium text-foreground"
          >
            {selectedRpe === 0 ? "0/10 · No value found" : `${selectedRpe}/10`}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            className="text-center text-xs text-muted-foreground"
          >
            {RPE_DESCRIPTIONS[selectedRpe]}
          </Text>
          <Slider
            accessibilityLabel="Session RPE"
            maximumValue={10}
            minimumValue={0}
            onValueChange={(nextRpe) => {
              if (nextRpe === 0 && isCorrection) return;
              setSelectedRpe(nextRpe);
              setHasPendingChange(nextRpe !== 0);
            }}
            step={1}
            testId="activity-session-rpe"
            value={selectedRpe}
          />
        </View>
      </CardContent>
    </Card>
  );
}

import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
