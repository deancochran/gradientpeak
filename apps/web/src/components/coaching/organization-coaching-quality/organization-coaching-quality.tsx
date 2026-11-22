import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { CoachAccessDenied } from "../coach-access-denied";
import { OrganizationOverviewFrame } from "../organization-overview-frame";

type Overview = {
  scopeKind: "organization_admin" | "assigned_engagements";
  scopeExplanation: string;
  snapshotAsOf: Date;
  definitions: {
    version: "coaching-quality-overview.v1";
    activeEngagements: string;
    pausedEngagements: string;
    activeWithoutPrimary: string;
    snapshotAsOf: string;
  };
  aggregates: {
    activeEngagementCount: number;
    pausedEngagementCount: number;
    activeWithoutPrimaryCount: number;
  };
};

export function OrganizationCoachingQualityPending({ organizationId }: { organizationId: string }) {
  return (
    <OrganizationOverviewFrame activeTab="coaching" organizationId={organizationId}>
      <div aria-label="Loading coaching assignment facts" className="space-y-5" role="status">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="grid gap-3 sm:grid-cols-3">
          {["active", "paused", "primary"].map((item) => (
            <div
              className="h-32 animate-pulse rounded-lg border border-border bg-card"
              key={item}
            />
          ))}
        </div>
        <span className="sr-only">Loading coaching assignment facts…</span>
      </div>
    </OrganizationOverviewFrame>
  );
}

export function OrganizationCoachingQualityError({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } catch {
      // An unreadable aggregate must remain an error, never an empty state.
    } finally {
      setRetrying(false);
    }
  }
  return (
    <OrganizationOverviewFrame activeTab="coaching" organizationId={organizationId}>
      <Card className="mx-auto max-w-2xl border-border bg-card text-foreground">
        <CardContent className="space-y-4 py-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Coaching assignment facts unavailable</h1>
            <p className="text-sm text-muted-foreground" role="alert">
              We could not load coaching assignment facts. Please retry this read.
            </p>
          </div>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={retrying}
            onClick={() => void retry()}
          >
            {retrying ? "Retrying coaching assignment facts…" : "Retry coaching assignment facts"}
          </Button>
        </CardContent>
      </Card>
    </OrganizationOverviewFrame>
  );
}

export function OrganizationCoachingQuality({
  organizationId,
  overview,
}: {
  organizationId: string;
  overview: Overview;
}) {
  const { aggregates, definitions } = overview;
  const empty = aggregates.activeEngagementCount === 0 && aggregates.pausedEngagementCount === 0;
  if (empty)
    return (
      <OrganizationOverviewFrame activeTab="coaching" organizationId={organizationId}>
        <Card className="border-border bg-card text-foreground">
          <CardContent className="space-y-3 py-6">
            <h1 className="text-xl font-semibold">No coaching assignment facts in this scope</h1>
            <p className="text-sm text-muted-foreground">
              There are no current active or paused engagements in the assignment scope available to
              you.
            </p>
            <p className="text-sm text-muted-foreground">
              First action: confirm a current coaching assignment or group membership.
            </p>
          </CardContent>
        </Card>
      </OrganizationOverviewFrame>
    );
  return (
    <OrganizationOverviewFrame activeTab="coaching" organizationId={organizationId}>
      <section className="space-y-6 text-foreground" data-testid="coaching-assignment-facts">
        <header className="space-y-2">
          <p className="text-sm font-medium text-primary">Scoped aggregate</p>
          <h1 className="text-2xl font-semibold">Coaching assignment facts</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            These are assignment facts, not a coaching-quality score. Review workload, service
            signals, horizons, and coverage are unavailable in this view.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Active engagements" value={aggregates.activeEngagementCount} />
          <Metric label="Paused engagements" value={aggregates.pausedEngagementCount} />
          <Metric label="Active without primary" value={aggregates.activeWithoutPrimaryCount} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border bg-card text-foreground">
            <CardHeader>
              <CardTitle>Scope</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{overview.scopeExplanation}</p>
              <p>
                {overview.scopeKind === "organization_admin"
                  ? "Organization-admin scope includes current organization engagements."
                  : "Assignment scope includes only current direct assignments and current active group coach-plus-athlete assignments."}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card text-foreground">
            <CardHeader>
              <CardTitle>Definitions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{definitions.activeEngagements}</p>
              <p>{definitions.pausedEngagements}</p>
              <p>{definitions.activeWithoutPrimary}</p>
              <p>{definitions.snapshotAsOf}</p>
              <p className="font-mono text-xs text-muted-foreground">{definitions.version}</p>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground">
          Snapshot recorded {overview.snapshotAsOf.toLocaleString()}. This view does not infer a
          head-coach role.
        </p>
      </section>
    </OrganizationOverviewFrame>
  );
}

export function OrganizationCoachingQualityDenied() {
  return <CoachAccessDenied />;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-border bg-card text-foreground">
      <CardContent className="py-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-primary">{value}</p>
      </CardContent>
    </Card>
  );
}
