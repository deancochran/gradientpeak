import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { AthleteWorkspaceSwitcher } from "../../../../../components/coaching/athletes/athlete-workspace-switcher";
import { CoachActivityPlanPublication } from "../../../../../components/coaching/athletes/coach-activity-plan-publication";
import { CoachAthleteCalendar } from "../../../../../components/coaching/athletes/coach-athlete-calendar";
import { CoachAthleteCompletedActivities } from "../../../../../components/coaching/athletes/coach-athlete-completed-activities";
import { CoachAthleteGoals } from "../../../../../components/coaching/athletes/coach-athlete-goals";
import { CoachAthleteOverview } from "../../../../../components/coaching/athletes/coach-athlete-overview";
import { CoachAthleteZonesSection } from "../../../../../components/coaching/athletes/coach-athlete-zones-section";
import {
  parseActivityPlanPreparationSearch,
  preparationMatchesWorkspace,
} from "../../../../../lib/coaching/activity-plan-preparation-context";
import {
  currentCalendarWeek,
  loadCoachAthleteCalendar,
} from "../../../../../lib/coaching/athlete-calendar-server-functions";
import { loadCoachAthleteCompletedActivities } from "../../../../../lib/coaching/athlete-completions-server-functions";
import { loadCoachAthleteGoals } from "../../../../../lib/coaching/athlete-goals-server-functions";
import { loadCoachAthleteBikeZones } from "../../../../../lib/coaching/athlete-zones-server-functions";
import {
  loadAssignedCoachAthletes,
  loadCoachAthleteOverview,
  loadSelectedCoachAthlete,
} from "../../../../../lib/coaching/athletes-server-functions";

const forbiddenCalendar = { status: "forbidden" } as const;
const forbiddenGoals = { status: "forbidden" } as const;

export const Route = createFileRoute(
  "/_coaching/organizations/$organizationId/athletes/$athleteId",
)({
  pendingMs: 0,
  validateSearch: (search: Record<string, unknown>) => {
    const preparation = parseActivityPlanPreparationSearch(search);
    return preparation ?? {};
  },
  loader: async ({ context, params }) => {
    const data = { organizationId: params.organizationId, athleteProfileId: params.athleteId };
    const range = currentCalendarWeek();
    const [overview, directory, identity, calendar, completedActivities, goals, zones] =
      await Promise.all([
        loadCoachAthleteOverview({ data }),
        loadAssignedCoachAthletes({
          data: { organizationId: params.organizationId, limit: 20, cursor: null, search: null },
        }),
        loadSelectedCoachAthlete({ data }),
        // Calendar consent/network failures stay section-local; do not hide an
        // otherwise authorized athlete overview behind this secondary projection.
        loadCoachAthleteCalendar({ data: { ...data, ...range, cursor: null } }).catch(() => ({
          status: "error" as const,
        })),
        loadCoachAthleteCompletedActivities({ data }).catch(() => ({
          status: "error" as const,
        })),
        // Goals are an independent consented projection, not a claim about metrics,
        // calendar availability, readiness, or achievement.
        loadCoachAthleteGoals({ data: { ...data, cursor: null } }).catch(() => ({
          status: "error" as const,
        })),
        loadCoachAthleteBikeZones({ data })
          .then((result) =>
            result.status === "granted"
              ? { kind: "granted" as const, result }
              : { kind: "denied" as const },
          )
          .catch(() => ({ kind: "failed" as const })),
      ]);
    return {
      overview,
      directory,
      identity,
      calendar,
      calendarRange: range,
      completedActivities,
      goals,
      goalsRevision: crypto.randomUUID(),
      zones: {
        actorId: context.actorProfileId,
        athleteProfileId: params.athleteId,
        organizationId: params.organizationId,
        revision: crypto.randomUUID(),
        state: zones,
      },
      organizationId: params.organizationId,
      athleteId: params.athleteId,
      actorProfileId: context.actorProfileId,
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
  const { overview, directory, identity, calendar, completedActivities, goals, zones } = result;
  const { athleteId, organizationId } = Route.useParams();
  const preparationSearch = parseActivityPlanPreparationSearch(
    Route.useSearch() as Record<string, unknown>,
  );
  const { actorProfileId } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const workspacePath = `/organizations/${organizationId}/athletes/${athleteId}`;
  // Router intent preloads retain the previously presented route while the
  // destination loader is pending. Never leave that prior athlete's data on
  // screen after the address has changed to a different athlete or organization.
  if (
    !matchesWorkspacePath(pathname, workspacePath) ||
    result.athleteId !== athleteId ||
    result.organizationId !== organizationId ||
    result.actorProfileId !== actorProfileId
  )
    return <p role="status">Loading athlete workspace…</p>;
  const preparation = preparationMatchesWorkspace(preparationSearch, organizationId, athleteId)
    ? preparationSearch
    : null;
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
      {identity ? (
        <CoachActivityPlanPublication
          athleteId={athleteId}
          key={`${organizationId}:${athleteId}:${preparation?.activityPlanId ?? ""}:${preparation?.planningDate ?? ""}`}
          organizationId={organizationId}
          preparation={preparation}
        />
      ) : null}
      <CoachAthleteCalendar
        actorProfileId={actorProfileId}
        athleteId={athleteId}
        initialRange={result.calendarRange}
        key={`${actorProfileId}:${organizationId}:${athleteId}`}
        organizationId={organizationId}
        result={identity ? calendar : forbiddenCalendar}
      />
      <CoachAthleteCompletedActivities
        result={
          identity ? (completedActivities ?? { status: "forbidden" }) : { status: "forbidden" }
        }
      />
      <CoachAthleteGoals
        actorProfileId={actorProfileId}
        athleteId={athleteId}
        key={`${actorProfileId}:${organizationId}:${athleteId}:${result.goalsRevision}`}
        loaderRevision={result.goalsRevision}
        organizationId={organizationId}
        result={identity ? goals : forbiddenGoals}
      />
      <CoachAthleteZonesSection
        snapshot={identity ? zones : { ...zones, state: { kind: "denied" } }}
      />
    </div>
  );
}

function matchesWorkspacePath(pathname: string, workspacePath: string) {
  // TanStack Router accepts both generated paths and a direct-link trailing slash.
  // Hash changes intentionally do not affect selected-athlete identity.
  return pathname === workspacePath || pathname === `${workspacePath}/`;
}
