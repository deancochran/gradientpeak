# App reliability: main-based implementation

## Scope and baseline

Implemented locally on `feat/app-reliability-main`, based on
`c7072ca839ca646f9a8db470af26756b8327cbe7` from `origin/main`.
The user approved re-scoping to main rather than importing the substantially
newer legacy development foundations. The original plan and uncommitted work in
the separate `app-reliability-plan` worktree remain preserved; their tests and
Android build are not evidence for this change.

## Implemented behavior

- Dashboard, inbox, threads, and planning distinguish loading, failure, successful
  empty results, and stale cached data. Retry controls target the failed query.
- Conversations are selected explicitly by URL, not inbox polling order. Compose
  retains the original selection. Drafts survive same-recipient refreshes but
  reset on recipient changes to prevent cross-recipient sends.
- Inbox failures are actionable below the desktop breakpoint. Planning failures
  remain visible even when cached collections are empty.
- Better Auth account deletion is disabled at the shared server factory, covering
  direct requests and old deletion callbacks. The warning-only cleanup hook was
  removed. Mobile rejects deletion without network calls or session clearing;
  both clients describe deletion as unavailable.
- The header uses shared primary destinations in desktop navigation and a
  responsive Sheet, with Profile/Settings access and active-link semantics.
- cmdk owns highlighted-command Enter handling; content search remains a
  separate command. Profile and Notifications use existing main routes.

## Verification and limits

Focused rendered query-state, real cmdk/Radix interaction, mobile account/profile,
and real Better Auth handler tests passed. The auth test uses a mutating in-memory
adapter, asserts no destructive adapter calls, and confirms the original session
still resolves after both deletion endpoints return 404.

Final integrated verification, including navigation tests:

- `CI=true pnpm test`: all seven tasks passed; 1,870 tests passed, one skipped.
  Database/service environment variables pointed to an unavailable loopback
  endpoint, not preserved data. Unchanged task results may use Turbo's cache.
- `pnpm check-types`: all eight tasks passed (six cached).
- `pnpm lint`: exited successfully; 2,187 warnings and 65 informational
  diagnostics remain across the repository. No automatic fixes were applied.
- Focused mobile Jest invocation using `--runTestsByPath`: all three account
  adapter, auth hook, and profile suites passed (18 additional tests).
- `git diff --check`: passed.

Commands were run through the installed `mise` toolchain. Independent review of
query-state and deletion safety corrections found no remaining concrete defects.
Navigation review findings were corrected: Profile/Settings expose current-page
state, the Sheet description remains linked, and the shared command dialog
forwards its title to cmdk's root label. Regression tests verify the combobox's
accessible name and the navigation accessibility relationships.
Jest/jsdom evidence is not browser-width, native-device, database-concurrency, or
full account-cleanup evidence.

## Separately tracked runtime blocker

The documented `pnpm --filter @repo/db db:migrate` failed on a newly created,
identity-verified synthetic Supabase project because migration
`0006_add_activity_plan_derived_metric_projections.sql` references
`activity_plan_derived_metrics_cache`, which no earlier Drizzle migration creates.
The user explicitly chose separate repair tracking rather than schema changes
in this implementation. Browser/native fresh-backend acceptance remains blocked.

Only the task-owned `gradientpeak_reliability_main_20261031` stack was prepared;
it was stopped with `--no-backup`, and no project containers or volumes remained.
The task-owned Android emulator was also removed. Existing databases, emulator
data, and provider accounts were not used for acceptance. No authoritative schema
changes, real account deletion, or deployment were performed.

## Delivery status

Published as draft PR #112. Remote `origin/main` remains at `c7072ca` after a
fresh fetch; local preview commit `85bb736c` is local-only and must be preserved,
not treated as an upstream integration requirement or overwritten by refresh.

The user subsequently authorized continuing through acceptance, pipeline repairs,
and a narrowly scoped fresh-install migration repair tested only on a new owned
disposable database. The user then approved broader migration-history
reconciliation, including a reviewed fresh-baseline strategy. Existing databases
must not be migrated or reset; fresh-install evidence is not upgrade evidence.

Acceptance continuation evidence:

- The full mobile Jest suite initially reproduced four failing suites (16 tests).
  After fixture repairs, the integrated branch passes 102 suites and
  442 tests, with the existing one skipped suite/two skipped tests unchanged.
  Independent review rejected an unsupported gesture option introduced during
  that repair; it is removed, retaining Victory's default long-press behavior.
  The mock-only test now asserts that the default is not overridden; native
  gesture arbitration remains unverified on a device.
- CI's old aggregate omitted mobile Jest and reported success despite that job
  failing. The replacement `Basic checks` gate explicitly evaluates required
  results, rejecting failures, cancellation and unexpected skips. Workflow edits
  no longer qualify as docs-only changes.
- GitHub's Security workflow had been disabled for inactivity; it is re-enabled.
  PR-only advisory bypasses are removed. The dependency audit initially reported
  24 critical and 166 high findings. After integrating the scoped dependency
  repair, a fresh frozen install passes and the integrated audit reports zero
  critical/high findings (18 moderate, 4 low remain). Expo stays on SDK 54 and
  React Native on 0.81. Production web build and full native Jest checks exposed
  additional route-generator/ESM compatibility gaps. Removing four unsupported
  route-ID casts and regenerating the route tree restored the production web
  build and web typecheck; repeat generation is stable. Native ESM decoder tests
  pass after the precise Jest transform repair. A narrow Metro adapter preserves
  Expo 54's pinned Metro while supplying bytes to the fixed image decoder; two
  real-asset regression tests and a complete local iOS Hermes export pass.
  This is bundle evidence, not a native-device run. Independent review also found
  the upgraded mobile tRPC cookie path used an unpopulated cache; an authoritative
  async cookie-path repair and regressions are still required before acceptance.
  The first async repair passed mocked transport tests but further review found
  distinct login/request SecureStore namespaces and unsafe server switching;
  real storage-adapter and cross-origin tests are required before acceptance.
- Fresh replay passes the repaired `0006` but exposed missing group-table history
  at `0016`. The user explicitly approved reconciling the current main migration
  history on new disposable targets, without mutating existing databases.
  Authenticated browser/native runtime acceptance remains pending. The legacy
  web harness seeds Supabase Auth rather than the
  product's Better Auth users and can skip setup silently; it must not be used
  to claim authenticated acceptance without repair and disposable-target guards.
- Production image `05be57ba` builds from tracked source. The initial image scan
  found six high findings in bundled npm only; the runtime now omits that unused
  package manager. The unchanged Trivy high/critical, ignore-unfixed gate reports
  zero findings and zero secrets. A network-isolated smoke returned HTTP 200 from
  `/api/health` with synthetic runtime storage/auth settings; npm absence was
  verified and the owned container removed. The initial smoke's HTTP 500 was
  missing storage configuration, not a Nitro startup failure. This health probe
  does not establish authenticated or database-backed behavior.

No merge or successful local-preview refresh is claimed at this stage.

## Deferred work and release considerations

The full recording durability/native CI, provider lifecycle, privileged-function
review, and resumable deletion program remains deferred. Main supports GPS;
the legacy GPS-free contract was not applied.

Retained future deletion decisions: immediate lockout with resumable cleanup,
five-minute password re-authentication bound to the same user/session, and sole
owners transferring ownership or closing shared organizations first. These are
future workflow requirements, not implemented guarantees.

Before claiming deletion is disabled in a deployed environment, replace/drain all
old auth-handler instances; this is a process configuration gate, not a durable
remote feature flag. Already-issued deletion links intentionally stop working.
No deployment is included in this delivery.
