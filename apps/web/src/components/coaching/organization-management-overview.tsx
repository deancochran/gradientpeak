import { Badge } from "@repo/ui/components/badge";
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
  const { activeEngagements, activeEngagementsWithoutPrimary, activeStaff, pausedEngagements } =
    overview.overview;

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-sm text-slate-400">Organization administration / Service health</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Organization overview
          </h1>
          <p className="text-sm text-slate-400">Operational membership and assignment signals.</p>
        </div>
        <Button asChild className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300 sm:w-auto">
          <Link
            to="/organizations/$organizationId/assignments"
            params={{ organizationId }}
            search={{ status: "active", primary: "unassigned", cursor: undefined, q: undefined }}
          >
            Assign coach
          </Link>
        </Button>
      </header>

      <section
        aria-label="Organization operational totals"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        data-testid="organization-overview-metrics"
      >
        <MetricCard
          label="Active athletes"
          value={activeEngagements}
          to="/organizations/$organizationId/assignments"
          organizationId={organizationId}
          search={{ status: "active", primary: undefined, cursor: undefined, q: undefined }}
        />
        <MetricCard
          label="Active staff"
          value={activeStaff}
          to="/organizations/$organizationId/staff"
          organizationId={organizationId}
          search={{ status: "active", cursor: undefined }}
        />
        <MetricCard
          label="Unassigned"
          value={activeEngagementsWithoutPrimary}
          to="/organizations/$organizationId/assignments"
          organizationId={organizationId}
          search={{ status: "active", primary: "unassigned", cursor: undefined, q: undefined }}
        />
        <MetricCard
          label="Coverage gaps"
          value="Unavailable"
          description="Timed coverage is not available."
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="space-y-4">
          <Card className="border-slate-700 bg-slate-900 text-slate-50">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
              <div className="space-y-1">
                <CardTitle>
                  <h2>Needs an owner</h2>
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Active athletes without a current primary coach.
                </CardDescription>
              </div>
              <Badge className="shrink-0 border-slate-700 bg-slate-800 text-slate-200">
                Your scope
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-950/40 p-4">
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-white">
                    {activeEngagementsWithoutPrimary}
                  </p>
                  <p className="text-sm text-slate-400">
                    {activeEngagementsWithoutPrimary === 1
                      ? "athlete needs a primary coach"
                      : "athletes need a primary coach"}
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  className="border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
                >
                  <Link
                    to="/organizations/$organizationId/assignments"
                    params={{ organizationId }}
                    search={{
                      status: "active",
                      primary: "unassigned",
                      cursor: undefined,
                      q: undefined,
                    }}
                  >
                    View unassigned athletes
                  </Link>
                </Button>
              </div>
              <p className="text-sm leading-6 text-slate-400">
                Supporting coaches do not satisfy this assignment gap. Select an athlete to review
                and set their accountable primary coach.
              </p>
            </CardContent>
          </Card>

          <UnavailableCard
            title="Follow-up priorities"
            description="Activity-review and check-in priority data are not available in this workspace yet. No follow-up count is shown."
          />
        </div>

        <aside className="space-y-4" aria-label="Organization availability">
          <UnavailableCard
            title="Coverage"
            description="Timed coverage and plan-horizon signals are not available in this workspace yet. This does not mean there are no coverage gaps."
          />
          <UnavailableCard
            title="My tasks"
            description="Organization task assignments are not available in this workspace yet."
          />
          {pausedEngagements > 0 ? (
            <p className="px-1 text-sm text-slate-400">
              {pausedEngagements} paused athlete{" "}
              {pausedEngagements === 1 ? "engagement is" : "engagements are"} excluded from active
              assignment gaps.{" "}
              <Link
                to="/organizations/$organizationId/assignments"
                params={{ organizationId }}
                search={{ status: "paused", primary: undefined, cursor: undefined, q: undefined }}
                className="text-cyan-300 underline underline-offset-4 hover:text-cyan-100"
              >
                View paused athletes
              </Link>
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  to,
  organizationId,
  search,
}: {
  label: string;
  value: number | "Unavailable";
  description?: string;
  to?: "/organizations/$organizationId/assignments" | "/organizations/$organizationId/staff";
  organizationId?: string;
  search?: Record<string, string | undefined>;
}) {
  return (
    <Card className="gap-0 border-slate-700 bg-slate-900 py-0 text-slate-50">
      <CardHeader className="gap-2 p-4 sm:p-5">
        <CardDescription className="text-xs uppercase tracking-[0.12em] text-slate-400">
          {label}
        </CardDescription>
        <CardTitle
          className={
            value === "Unavailable" ? "text-lg sm:text-xl" : "text-2xl tabular-nums sm:text-3xl"
          }
        >
          {value}
        </CardTitle>
        {description ? <p className="text-xs leading-5 text-slate-400">{description}</p> : null}
      </CardHeader>
      {to && organizationId && search ? (
        <CardContent className="px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-auto px-0 text-cyan-300 hover:bg-transparent hover:text-cyan-100"
          >
            <Link to={to} params={{ organizationId }} search={search}>
              View matching records
            </Link>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}

function UnavailableCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-slate-700 bg-slate-900 text-slate-50">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription className="leading-6 text-slate-400">{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
