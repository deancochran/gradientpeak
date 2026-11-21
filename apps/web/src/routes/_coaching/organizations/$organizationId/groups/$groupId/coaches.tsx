import { createFileRoute } from "@tanstack/react-router";

import { CoachAccessDenied } from "../../../../../../components/coaching/coach-access-denied";
import {
  OrganizationGroupCoaches,
  OrganizationGroupCoachesError,
  OrganizationGroupCoachesPending,
} from "../../../../../../components/coaching/organization-group-coaches/organization-group-coaches";
import { loadOrganizationGroupCoaches } from "../../../../../../lib/coaching/organization-group-coaches-server-functions";

export const Route = createFileRoute(
  "/_coaching/organizations/$organizationId/groups/$groupId/coaches",
)({
  loader: async ({ params, context }) => ({
    organizationId: params.organizationId,
    groupId: params.groupId,
    actorProfileId: context.actorProfileId,
    result: await loadOrganizationGroupCoaches({
      data: { ...params, limit: 20, linkCursor: null, candidateCursor: null },
    }),
  }),
  pendingMs: 0,
  pendingComponent: OrganizationGroupCoachesPending,
  errorComponent: OrganizationGroupCoachesError,
  component: OrganizationGroupCoachesPage,
});

function OrganizationGroupCoachesPage() {
  const loaded = Route.useLoaderData();
  const { organizationId, groupId } = Route.useParams();
  if (loaded.result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationGroupCoaches
      candidatePage={loaded.result.candidates}
      groupId={groupId}
      linkPage={loaded.result.links}
      organizationId={organizationId}
    />
  );
}
