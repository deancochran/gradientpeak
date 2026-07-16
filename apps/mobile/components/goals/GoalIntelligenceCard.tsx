import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";

type Explainability = {
  assessment: {
    at: string;
    state: "observed" | "estimated" | "unknown" | "insufficient_evidence" | "unsupported";
    uncertainty: "low" | "moderate" | "high" | "unknown";
  };
  evidence: readonly { label: string; type: string; observedAt: string }[];
  limits: readonly {
    id: string;
    label: string;
    state: "observed" | "estimated" | "unknown" | "insufficient_evidence" | "unsupported";
    reasons: readonly string[];
  }[];
  coverage: readonly { label: string; state: "complete" | "truncated" }[];
  collectionPrompts: readonly {
    label: string;
    destination: "profile_metrics" | "activity_import";
  }[];
};

type GoalIntelligenceCardProps = {
  intelligence?: { explainability: Explainability };
  isError?: boolean;
  isLoading?: boolean;
  onCollectionPrompt: (
    destination: Explainability["collectionPrompts"][number]["destination"],
  ) => void;
  onRetry?: () => void;
};

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function GoalIntelligenceCard({
  intelligence,
  isError = false,
  isLoading = false,
  onCollectionPrompt,
  onRetry = () => undefined,
}: GoalIntelligenceCardProps) {
  if (!intelligence) {
    return (
      <Card className="rounded-3xl border border-border bg-card" testID="goal-intelligence-card">
        <CardContent className="gap-3 p-4">
          <Text className="text-sm font-semibold text-foreground">Evidence & limits</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {isLoading ? "Loading assessment details." : "Assessment details are unavailable."}
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

  const { explainability } = intelligence;
  return (
    <Card className="rounded-3xl border border-border bg-card" testID="goal-intelligence-card">
      <CardContent className="gap-4 p-4">
        <View className="gap-1">
          <Text className="text-sm font-semibold text-foreground">Evidence & limits</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Assessed: {explainability.assessment.at}
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Result state: {formatLabel(explainability.assessment.state)}
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Decision uncertainty: {explainability.assessment.uncertainty}
          </Text>
        </View>

        {isError ? (
          <View className="gap-2 rounded-2xl border border-border px-3 py-3">
            <Text className="text-xs leading-5 text-muted-foreground">
              The displayed assessment may be stale because the latest details could not be loaded.
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

        <View className="gap-2 rounded-2xl border border-border px-3 py-3">
          <Text className="text-xs font-medium text-foreground">Evidence used</Text>
          {explainability.evidence.length ? (
            explainability.evidence.map((evidence) => (
              <Text
                className="text-xs leading-5 text-muted-foreground"
                key={`${evidence.label}:${evidence.type}:${evidence.observedAt}`}
              >
                {evidence.label} · {formatLabel(evidence.type)} · {evidence.observedAt}
              </Text>
            ))
          ) : (
            <Text className="text-xs leading-5 text-muted-foreground">No evidence was used.</Text>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-xs font-medium text-foreground">Limits and reasons</Text>
          {explainability.limits.length ? (
            explainability.limits.map((limit) => (
              <View className="gap-1" key={limit.id}>
                <Text className="text-xs leading-5 text-muted-foreground">
                  {limit.label} · {formatLabel(limit.state)}
                </Text>
                {limit.reasons.map((reason) => (
                  <Text
                    className="text-xs leading-5 text-muted-foreground"
                    key={`${limit.id}:${reason}`}
                  >
                    Reason: {reason}
                  </Text>
                ))}
              </View>
            ))
          ) : (
            <Text className="text-xs leading-5 text-muted-foreground">
              No additional limits were reported.
            </Text>
          )}
        </View>

        <View className="gap-2 border-t border-border pt-3">
          <Text className="text-xs font-medium text-foreground">Coverage</Text>
          {explainability.coverage.map((coverage) => (
            <Text className="text-xs leading-5 text-muted-foreground" key={coverage.label}>
              {coverage.label}: {coverage.state}
            </Text>
          ))}
        </View>

        {explainability.collectionPrompts.length ? (
          <View className="gap-2">
            <Text className="text-xs font-medium text-foreground">Add evidence</Text>
            {explainability.collectionPrompts.map((prompt) => (
              <Button
                className="self-start"
                key={prompt.destination}
                onPress={() => onCollectionPrompt(prompt.destination)}
                size="sm"
                testID={`goal-intelligence-collect-${prompt.destination}`}
                variant="outline"
              >
                <Text>{prompt.label}</Text>
              </Button>
            ))}
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}
