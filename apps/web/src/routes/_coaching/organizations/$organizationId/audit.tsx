import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
import { OrganizationAuditHistory } from "../../../../components/coaching/organization-audit-history/organization-audit-history";
import { loadOrganizationAuditHistory } from "../../../../lib/coaching/audit-history-server-functions";

const searchSchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    action: z.string().trim().min(1).max(160).optional(),
    actorProfileId: z.string().uuid().optional(),
    resourceType: z.string().trim().min(1).max(160).optional(),
    resourceId: z.string().uuid().optional(),
    fromInclusive: z.string().datetime().optional(),
    toExclusive: z.string().datetime().optional(),
  })
  .strict();

export const Route = createFileRoute("/_coaching/organizations/$organizationId/audit")({
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    loadOrganizationAuditHistory({
      data: {
        organizationId: params.organizationId,
        limit: 20,
        cursor: deps.cursor ?? null,
        action: deps.action ?? null,
        actorProfileId: deps.actorProfileId ?? null,
        resourceType: deps.resourceType ?? null,
        resourceId: deps.resourceId ?? null,
        fromInclusive: deps.fromInclusive ? new Date(deps.fromInclusive) : null,
        toExclusive: deps.toExclusive ? new Date(deps.toExclusive) : null,
      },
    }),
  pendingComponent: () => (
    <p role="status" className="text-sm text-slate-400">
      Loading audit history…
    </p>
  ),
  errorComponent: () => (
    <p role="alert" className="text-sm text-destructive">
      Audit history could not be loaded. Return to the organization dashboard and try again.
    </p>
  ),
  component: AuditHistoryPage,
});

function AuditHistoryPage() {
  const result = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  const filters = Route.useSearch();
  if (result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationAuditHistory
      organizationId={organizationId}
      page={result.page}
      filters={filters}
    />
  );
}
