import { Button } from "@repo/ui/components/button";
import { createFileRoute, useRouter, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
import { OrganizationOverviewFrame } from "../../../../components/coaching/organization-overview-frame";
import { OrganizationRoles } from "../../../../components/coaching/organization-roles/organization-roles";
import { loadOrganizationRoleStaff } from "../../../../lib/coaching/organization-roles-server-functions";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/roles")({
  loader: async ({ params, context }) => ({
    actorProfileId: context.actorProfileId,
    organizationId: params.organizationId,
    staff: await loadOrganizationRoleStaff({
      data: { organizationId: params.organizationId, status: "active", limit: 50, cursor: null },
    }),
  }),
  pendingComponent: () => (
    <p role="status" className="text-sm text-slate-400">
      Loading organization roles…
    </p>
  ),
  errorComponent: RolesRouteError,
  component: OrganizationRolesPage,
});

function OrganizationRolesPage() {
  const loaded = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  const { actorProfileId } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const rolesPath = `/organizations/${organizationId}/roles`;
  if (
    (pathname !== rolesPath && pathname !== `${rolesPath}/`) ||
    loaded.organizationId !== organizationId ||
    loaded.actorProfileId !== actorProfileId
  )
    return <p role="status">Loading organization roles…</p>;
  if (loaded.staff.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationOverviewFrame activeTab="roles" organizationId={loaded.organizationId}>
      <OrganizationRoles
        actorProfileId={loaded.actorProfileId}
        organizationId={loaded.organizationId}
        page={loaded.staff.page}
      />
    </OrganizationOverviewFrame>
  );
}

function RolesRouteError() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } catch {
      // Keep the route error visible until an authoritative reread succeeds.
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-red-300">
        Organization roles could not be loaded. Retry the current organization role read.
      </p>
      <Button type="button" disabled={retrying} onClick={() => void retry()}>
        {retrying ? "Retrying organization roles…" : "Retry organization roles"}
      </Button>
    </div>
  );
}
