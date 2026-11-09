import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
import { AssignmentDirectory } from "../../../../components/coaching/organization-coaching-assignments/assignment-directory";
import { loadOrganizationAssignmentDirectory } from "../../../../lib/coaching/assignment-directory-server-functions";

const searchSchema = z
  .object({
    q: z.string().trim().min(1).max(120).optional(),
    cursor: z.string().uuid().optional(),
    primary: z.literal("unassigned").optional(),
    status: z.enum(["active", "paused"]).optional(),
  })
  .strict();

export const Route = createFileRoute("/_coaching/organizations/$organizationId/assignments")({
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({
    search: search.q ?? null,
    cursor: search.cursor ?? null,
    primary: search.primary ?? null,
    status: search.status ?? null,
  }),
  pendingMs: 0,
  loader: async ({ params, deps }) => ({
    organizationId: params.organizationId,
    search: deps.search,
    cursor: deps.cursor,
    primary: deps.primary,
    status: deps.status,
    page: await loadOrganizationAssignmentDirectory({
      data: {
        organizationId: params.organizationId,
        limit: 20,
        cursor: deps.cursor,
        engagementStatus: deps.status,
        withoutPrimaryAssignment: deps.primary === "unassigned",
      },
    }),
  }),
  pendingComponent: () => (
    <p role="status" className="text-sm text-slate-400">
      Loading coach assignments…
    </p>
  ),
  errorComponent: () => (
    <p role="alert" className="text-sm text-destructive">
      Coach assignments could not be loaded. Return to the organization dashboard and try again.
    </p>
  ),
  component: AssignmentDirectoryPage,
});

function AssignmentDirectoryPage() {
  const loaded = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  const { actorProfileId } = Route.useRouteContext();
  const { q, cursor, primary, status } = Route.useSearch();
  const location = useRouterState({ select: (state) => state.location });
  const liveSearch = searchSchema.safeParse(location.search);
  const directoryPath = `/organizations/${organizationId}/assignments`;

  if (
    !matchesDirectoryPath(location.pathname, directoryPath) ||
    !liveSearch.success ||
    liveSearch.data.q !== q ||
    liveSearch.data.cursor !== cursor ||
    liveSearch.data.primary !== primary ||
    liveSearch.data.status !== status ||
    loaded.organizationId !== organizationId ||
    loaded.search !== (q ?? null) ||
    loaded.cursor !== (cursor ?? null) ||
    loaded.primary !== (primary ?? null) ||
    loaded.status !== (status ?? null)
  )
    return <p role="status">Loading coach assignments…</p>;

  if (loaded.page.status === "forbidden") return <CoachAccessDenied />;
  return (
    <AssignmentDirectory
      key={`${actorProfileId}:${organizationId}:${cursor ?? ""}:${q ?? ""}:${primary ?? ""}:${status ?? ""}`}
      actorProfileId={actorProfileId}
      organizationId={organizationId}
      page={loaded.page}
      search={q ?? null}
      primary={primary ?? null}
      status={status ?? null}
    />
  );
}

function matchesDirectoryPath(pathname: string, directoryPath: string) {
  return pathname === directoryPath || pathname === `${directoryPath}/`;
}
