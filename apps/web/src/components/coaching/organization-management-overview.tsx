import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Link } from "@tanstack/react-router";

type ManagementOverview = {
  status: "granted";
  overview: {
    activeStaff: number;
    activeEngagements: number;
    pausedEngagements: number;
    activeEngagementsWithoutPrimary: number;
  };
};

export function OrganizationManagementOverview({
  organizationId,
  overview,
}: {
  organizationId: string;
  overview: ManagementOverview;
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">Overview</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Organization management
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Operational membership and assignment totals only. This view does not grant access to
          private athlete training, health, or messages.
        </p>
      </header>
      <section className="grid gap-4 md:grid-cols-2" aria-label="Organization operations">
        <CountCard
          count={overview.overview.activeStaff}
          description="Current staff memberships with an effective organization role."
          label="Active staff"
          to="/organizations/$organizationId/staff"
          organizationId={organizationId}
          search={{ status: "active", cursor: undefined }}
        />
        <CountCard
          count={overview.overview.activeEngagements}
          description="Current athlete engagements that are not paused."
          label="Active athlete engagements"
          to="/organizations/$organizationId/assignments"
          organizationId={organizationId}
          search={{ status: "active", cursor: undefined, primary: undefined, q: undefined }}
        />
        <CountCard
          count={overview.overview.pausedEngagements}
          description="Current athlete engagements marked paused; ended engagements are excluded."
          label="Paused athlete engagements"
          to="/organizations/$organizationId/assignments"
          organizationId={organizationId}
          search={{ status: "paused", cursor: undefined, primary: undefined, q: undefined }}
        />
        <CountCard
          count={overview.overview.activeEngagementsWithoutPrimary}
          description="Active engagements with no current primary coach. Supporting coaches alone do not fill this gap."
          label="Need a primary coach"
          to="/organizations/$organizationId/assignments"
          organizationId={organizationId}
          search={{ status: "active", primary: "unassigned", cursor: undefined, q: undefined }}
        />
      </section>
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Coverage and billing</CardTitle>
          <CardDescription className="text-slate-400">
            Timed coverage and plan-horizon signals are not available in this workspace yet. Review
            assignment gaps above; they do not claim a coverage gap is zero. Billing reporting is
            restricted to separately granted billing capability and is not shown here.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function CountCard({
  count,
  description,
  label,
  to,
  organizationId,
  search,
}: {
  count: number;
  description: string;
  label: string;
  to: "/organizations/$organizationId/staff" | "/organizations/$organizationId/assignments";
  organizationId: string;
  search: Record<string, string | undefined>;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <CardHeader>
        <CardDescription className="text-slate-400">{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{count}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-6 text-slate-400">{description}</p>
        <Button asChild variant="outline" className="border-slate-600 bg-slate-900 text-slate-100">
          <Link to={to} params={{ organizationId }} search={search}>
            View matching records
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
