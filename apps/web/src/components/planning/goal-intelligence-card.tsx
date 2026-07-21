import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

type GoalIntelligence = {
  explainability: {
    assessment: { at: string; state: string; uncertainty: string };
    collectionPrompts: readonly { destination: string; label: string }[];
    coverage: readonly { label: string; state: string }[];
    evidence: readonly { label: string; observedAt: string; type: string }[];
    limits: readonly { id: string; label: string; reasons: readonly string[]; state: string }[];
  };
};

export function GoalIntelligenceCard({
  intelligence,
  isError,
  isLoading,
  onRetry,
}: {
  intelligence?: GoalIntelligence;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence &amp; limits</CardTitle>
        <CardDescription>
          Goal intelligence with explicit uncertainty and evidence coverage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading assessment details...</p>
        ) : null}
        {isError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-4">
            <p className="text-sm">Assessment details could not be refreshed.</p>
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Retry intelligence
            </Button>
          </div>
        ) : null}
        {intelligence ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge>{intelligence.explainability.assessment.state.replaceAll("_", " ")}</Badge>
              <Badge variant="outline">
                {intelligence.explainability.assessment.uncertainty} uncertainty
              </Badge>
              <Badge variant="secondary">
                Assessed {intelligence.explainability.assessment.at}
              </Badge>
            </div>
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Evidence used</h2>
              {intelligence.explainability.evidence.length ? (
                intelligence.explainability.evidence.map((item) => (
                  <p
                    key={`${item.label}:${item.observedAt}`}
                    className="text-sm text-muted-foreground"
                  >
                    {item.label} · {item.type.replaceAll("_", " ")} · {item.observedAt}
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No evidence was used.</p>
              )}
            </section>
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Limits</h2>
              {intelligence.explainability.limits.map((limit) => (
                <div key={limit.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-medium">
                    {limit.label} · {limit.state.replaceAll("_", " ")}
                  </p>
                  {limit.reasons.map((reason) => (
                    <p key={reason} className="mt-1 text-muted-foreground">
                      {reason}
                    </p>
                  ))}
                </div>
              ))}
            </section>
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Coverage</h2>
              {intelligence.explainability.coverage.map((coverage) => (
                <p key={coverage.label} className="text-sm text-muted-foreground">
                  {coverage.label}: {coverage.state}
                </p>
              ))}
            </section>
            {intelligence.explainability.collectionPrompts.length ? (
              <div className="flex flex-wrap gap-2">
                {intelligence.explainability.collectionPrompts.map((prompt) => (
                  <Button asChild key={prompt.destination} size="sm" variant="outline">
                    <a
                      href={prompt.destination === "profile_metrics" ? "/settings" : "/activities"}
                    >
                      {prompt.label}
                    </a>
                  </Button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
