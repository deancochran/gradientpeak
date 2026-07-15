import type { AthleteIntelligenceProjection, CalculationResult } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";

type GoalIntelligenceCardProps = {
  intelligence?: AthleteIntelligenceProjection;
  isError?: boolean;
  isLoading?: boolean;
  deviceTimezone?: string | null;
  onRetry?: () => void;
  onUseDeviceTimezone: () => void;
  planningTimezone?: string | null;
};

function formatReason(reason: string) {
  return reason.replaceAll("_", " ");
}

function resultLabel(result: CalculationResult) {
  if (result.state === "observed" || result.state === "estimated") return "Available";
  if (result.state === "unsupported") return "Unavailable for this goal";
  if (result.state === "insufficient_evidence") return "More evidence needed";
  return "Unknown";
}

function ResultContext({
  label,
  result,
  showEvidence = false,
}: {
  label: string;
  result: CalculationResult;
  showEvidence?: boolean;
}) {
  const uncertainty =
    typeof result.uncertainty === "number" ? Math.round(result.uncertainty * 100) : null;
  const sourceCount = result.contributingSourceIds?.length ?? 0;
  return (
    <View className="gap-1">
      <Text className="text-xs font-medium text-foreground">{label}</Text>
      <Text className="text-xs leading-5 text-muted-foreground">{resultLabel(result)}</Text>
      {showEvidence &&
        result.reasonCodes.map((reason) => (
          <Text className="text-xs leading-5 text-muted-foreground" key={reason}>
            Reason: {formatReason(reason)}
          </Text>
        ))}
      {showEvidence ? (
        <Text className="text-xs leading-5 text-muted-foreground">
          Evidence uncertainty: {uncertainty === null ? "unknown" : `${uncertainty}%`} ·{" "}
          {sourceCount} source
          {sourceCount === 1 ? "" : "s"}
        </Text>
      ) : null}
    </View>
  );
}

export function GoalIntelligenceCard({
  intelligence,
  isError = false,
  isLoading = false,
  deviceTimezone,
  onRetry = () => undefined,
  onUseDeviceTimezone,
  planningTimezone,
}: GoalIntelligenceCardProps) {
  if (!deviceTimezone) {
    return (
      <Card className="rounded-3xl border border-border bg-card" testID="goal-intelligence-card">
        <CardContent className="gap-3 p-4">
          <Text className="text-sm font-semibold text-foreground">Your next move</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Calendar context is unavailable because this device timezone cannot be used.
          </Text>
        </CardContent>
      </Card>
    );
  }

  if (!planningTimezone || !intelligence) {
    const status = !planningTimezone
      ? "Use your device timezone to review calendar-aware goal guidance."
      : isLoading
        ? "Loading evidence-aware goal guidance."
        : isError
          ? "Goal guidance could not be loaded. Try again."
          : "Goal guidance is unavailable right now.";
    return (
      <Card className="rounded-3xl border border-border bg-card" testID="goal-intelligence-card">
        <CardContent className="gap-3 p-4">
          <Text className="text-sm font-semibold text-foreground">Your next move</Text>
          <Text className="text-sm leading-5 text-muted-foreground">{status}</Text>
          {!planningTimezone ? (
            <Button
              className="self-start"
              onPress={onUseDeviceTimezone}
              size="sm"
              testID="goal-intelligence-use-device-timezone"
              variant="outline"
            >
              <Text>Use device timezone</Text>
            </Button>
          ) : null}
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

  const coverage = intelligence.goalCoverage[0];
  const dimensions = coverage?.dimensions ?? [];
  const feasibility = intelligence.feasibility.scheduleCoverage;

  return (
    <Card className="rounded-3xl border border-border bg-card" testID="goal-intelligence-card">
      <CardContent className="gap-4 p-4">
        <View className="gap-1">
          <Text className="text-sm font-semibold text-foreground">Your next move</Text>
          <Text className="text-lg font-semibold text-foreground">
            {intelligence.decisionGuidance.state === "proceed"
              ? "Keep moving toward this goal"
              : intelligence.decisionGuidance.state === "adjust"
                ? "Adjust your plan before pushing ahead"
                : "More information is needed"}
          </Text>
          {(intelligence.decisionGuidance.recommendedActions ?? []).map((action) => (
            <Text className="text-sm leading-5 text-foreground" key={action}>
              {action}
            </Text>
          ))}
        </View>

        {isError ? (
          <View className="gap-2 rounded-2xl border border-border px-3 py-3">
            <Text className="text-xs leading-5 text-muted-foreground">
              Goal guidance may be stale because the latest evidence could not be loaded.
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

        {dimensions.length ? (
          <View className="gap-2 rounded-2xl border border-border px-3 py-3">
            <Text className="text-xs font-medium text-foreground">What this goal asks of you</Text>
            {dimensions.map((dimension) => (
              <View className="gap-1" key={dimension.dimension}>
                <ResultContext
                  label={`${dimension.dimension} requirement`}
                  result={dimension.requirement}
                />
                <ResultContext
                  label={`${dimension.dimension} coverage`}
                  result={dimension.coverage}
                />
                {dimension.capability ? (
                  <ResultContext
                    label={`${dimension.dimension} capability`}
                    result={dimension.capability}
                  />
                ) : null}
                {dimension.physicalGap ? (
                  <ResultContext
                    label={`${dimension.dimension} physical gap`}
                    result={dimension.physicalGap}
                  />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {(intelligence.opportunities.evidence ?? []).map((evidence) => (
          <View
            className="gap-1"
            key={`${evidence.goalSourceId}:${evidence.dimension ?? "unknown"}`}
          >
            <Text className="text-xs font-medium text-foreground">Improve this guidance</Text>
            <Text className="text-xs leading-5 text-muted-foreground">
              {evidence.dimension ? `${evidence.dimension} evidence` : "Additional goal evidence"}
            </Text>
            {evidence.reasonCodes.map((reason) => (
              <Text className="text-xs leading-5 text-muted-foreground" key={reason}>
                Reason: {formatReason(reason)}
              </Text>
            ))}
          </View>
        ))}
        {(intelligence.opportunities.training ?? []).map((opportunity) => (
          <View className="gap-1" key={`${opportunity.goalSourceId}:${opportunity.dimension}`}>
            <Text className="text-xs font-medium text-foreground">Training focus</Text>
            <Text className="text-xs leading-5 text-muted-foreground">
              {opportunity.dimension} · {resultLabel(opportunity.physicalGap)}
            </Text>
            {opportunity.physicalGap.reasonCodes.map((reason) => (
              <Text className="text-xs leading-5 text-muted-foreground" key={reason}>
                Reason: {formatReason(reason)}
              </Text>
            ))}
          </View>
        ))}

        <View className="gap-3 border-t border-border pt-3">
          <Text className="text-xs font-medium text-muted-foreground">Why this guidance</Text>
          {(intelligence.decisionGuidance.reasonCodes ?? []).map((reason) => (
            <Text className="text-xs leading-5 text-muted-foreground" key={reason}>
              Reason: {formatReason(reason)}
            </Text>
          ))}
          <ResultContext
            label="Sport-specific capability"
            result={intelligence.capability.sportSpecificity}
            showEvidence
          />
          <ResultContext
            label="Recent training readiness"
            result={intelligence.readiness.volumeTrend}
            showEvidence
          />
          <ResultContext label="Calendar fit" result={feasibility} showEvidence />
          <Text className="text-xs leading-5 text-muted-foreground">
            Calendar interpretation uses your confirmed timezone: {planningTimezone}.
          </Text>
        </View>
      </CardContent>
    </Card>
  );
}
