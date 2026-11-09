import { createFileRoute } from "@tanstack/react-router";
import { CoachAccessDenied } from "../../../../../components/coaching/coach-access-denied";
import { OrganizationGroupList } from "../../../../../components/coaching/organization-groups/organization-group-list";
import { loadOrganizationGroups } from "../../../../../lib/coaching/organization-groups-server-functions";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/groups/")({
  loader: ({ params }) =>
    loadOrganizationGroups({
      data: { organizationId: params.organizationId, limit: 20, cursor: null },
    }),
  component: OrganizationGroupsIndexPage,
});
function OrganizationGroupsIndexPage() {
  const groups = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  if (groups.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationGroupList
      initialPage={groups}
      key={organizationId}
      organizationId={organizationId}
    />
  );
}
