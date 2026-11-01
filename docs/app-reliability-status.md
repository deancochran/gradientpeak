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

Runtime acceptance remains blocked by migration `0006`, so this implementation
is not merge-ready. It is published for review as a draft PR only; the
successful checks recorded above apply to the `c7072ca` baseline and are not
evidence of compatibility with the independently advanced local main commit
`85bb736c`.

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
