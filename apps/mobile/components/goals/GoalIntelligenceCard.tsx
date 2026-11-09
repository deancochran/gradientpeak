import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";

type GoalAssessment = inferRouterOutputs<AppRouter>["athleteIntelligence"]["getGoalAssessment"];

type GoalIntelligenceCardProps = {
  assessment?: GoalAssessment;
  isError?: boolean;
  isLoading?: boolean;
  onRetry?: () => void;
};

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function score(value: number) {
  return Math.round(value).toString();
}

function freshnessLabel(value: string) {
  return value === "fresh" ? "Current" : formatLabel(value);
}

export function GoalIntelligenceCard({
  assessment,
  isError = false,
  isLoading = false,
  onRetry = () => undefined,
}: GoalIntelligenceCardProps) {
  if (!assessment) {
    return (
      <Card className="rounded-3xl border border-border bg-card" testID="goal-intelligence-card">
        <CardContent className="gap-3 p-4">
          <Text className="text-sm font-semibold text-foreground">Goal readiness</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {isLoading ? "Loading readiness assessment." : "Readiness is unavailable."}
          </Text>
          {isError ? (
            <Button
              className="self-start"
              onPress={onRetry}
              size="sm"
              testID="goal-intelligence-retry"
              variant="outline"
            >
              <Text>Retry</Text>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const readiness = assessment.assessment;
  return (
    <Card className="rounded-3xl border border-border bg-card" testID="goal-intelligence-card">
      <CardContent className="gap-4 p-4">
        <View className="gap-1">
          <Text className="text-sm font-semibold text-foreground">Goal readiness</Text>
        </View>

        {isError ? (
          <View className="gap-2 rounded-2xl border border-border px-3 py-3">
            <Text className="text-xs leading-5 text-muted-foreground">
              The displayed assessment may be stale because the latest result could not be loaded.
            </Text>
            <Button
              className="self-start"
              onPress={onRetry}
              size="sm"
              testID="goal-intelligence-retry"
              variant="outline"
            >
              <Text>Retry</Text>
            </Button>
          </View>
        ) : null}

        {readiness ? (
          <>
            <View className="gap-2 rounded-2xl border border-border px-3 py-3">
              <Text className="text-xs font-medium text-foreground">
                {formatLabel(readiness.status)} · readiness {score(readiness.readiness)}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground" testID="goal-intelligence-freshness">
              {freshnessLabel(assessment.freshness)} state ·{" "}
              {Math.round(assessment.assessmentConfidence * 100)}% confidence · calculated{" "}
              {new Date(assessment.computedAt).toLocaleString()}
            </Text>
            <View className="gap-2">
              <Text className="text-xs font-medium text-foreground">Why this assessment</Text>
              {readiness.reasonCodes.map((reason) => (
                <Text className="text-xs leading-5 text-muted-foreground" key={reason}>
                  {formatLabel(reason)}
                </Text>
              ))}
            </View>
          </>
        ) : (
          <Text className="text-sm leading-5 text-muted-foreground">
            A complete athlete-state baseline has not been published yet. Rebuild status:{" "}
            {formatLabel(assessment.rebuildStatus)}.
          </Text>
        )}
      </CardContent>
    </Card>
  );
}
