import { createFileRoute } from "@tanstack/react-router";
import { CoachAccessDenied } from "../../../../../../components/coaching/coach-access-denied";
import {
  OrganizationGroupAthletes,
  OrganizationGroupAthletesError,
  OrganizationGroupAthletesPending,
} from "../../../../../../components/coaching/organization-group-athletes/organization-group-athletes";
import { loadOrganizationGroupAthleteWorkflow } from "../../../../../../lib/coaching/organization-group-athletes-server-functions";

export const Route = createFileRoute(
  "/_coaching/organizations/$organizationId/groups/$groupId/athletes",
)({
  loader: async ({ params, context }) => ({
    organizationId: params.organizationId,
    groupId: params.groupId,
    actorProfileId: context.actorProfileId,
    result: await loadOrganizationGroupAthleteWorkflow({
      data: { ...params, limit: 20, cursor: null },
    }),
  }),
  pendingMs: 0,
  pendingComponent: OrganizationGroupAthletesPending,
  errorComponent: OrganizationGroupAthletesError,
  component: OrganizationGroupAthletesPage,
});

function OrganizationGroupAthletesPage() {
  const loaded = Route.useLoaderData();
  const { organizationId, groupId } = Route.useParams();
  if (loaded.result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationGroupAthletes
      groupId={groupId}
      initialPage={{ candidates: loaded.result.candidates, links: loaded.result.links }}
      key={`${organizationId}:${groupId}`}
      organizationId={organizationId}
    />
  );
}
