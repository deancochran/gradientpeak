import { createFileRoute } from "@tanstack/react-router";
import { AdministrativeAthleteRoster } from "../../../../components/coaching/athletes/administrative-athlete-roster";
import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
import { loadAdministrativeAthleteRoster } from "../../../../lib/coaching/athletes-server-functions";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/athletes")({
  loader: ({ params }) =>
    loadAdministrativeAthleteRoster({
      data: { organizationId: params.organizationId, limit: 20, cursor: null },
    }),
  component: AthleteRosterPage,
});

function AthleteRosterPage() {
  const roster = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  const { actorProfileId } = Route.useRouteContext();
  if (roster.status === "forbidden") return <CoachAccessDenied />;
  return (
    <AdministrativeAthleteRoster
      initialPage={roster}
      actorProfileId={actorProfileId}
      organizationId={organizationId}
    />
  );
}
