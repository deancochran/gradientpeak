import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { AthleteWorkspaceSwitcher } from "../../../../../components/coaching/athletes/athlete-workspace-switcher";
import { CoachAthleteOverview } from "../../../../../components/coaching/athletes/coach-athlete-overview";
import {
  loadAssignedCoachAthletes,
  loadCoachAthleteOverview,
  loadSelectedCoachAthlete,
} from "../../../../../lib/coaching/athletes-server-functions";

export const Route = createFileRoute(
  "/_coaching/organizations/$organizationId/athletes/$athleteId",
)({
  pendingMs: 0,
  loader: async ({ params }) => {
    const data = { organizationId: params.organizationId, athleteProfileId: params.athleteId };
    const [overview, directory, identity] = await Promise.all([
      loadCoachAthleteOverview({ data }),
      loadAssignedCoachAthletes({
        data: { organizationId: params.organizationId, limit: 20, cursor: null, search: null },
      }),
      loadSelectedCoachAthlete({ data }),
    ]);
    return {
      overview,
      directory,
      identity,
      organizationId: params.organizationId,
      athleteId: params.athleteId,
    };
  },
  pendingComponent: () => (
    <p role="status" className="text-sm text-slate-400">
      Loading athlete workspace…
    </p>
  ),
  errorComponent: ({ reset }) => (
    <div>
      <p role="alert" className="text-sm text-destructive">
        The athlete workspace could not be loaded. No prior athlete data is shown.
      </p>
      <Button onClick={reset}>Retry workspace</Button>
    </div>
  ),
  component: AthleteWorkspacePage,
});

function AthleteWorkspacePage() {
  const result = Route.useLoaderData();
  const { overview, directory, identity } = result;
  const { athleteId, organizationId } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const workspacePath = `/organizations/${organizationId}/athletes/${athleteId}`;
  // Router intent preloads retain the previously presented route while the
  // destination loader is pending. Never leave that prior athlete's data on
  // screen after the address has changed to a different athlete or organization.
  if (
    !matchesWorkspacePath(pathname, workspacePath) ||
    result.athleteId !== athleteId ||
    result.organizationId !== organizationId
  )
    return <p role="status">Loading athlete workspace…</p>;
  return (
    <div className="space-y-6">
      <Button asChild variant="outline" className="border-slate-700 text-slate-100">
        <Link
          to="/organizations/$organizationId/athletes"
          params={{ organizationId }}
          search={{ q: undefined, cursor: undefined }}
        >
          All assigned athletes
        </Link>
      </Button>
      <AthleteWorkspaceSwitcher
        key={`${organizationId}:${athleteId}`}
        athleteId={athleteId}
        organizationId={organizationId}
        initialPage={directory}
        selectedAthlete={identity}
      />
      <CoachAthleteOverview
        athleteId={athleteId}
        result={identity ? overview : { status: "unavailable" }}
      />
    </div>
  );
}

function matchesWorkspacePath(pathname: string, workspacePath: string) {
  // TanStack Router accepts both generated paths and a direct-link trailing slash.
  // Hash changes intentionally do not affect selected-athlete identity.
  return pathname === workspacePath || pathname === `${workspacePath}/`;
}
