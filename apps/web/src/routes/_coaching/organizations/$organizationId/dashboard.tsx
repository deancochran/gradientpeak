import { createFileRoute } from "@tanstack/react-router";
import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
import { OrganizationManagementOverview } from "../../../../components/coaching/organization-management-overview";
import { loadOrganizationManagementOverview } from "../../../../lib/coaching/server-functions";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/dashboard")({
  loader: ({ params }) =>
    loadOrganizationManagementOverview({ data: { organizationId: params.organizationId } }),
  component: CoachDashboardPage,
});

function CoachDashboardPage() {
  const overview = Route.useLoaderData();

  if (overview.status === "forbidden") return <CoachAccessDenied />;

  return <OrganizationManagementOverview overview={overview} />;
}
