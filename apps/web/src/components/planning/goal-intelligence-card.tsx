import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

type GoalAssessment = inferRouterOutputs<AppRouter>["athleteIntelligence"]["getGoalAssessment"];

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatScore(value: number) {
  return Math.round(value).toString();
}

export function GoalIntelligenceCard({
  assessment,
  isError,
  isLoading,
  onRetry,
}: {
  assessment?: GoalAssessment;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}) {
  const readiness = assessment?.assessment;
  return (
    <Card data-testid="goal-intelligence">
      <CardHeader>
        <CardTitle>Goal readiness</CardTitle>
        <CardDescription>
          Readiness from your latest published athlete state, with freshness and confidence shown
          separately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading readiness assessment...</p>
        ) : null}
        {isError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-4">
            <p className="text-sm">
              {assessment
                ? "The displayed assessment may be stale because it could not be refreshed."
                : "Readiness could not be refreshed."}
            </p>
            <Button
              data-testid="goal-intelligence-retry"
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
            >
              Retry readiness
            </Button>
          </div>
        ) : null}
        {assessment ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge>{readiness ? formatLabel(readiness.status) : "unavailable"}</Badge>
              <Badge variant={assessment.freshness === "fresh" ? "secondary" : "outline"}>
                {assessment.freshness} state
              </Badge>
              <Badge variant="outline">
                {Math.round(assessment.assessmentConfidence * 100)}% confidence
              </Badge>
              <Badge variant="secondary">As of {assessment.computedAt}</Badge>
            </div>
            {readiness ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Score label="Readiness" value={readiness.readiness} />
                  <Score label="Fitness" value={readiness.fitnessScore} />
                  <Score label="Specificity" value={readiness.specificityScore} />
                  <Score label="Fatigue pressure" value={readiness.fatiguePenalty} />
                </div>
                <section className="space-y-2">
                  <h2 className="text-sm font-medium">Why this assessment</h2>
                  {readiness.reasonCodes.map((reason) => (
                    <p key={reason} className="text-sm text-muted-foreground">
                      {formatLabel(reason)}
                    </p>
                  ))}
                </section>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                A complete athlete-state baseline has not been published yet. Rebuild status:{" "}
                {formatLabel(assessment.rebuildStatus)}.
              </p>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{formatScore(value)}</p>
    </div>
  );
}
