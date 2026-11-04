# Web route loading migration

## Follow-up: perceived loading remains unresolved

User feedback rejects navigation correctness alone as performance acceptance.
The preview contains the original migration, but real-user loading and missing
Common Load history remain separate unresolved outcomes.

Disposable Chromium measurements (development runtime, local connection, athlete
without activity history) found ~1.4s repeat-document hydration in the normal
configuration. Disabling the Vite inspector plugin alone measured ~1.25s; making
both instrumentation and lazy inspector UI opt-in measured ~1.2–1.36s, reducing
decoded resource totals from ~41 MB to ~26 MB. These are single-run diagnostic
comparisons, not network transfer sizes or proof of phone/user-data performance.
Resource counts initially hit the browser's 250-entry buffer; the diagnostic
now expands it to 5000 and records exact hydration separately from test polling.

One run recorded 106s Activities hydration; Vite also logged dependency reload
and a failed dynamic import, without proven causality. A repeat without concurrent
typechecking did not reproduce the stall. This remains unexplained, not erased by
a passing test. Actual served dashboard code confirms automatic component splitting.

The bounded improvement makes inspectors opt-in with `VITE_ENABLE_DEVTOOLS=true`;
production excludes the lazy factory. Both default absence and enabled inspector
navigation need browser verification. This does not alter auth, queries, recorder
ownership, or stored history. Useful preview delivery must not be called resolution
of the broader performance report.

Second startup slice removes test-only component exports from Goals, Settings,
and Activity Import. TanStack documents that exported route component identifiers
cannot be split, and the build emitted that exact warning for these pages. Tests
now obtain components from their existing mocked route definitions; access checks,
loader policies, forms and recorder code are unchanged. Verify generated lazy
component references and browser navigation before preview delivery.

The first splitting browser run passed the authenticated Goals regression but
crashed on repeat Activities navigation. Kernel evidence at 20:58:38 local time
on November 3 confirms a global out-of-memory kill of `chrome-headless` (PID
2906118). This establishes the browser termination cause, not the cause of the
preceding wait or the earlier 106-second outlier. The failed run is preserved at
`acceptance-2904462-1793757308224`; its chained build never ran. A standalone
timing rerun followed sequentially by the build is required before acceptance.
The standalone rerun `acceptance-2913230-1793757631028` also reached repeat
Activities and crashed: the kernel recorded another global OOM kill of
`chrome-headless` (PID 2914311) at 21:01:46 local time. No speed acceptance can be
drawn from either run. Identical retries stopped after two failures; the build is
being run separately. Browser verification needs sufficient isolated host memory
and failure-time resource observation; unrelated processes/shared services must
not be stopped implicitly. The three-page slice is not yet accepted or in preview.
The separately executed production build passed. Inspection of emitted client
`index-C2vnzdCQ.js` confirms component dynamic imports for Goals
(`goals-BsWn4So8.js`), Settings (`settings-XML_EqwP.js`) and Activity Import
(`import-3L3KIP0q.js`). These hashes identify this verification only, not stable
contracts. Focused 29 tests, strict types and independent review passed; the
authenticated Goals regression passed before the timing browser failed. Publish
as an incomplete draft checkpoint, with preview blocked on browser verification.

Read-only preserved-preview diagnostics also identified a separate active manual
import linked to a failed/retrying provider job. The related published athlete
state was fresh, but active import status intentionally blocks Common Load history.
The worker service was active; sanitized logs included provider request timeouts.
Client drain disconnects do not abort the lease-owned worker. No import state was
changed and no provider calls were initiated by the investigation. This explains
a possible unavailable-history state, not all-page latency or a proven upstream
root cause; account attribution to the screenshot remains unverified.

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
- Verification: web typecheck passed; full web Vitest passed 210 files / 1,114
  tests with `--maxWorkers=2`; production build and client boundary marker scan
  passed. Authenticated disposable SSR/hydration plus hover/click/back/forward
  navigation passed in `acceptance-1840398-1793738365056`. Final independent
  review found one internal-download edge case in AppHrefLink; native download
  handling and a regression test were added. Repository publication gates remain
  in progress.
- The first normal push stopped at strictness-ratchet growth: four web
  exact-optional-property mismatches. Fixes preserve omitted anchor targets,
  validated search shape and explicit undefined input contracts; the baseline
  and hook remain unchanged. Publication retry must run all normal gates.
- A subsequent normal hook passed repository static/types/strictness, workspace
  tests, parity/architecture, dependency checks and disposable DB verification.
  Runtime smoke needed guarded local Storage credentials from the existing
  `deriveRuntimeWebE2EEnvironment` identity-checked workflow. Its old document
  navigation interception no longer reached SSR reads: smoke now injects failure
  on client navigation, and dashboard loader errors retain explicit retry UI.
  No preserved schemas or data were reset to repair these prerequisites.
- Production-mode authenticated runtime proof remains unavailable: the loopback
  acceptance runner uses HTTP while production auth correctly requires HTTPS.
  No security constraint was bypassed; temporary runner changes were reverted.
- Broad-loader checkpoint `cd66b4ba7ad1ab16d46332770b5b546d4462dbe7` is live in
  preview at merge `9013842860c2af189bf0d647fe63bff08f62c040`: exact ancestry,
  44 integrated focused tests, HTTP health/login and Metro probes passed under
  lock. Publication is in progress through normal hooks; no bypass authorized.

## Acceptance evidence required

1. Cold load and navigation share loader/component keys without duplicate reads.
2. Fresh data is reused; stale data revalidates intentionally.
3. Independent queries start together; optional work does not hold the page.
4. Failed reads, not-found, empty and populated states remain distinct.
5. Query serialization round-trips rich data; failed server payloads are redacted.
6. Separate SSR requests cannot see another user's cache or auth context.
7. URL filters survive back/forward; internal links use router navigation.
8. Production client output excludes server API/database implementation.
