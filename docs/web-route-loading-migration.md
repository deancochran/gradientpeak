# Web route loading migration

## Contract

Router starts route-critical reads; Query owns their cache. The router, loaders and
providers use one request-isolated server cache and one cache per browser router.
Authenticated reads retain procedure authorization and trusted request context.
Secondary content must not block primary content. Refresh failures retain usable
cached data. Draft forms, recorder recovery and scheduling safety gates are not
mechanically converted to Suspense or bypassed.

No schema changes, preserved-data mutation, provider activation, or deployments.
Streaming transport and access-check changes require evidence, not speculative
replacement. Mobile Query defaults remain unchanged.

## Baseline

Started from fetched origin/main c7072ca839ca646f9a8db470af26756b8327cbe7.
The audited web application exists in unpublished feature checkpoints, not remote
main. Exact existing source checkpoints were merged (never preview ancestry) into
the feature worktree, producing prerequisite checkpoint
300103e56e2aae25e23df2499eb67ae1e7ef00da. This includes the existing web form,
coaching, and audit fixes; it is not evidence that those features passed release
acceptance. Compare task changes against that checkpoint, not the legacy main tree.

## Work and evidence

- Foundation: router context, request-aware local tRPC SSR transport, SSR cache
  integration, web-only cache/retry/serialization policy. In progress.
- Navigation: typed internal links and URL-owned group state. In progress.
- Pages: critical loaders, canonical inputs and selective secondary prefetch.
  In progress; recorder routes excluded from mechanical migration.
- Verification: focused tests, web types, production boundary build, browser
  loading/hydration evidence, independent review. Pending.
- Preview disposition: not integrated yet; coordinator owns locked checkpoint
  integration after focused checks. No runtime or database changes made.
- Publication: pending; the prerequisite baseline is not yet remote main.

## Acceptance evidence required

1. Cold load and navigation share loader/component keys without duplicate reads.
2. Fresh data is reused; stale data revalidates intentionally.
3. Independent queries start together; optional work does not hold the page.
4. Failed reads, not-found, empty and populated states remain distinct.
5. Query serialization round-trips rich data; failed server payloads are redacted.
6. Separate SSR requests cannot see another user's cache or auth context.
7. URL filters survive back/forward; internal links use router navigation.
8. Production client output excludes server API/database implementation.
