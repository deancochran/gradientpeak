import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
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
  pendingComponent: StaffRosterPending,
  errorComponent: StaffRouteError,
  component: StaffPage,
});

function StaffPage() {
  const result = Route.useLoaderData();
  const { cursor, status = "active" } = Route.useSearch();
  const { organizationId } = Route.useParams();
  if (result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <StaffRoster
      organizationId={organizationId}
      page={result.page}
      status={status}
      {...(cursor === undefined ? {} : { cursor })}
    />
  );
}

function StaffRouteError() {
  const { organizationId } = Route.useParams();
  const { status = "active" } = Route.useSearch();
  return <StaffRosterError organizationId={organizationId} status={status} />;
}
