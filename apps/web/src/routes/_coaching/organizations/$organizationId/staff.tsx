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

const staffSearchSchema = z.object({ cursor: z.string().uuid().optional() }).strict();

export const Route = createFileRoute("/_coaching/organizations/$organizationId/staff")({
  validateSearch: (search) => staffSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ cursor: search.cursor ?? null }),
  loader: ({ params, deps }) =>
    loadOrganizationStaff({
      data: { organizationId: params.organizationId, limit: PAGE_SIZE, cursor: deps.cursor },
    }),
  pendingComponent: StaffRosterPending,
  errorComponent: StaffRosterError,
  component: StaffPage,
});

function StaffPage() {
  const result = Route.useLoaderData();
  const { cursor } = Route.useSearch();
  const { organizationId } = Route.useParams();
  if (result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <StaffRoster
      organizationId={organizationId}
      page={result.page}
      {...(cursor === undefined ? {} : { cursor })}
    />
  );
}
