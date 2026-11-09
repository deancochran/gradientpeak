import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Slider } from "@repo/ui/components/slider";
import { Text } from "@repo/ui/components/text";
import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
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
  const [selectedRpe, setSelectedRpe] = useState<number | null>(effectiveSessionRpe?.rpe ?? null);
  const [savedEvidenceId, setSavedEvidenceId] = useState<string | null>(null);
  const [savedRpe, setSavedRpe] = useState<number | null>(effectiveSessionRpe?.rpe ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const operationIdRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const evidenceId = effectiveSessionRpe?.id ?? savedEvidenceId;
  const isCorrection = evidenceId !== null;
  const currentRpe = effectiveSessionRpe?.rpe ?? savedRpe;
  const hasPendingChange = selectedRpe !== null && selectedRpe !== currentRpe;

  useEffect(() => {
    setSelectedRpe(effectiveSessionRpe?.rpe ?? null);
    setSavedEvidenceId(effectiveSessionRpe?.id ?? null);
    setSavedRpe(effectiveSessionRpe?.rpe ?? null);
    setErrorMessage(null);
    operationIdRef.current = null;
    saveInFlightRef.current = false;
  }, [effectiveSessionRpe]);

  const recordSessionRpe = api.activities.recordSessionRpe.useMutation({
    onError: (error) => {
      saveInFlightRef.current = false;
      setErrorMessage(error.message || "RPE could not be saved. Try again.");
    },
    onSuccess: async (evidence, variables) => {
      setSavedEvidenceId(evidence.id);
      setSavedRpe(variables.rpe);
      await Promise.all([
        utils.activities.getById.invalidate({ id: activityId }),
        utils.activities.dailyCommonLoadObservations.invalidate(),
        invalidatePostActivityIngestionQueries(queryClient),
        utils.trainingPlans.preview.invalidate(),
      ]);
      setErrorMessage(null);
      operationIdRef.current = null;
      saveInFlightRef.current = false;
    },
  });

  const saveRpe = () => {
    if (
      recordSessionRpe.isPending ||
      saveInFlightRef.current ||
      !hasPendingChange ||
      selectedRpe === null
    ) {
      return;
    }
    saveInFlightRef.current = true;
    const operationId = operationIdRef.current ?? randomUUID();
    operationIdRef.current = operationId;
    recordSessionRpe.mutate({
      activity_id: activityId,
      operation_id: operationId,
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
      <CardContent>
        <View className="gap-2">
          <Text
            accessibilityLiveRegion="polite"
            className="text-center text-sm font-medium text-foreground"
          >
            {currentRpe === null ? "No RPE recorded" : `Current RPE ${currentRpe}/10`}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            className="text-center text-xs text-muted-foreground"
          >
            {RPE_DESCRIPTIONS[selectedRpe ?? 0]}
          </Text>
          <Slider
            accessibilityLabel="Session RPE"
            maximumValue={10}
            minimumValue={0}
            onValueChange={(nextRpe) => {
              setSelectedRpe(nextRpe === 0 ? null : nextRpe);
              setErrorMessage(null);
              operationIdRef.current = null;
            }}
            step={1}
            testId="activity-session-rpe"
            value={selectedRpe ?? 0}
          />
          {errorMessage ? (
            <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">
              {errorMessage}
            </Text>
          ) : null}
          <Button
            disabled={!hasPendingChange || recordSessionRpe.isPending}
            onPress={saveRpe}
            testID="activity-session-rpe-save"
          >
            <Text className="text-sm font-semibold text-primary-foreground">
              {recordSessionRpe.isPending ? "Saving RPE..." : "Save RPE"}
            </Text>
          </Button>
        </View>
      </CardContent>
    </Card>
  );
}

import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
