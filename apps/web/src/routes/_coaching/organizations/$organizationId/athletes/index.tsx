import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { AdministrativeAthleteRoster } from "../../../../../components/coaching/athletes/administrative-athlete-roster";
import { AssignedAthleteDirectory } from "../../../../../components/coaching/athletes/assigned-athlete-directory";
import { CoachAccessDenied } from "../../../../../components/coaching/coach-access-denied";
import {
  loadAdministrativeAthleteRoster,
  loadOrganizationAthletesLanding,
} from "../../../../../lib/coaching/athletes-server-functions";

const searchSchema = z
  .object({
    q: z.string().trim().min(1).max(120).optional(),
    cursor: z.string().uuid().optional(),
    view: z.literal("administration").optional(),
  })
  .strict();

export const Route = createFileRoute("/_coaching/organizations/$organizationId/athletes/")({
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({
    search: search.q ?? null,
    cursor: search.cursor ?? null,
    ...(search.view ? { view: search.view } : {}),
  }),
  pendingMs: 0,
  loader: async ({ params, deps }) => ({
    organizationId: params.organizationId,
    search: deps.search,
    cursor: deps.cursor,
    view: deps.view,
    page:
      deps.view === "administration"
        ? await loadAdministrativeAthleteRoster({
            data: { organizationId: params.organizationId, limit: 20, cursor: deps.cursor },
          }).then((page) =>
            page.status === "granted" ? { ...page, status: "administration" as const } : page,
          )
        : await loadOrganizationAthletesLanding({
            data: {
              organizationId: params.organizationId,
              limit: 20,
              cursor: deps.cursor,
              search: deps.search,
            },
          }),
  }),
  pendingComponent: () => (
    <p role="status" className="text-sm text-slate-400">
      Loading assigned athletes…
    </p>
  ),
  errorComponent: () => (
    <p role="alert" className="text-sm text-destructive">
      Assigned athletes could not be loaded. Return to the organization dashboard and try again.
    </p>
  ),
  component: AthletesLanding,
});

function AthletesLanding() {
  const loaded = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  const { actorProfileId } = Route.useRouteContext();
  const { q, cursor, view } = Route.useSearch();
  const location = useRouterState({ select: (state) => state.location });
  const liveSearch = searchSchema.safeParse(location.search);
  const directoryPath = `/organizations/${organizationId}/athletes`;
  // Intent preloads retain the prior route match during a history transition.
  // Do not show a directory (or its controlled search draft) for a different URL.
  if (
    !matchesDirectoryPath(location.pathname, directoryPath) ||
    !liveSearch.success ||
    liveSearch.data.q !== q ||
    liveSearch.data.cursor !== cursor ||
    liveSearch.data.view !== view ||
    loaded.organizationId !== organizationId ||
    loaded.view !== view ||
    loaded.search !== (q ?? null) ||
    loaded.cursor !== (cursor ?? null)
  )
    return <p role="status">Loading assigned athletes…</p>;
  const result = loaded.page;
  if (result.status === "forbidden") return <CoachAccessDenied />;
  if (result.status === "administration")
    return (
      <AdministrativeAthleteRoster
        initialPage={result}
        actorProfileId={actorProfileId}
        organizationId={organizationId}
      />
    );
  return (
    <div className="space-y-4">
      <Link
        to="/organizations/$organizationId/athletes"
        params={{ organizationId }}
        search={{ view: "administration" }}
        className="text-sm text-cyan-300 underline"
      >
        Administrative roster (administrator access required)
      </Link>
      <AssignedAthleteDirectory organizationId={organizationId} page={result} search={q ?? null} />
    </div>
  );
}

function matchesDirectoryPath(pathname: string, directoryPath: string) {
  // Treat the router's generated URL and its direct-link trailing-slash form as
  // the same route. Query key order, percent encoding and hashes are represented
  // separately by the live parsed location and must not affect route identity.
  return pathname === directoryPath || pathname === `${directoryPath}/`;
}
