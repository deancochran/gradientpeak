import { createFileRoute } from "@tanstack/react-router";

import { CoachAccessDenied } from "../../../components/coaching/coach-access-denied";
import { CoachShell } from "../../../components/coaching/coach-shell";
import { loadOrganizationCoachingAccess } from "../../../lib/coaching/server-functions";

export const Route = createFileRoute("/_coaching/organizations/$organizationId")({
  loader: ({ params }) =>
    loadOrganizationCoachingAccess({ data: { organizationId: params.organizationId } }),
  component: OrganizationCoachingBoundary,
});

function OrganizationCoachingBoundary() {
  const access = Route.useLoaderData();

  if (access.status === "forbidden") {
    return <CoachAccessDenied />;
  }

  return <CoachShell organization={access.organization} />;
}
