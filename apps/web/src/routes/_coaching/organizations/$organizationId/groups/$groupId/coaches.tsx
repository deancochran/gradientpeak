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
  loader: ({ params }) =>
    loadOrganizationGroupCoaches({
      data: { ...params, limit: 20, linkCursor: null, candidateCursor: null },
    }),
  pendingComponent: OrganizationGroupCoachesPending,
  errorComponent: OrganizationGroupCoachesError,
  component: OrganizationGroupCoachesPage,
});

function OrganizationGroupCoachesPage() {
  const result = Route.useLoaderData();
  const { organizationId, groupId } = Route.useParams();
  if (result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationGroupCoaches
      candidatePage={result.candidates}
      groupId={groupId}
      linkPage={result.links}
      organizationId={organizationId}
    />
  );
}
