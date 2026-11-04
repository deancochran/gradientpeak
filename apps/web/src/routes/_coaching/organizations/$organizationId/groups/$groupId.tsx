import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CoachAccessDenied } from "../../../../../components/coaching/coach-access-denied";
import { OrganizationGroupDetail } from "../../../../../components/coaching/organization-groups/organization-group-detail";
import { loadOrganizationGroup } from "../../../../../lib/coaching/organization-groups-server-functions";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/groups/$groupId")({
  loader: ({ params }) => loadOrganizationGroup({ data: params }),
  component: OrganizationGroupDetailPage,
});
function OrganizationGroupDetailPage() {
  const result = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  if (result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationGroupDetail group={result.group} organizationId={organizationId}>
      <Outlet />
    </OrganizationGroupDetail>
  );
}
