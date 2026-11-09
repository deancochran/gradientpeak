import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
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
  pendingMs: 0,
  loader: async ({ params, deps, context }) => ({
    organizationId: params.organizationId,
    actorProfileId: context.actorProfileId,
    filterKey: JSON.stringify(searchSchema.parse(deps)),
    result: await loadOrganizationAuditHistory({
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
  }),
  pendingComponent: () => (
    <p role="status" className="text-sm text-slate-400">
      Loading audit history…
    </p>
  ),
  errorComponent: AuditHistoryError,
  component: AuditHistoryPage,
});

function AuditHistoryPage() {
  const loaded = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  const filters = Route.useSearch();
  const { actorProfileId } = Route.useRouteContext();
  const location = useRouterState({ select: (state) => state.location });
  const liveSearch = searchSchema.safeParse(location.search);
  const auditPath = `/organizations/${organizationId}/audit`;
  const filterKey = JSON.stringify(searchSchema.parse(filters));
  if (
    (location.pathname !== auditPath && location.pathname !== `${auditPath}/`) ||
    !liveSearch.success ||
    JSON.stringify(liveSearch.data) !== filterKey ||
    loaded.filterKey !== filterKey ||
    loaded.organizationId !== organizationId ||
    loaded.actorProfileId !== actorProfileId
  )
    return <p role="status">Loading audit history…</p>;
  const { result } = loaded;
  if (result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationAuditHistory
      key={`${actorProfileId}:${organizationId}:${filterKey}`}
      organizationId={organizationId}
      page={result.page}
      filters={filters}
    />
  );
}

function AuditHistoryError() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } catch {
      // Keep the failure visible; a failed reread must not be reported as an empty history.
    } finally {
      setRetrying(false);
    }
  }
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-red-300">
        Audit history could not be loaded. Your submitted filters are retained in this address.
      </p>
      <Button
        disabled={retrying}
        onClick={() => void retry()}
        className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
      >
        {retrying ? "Retrying audit history…" : "Retry audit history"}
      </Button>
      <Link to="/organizations" className="block text-sm text-cyan-300">
        Return to organizations
      </Link>
    </div>
  );
}
