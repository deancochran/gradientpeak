import { createFileRoute } from "@tanstack/react-router";
import { CoachAccessDenied } from "../../../../../../components/coaching/coach-access-denied";
import { OrganizationGroupAthletes } from "../../../../../../components/coaching/organization-group-athletes/organization-group-athletes";
import { loadOrganizationGroupAthleteWorkflow } from "../../../../../../lib/coaching/organization-group-athletes-server-functions";

export const Route = createFileRoute(
  "/_coaching/organizations/$organizationId/groups/$groupId/athletes",
)({
  loader: ({ params }) =>
    loadOrganizationGroupAthleteWorkflow({
      data: { ...params, limit: 20, cursor: null },
    }),
  component: OrganizationGroupAthletesPage,
});

function OrganizationGroupAthletesPage() {
  const result = Route.useLoaderData();
  const { organizationId, groupId } = Route.useParams();
  if (result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationGroupAthletes
      groupId={groupId}
      initialPage={{ candidates: result.candidates, links: result.links }}
      key={`${organizationId}:${groupId}`}
      organizationId={organizationId}
    />
  );
}
