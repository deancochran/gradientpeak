import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
import { OrganizationOverviewFrame } from "../../../../components/coaching/organization-overview-frame";
import {
  PAGE_SIZE,
  StaffRoster,
  StaffRosterError,
  StaffRosterPending,
} from "../../../../components/coaching/staff/staff-roster";
import { loadOrganizationStaff } from "../../../../lib/coaching/staff-server-functions";

const staffSearchSchema = z
  .object({
    cursor: z.string().uuid().optional(),
    status: z.enum(["active", "suspended"]).default("active"),
  })
  .strict();

export const Route = createFileRoute("/_coaching/organizations/$organizationId/staff")({
  validateSearch: (search) => staffSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ cursor: search.cursor ?? null, status: search.status }),
  loader: ({ params, deps }) =>
    loadOrganizationStaff({
      data: {
        organizationId: params.organizationId,
        status: deps.status,
        limit: PAGE_SIZE,
        cursor: deps.cursor,
      },
    }),
  pendingComponent: StaffRoutePending,
  errorComponent: StaffRouteError,
  component: StaffPage,
});

function StaffPage() {
  const result = Route.useLoaderData();
  const { cursor, status = "active" } = Route.useSearch();
  const { organizationId } = Route.useParams();
  if (result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationOverviewFrame activeTab="staff" organizationId={organizationId}>
      <StaffRoster
        organizationId={organizationId}
        page={result.page}
        status={status}
        {...(cursor === undefined ? {} : { cursor })}
      />
    </OrganizationOverviewFrame>
  );
}

function StaffRoutePending() {
  const { organizationId } = Route.useParams();
  return (
    <OrganizationOverviewFrame activeTab="staff" organizationId={organizationId}>
      <StaffRosterPending />
    </OrganizationOverviewFrame>
  );
}

function StaffRouteError() {
  const { organizationId } = Route.useParams();
  const { status = "active" } = Route.useSearch();
  return (
    <OrganizationOverviewFrame activeTab="staff" organizationId={organizationId}>
      <StaffRosterError organizationId={organizationId} status={status} />
    </OrganizationOverviewFrame>
  );
}
