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

- Foundation and navigation checkpoints `48a473d8` and `3e21b329` are live in
  preview with integrated focused tests and web/login/Metro probes.
- Primary loaders cover dashboard, activities, activity plans, goals, calendar
  ranges/day/events, routes, integrations, notifications, thresholds, profiles,
  messages, training plans, groups, and selected discovery scope.
- Recorder lifecycle, new forms, draft-driven searches/previews and modal-only
  reads remain demand-driven. Existing access checks and write transport remain.
- Optional non-Suspense SSR prefetch caused a reproduced hydration mismatch.
  `prefetchSecondary` now starts optional reads early only on client navigation;
  initial documents start them on mount. Primary data is awaited on the server.
- A controlled transport test reproduced batch head-of-line blocking. Web queries
  use streaming batches; mutations retain the original batch link and headers.
- Infinite refresh is bounded to the existing cached page count (one when cold),
  with matching next-page cursors. It never eagerly exhausts pagination.
- Calendar date/month/today come from the loader snapshot. Group temporal keys
  use one-minute buckets, intentionally allowing at most 60 seconds of overlap.
- Dynamic backend hrefs use AppHrefLink to split pathname/search/hash; external
  URLs and fragment links retain native behavior.
- Verification: production builds and client boundary scans passed at earlier
  checkpoints; authenticated disposable SSR/hydration test passed. Expanded
  browser navigation, final full suite/types and independent review in progress.
- Production-mode authenticated runtime proof remains unavailable: the loopback
  acceptance runner uses HTTP while production auth correctly requires HTTPS.
  No security constraint was bypassed; temporary runner changes were reverted.
- Broad-loader preview integration and publication are pending; coordinator owns
  the exact checkpoint and locked runtime evidence before handoff.

## Acceptance evidence required

1. Cold load and navigation share loader/component keys without duplicate reads.
2. Fresh data is reused; stale data revalidates intentionally.
3. Independent queries start together; optional work does not hold the page.
4. Failed reads, not-found, empty and populated states remain distinct.
5. Query serialization round-trips rich data; failed server payloads are redacted.
6. Separate SSR requests cannot see another user's cache or auth context.
7. URL filters survive back/forward; internal links use router navigation.
8. Production client output excludes server API/database implementation.
