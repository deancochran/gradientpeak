import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { CoachAccessDenied } from "../../../../../components/coaching/coach-access-denied";
import { OrganizationGroupDetail } from "../../../../../components/coaching/organization-groups/organization-group-detail";
import { loadOrganizationGroup } from "../../../../../lib/coaching/organization-groups-server-functions";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/groups/$groupId")({
  loader: ({ params }) => loadOrganizationGroup({ data: params }),
  component: OrganizationGroupDetailPage,
});
function OrganizationGroupDetailPage() {
  const result = Route.useLoaderData();
  const { organizationId, groupId } = Route.useParams();
  if (result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationGroupDetail group={result.group} organizationId={organizationId}>
      <nav aria-label="Organization group management">
        <Link
          to="/organizations/$organizationId/groups/$groupId/athletes"
          params={{ organizationId, groupId }}
          className="text-sm text-cyan-300 hover:text-cyan-200"
        >
          Manage group athletes
        </Link>
      </nav>
      <Outlet />
    </OrganizationGroupDetail>
  );
}
