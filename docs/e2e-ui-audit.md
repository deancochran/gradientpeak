# Web and native E2E UI audit

## Current integration gate

### Full Desktop Chrome candidate attempt — invalidated by concurrent source writes

On 2026-10-30, the browser-only disposable acceptance command was run from
`apps/web` with Node `v24.19.0` at HEAD
`2a0f32794c78c606c2f2c24d1ea29c3b8b400911` and lockfile SHA-256
`122a01e0c51c8d10095a26266e882e627d2fcad459bb68bf8195d63ad12c15bb`:

```sh
mise x node@24.19.0 -- pnpm exec tsx scripts/run-disposable-acceptance.ts \
  e2e/specs --project='Desktop Chrome' --reporter=list,json,junit
```

The runner reported **222 passed, 4 failed, 1 timed out, and 0 skipped**
(227 selected scenarios; 33.0 minutes). The two canonical provider specs,
`integrations.spec.ts` and `integration-variations.spec.ts`, remained explicit
acceptance-config exclusions and are not counted. Private list output, JSON,
and JUnit are retained outside the checkout in
`~/.local/share/opencode/full-desktop-20261030T182739Z/`.

This is **not candidate evidence**: the required before/after content manifests
did not match. While the run was active, 10 new nonignored source files appeared
and six existing source files changed, including mobile/chatbot files,
`apps/web/src/components/chatbot/*`,
`apps/web/src/components/protected/protected-header.tsx`, and API chatbot
package files. The run therefore did not execute against a frozen tree. No
product or assertion change was made from these failures.

Read-only source audit of the observed failures found:

- `capability-p0-record-lifecycle.spec.ts`: the persisted-recording assertion
  could not find the exact plan title within the activity card. The saved
  activity link was present and the failure does not establish whether the
  current activity presentation or title expectation is at fault.
- `capability-p0-route-gaps.spec.ts`: the route-attached recording case reached
  its 90-second limit; its cleanup then attempted navigation after Playwright
  closed the page. This is not a separate route product diagnosis.
- `onboarding-social-variations.spec.ts`: the first open-group join did not
  produce the expected active membership in its database postcondition; later
  cases failed earlier at isolated-athlete sign-up with HTTP 500. The group
  router's open-policy path still calls `setGroupMembershipActive`, but the
  interrupted candidate prevents attributing the runtime result to product code
  rather than the changed run state/prerequisite.

Rerun only after the checkout is again single-writer and a new manifest remains
stable for the full process; then diagnose the original failures against that
frozen candidate before considering any repair.

The audit-era `pnpm quality:agent` attempt failed at Biome with 12
formatting/import-order diagnostics in other chatbot/API/database work, before
the later gate stages ran. Diagnostic inventory is retained in private shell
record `sh_18b7ba837001UXsa6651b35Jtl`. Those files were not reformatted by this
test-audit lane. The earlier successful quality gate is historical, not evidence
that this current checkout passes. Scoped checks and selected browser passes
below remain separate evidence. No all-suite or current full-native pass is claimed.

**Scope:** all 53 `apps/web/e2e/specs/*.spec.ts` files, the native acceptance spec,
and maintained Maestro flows, reviewed 2026-10-30 against
`2a0f32794c78c606c2f2c24d1ea29c3b8b400911` plus the active compatible
working tree. This is an inventory of what each spec claims to prove and the
permitted non-UI setup it uses; it is not a claim that every route has just
been rerun in this lane.

## Evidence and classification

- Read-only source review covered all 53 browser spec files and their setup
  helpers. Most claimed mutations already use UI controls; this finding is
  source-audit evidence, not a runtime pass of all browser specs.
- I reviewed the three owned specs and their page helpers directly. The
  `importActivity` helper in `activities/fixture-files.ts` is a UI wrapper:
  `ActivitiesPage.openImporter()` opens `/activities/import`, `setInputFiles`
  selects the browser file input, and `submitImport()` clicks **Import
  activity** before waiting for the activity URL. It does **not** call a
  transport API. `core-acceptance.spec.ts` therefore retains it.
- Static transport scan of the spec directory found intentional direct request
  use only in auth replay/verification tests and the calendar fault injection
  called out below. Database reads are assertion evidence; fixture writes are
  allowed only when the capability under test is not that authoring journey.
- Fresh disposable browser evidence (Node 24, Desktop Chrome) ran on 2026-10-30
  with `e2e/specs --project='Desktop Chrome'`: **176 passed, 30 failed, 22
  timed out, and 0 skipped** (228 scenarios, 40.6 minutes). The JSON, JUnit,
  stdout, trace, and failure screenshots are private runner artifacts under
  `apps/web/.logs/desktop-chrome-specs-1793367058.*` and
  `apps/web/test-results/acceptance-1424635-1793367058974/`. This supersedes
  the historical per-row execution labels below; they remain useful for the
  scenario/setup classification, not as current execution evidence.
- `integrations.spec.ts` and `integration-variations.spec.ts` were explicitly
  excluded by `playwright.acceptance.config.ts` (`testIgnore`) because they
  require canonical/live-provider state. They were not counted as pass, fail,
  timeout, or skipped browser scenarios. No selected browser scenario was
  skipped.
- Before the corrected browser-only invocation, the runner was invoked without
  a path. Its acceptance config also selected `e2e/native/current-candidate.spec.ts`;
  that unrelated native case failed before any Android runner setup because the
  browser project cannot satisfy its native contract. It is excluded from the
  browser totals above and was not rerun.
- The current core retry remains blocked: after its explicit UI retry,
  `activities.createFromRecordingSummary` returned HTTP 500 / tRPC
  `INTERNAL_SERVER_ERROR`, and the UI reported `Server intake: failed retryable
  (internal)`. The safe server stack begins `TRPCError: Recording activity
  could not be committed` at `packages/api/src/routers/activities.ts:485`; that
  message is the catch-all wrapper in `submit-mobile-recording.ts`, so the
  response does not expose the inner exception. The active, excluded boundary
  is the concurrent recording-submission/API lane; this audit does not alter
   it or relabel the failure as a UI pass.

## Focused messaging and auth remediation evidence

## Current plan/screen drift follow-up

**Source-audit correction (2026-10-30): NOT EXECUTED after correction.** The
following dispositions are source evidence, not browser results. `KEEP` means
the current assertion already preserves the outcome, `UPDATE` means the source
supports the outcome with the listed narrow correction, and `BLOCKED` means the
original outcome has no demonstrated current surface.

| Exact changed scenario | Disposition | Outcome and source evidence |
| --- | --- | --- |
| `activity-plans.spec.ts` — canonical V5 library discovery | UPDATE | Protected detail intentionally uses ordinal step labels (`showStepNames={false}`); retain `Step 1`, timeline, and add the rendered `activity-plan-estimates` row rather than asserting hidden authored names. |
| `activity-plans.spec.ts` — V5 authoring/persistence | UPDATE | Keep raw-invalid draft, zero target, optional name/instructions, and DB persistence assertions. The saved protected detail renders both `activity-plan-session-flow-timeline` and `activity-plan-estimates`. |
| `plans-variations.spec.ts` — narrow card/category filter | UPDATE | The actual category control is `Cycling`, which sets `activity_category=bike`; `All` was the default and did not test filtering. |
| `plans-variations.spec.ts` — duplicate cancel edit | UPDATE | Duplicate success navigates to the copy detail. Back from its query-state editor must show the unchanged copy after reload; explicit source navigation must still show the unchanged original. |
| `plans-variations.spec.ts` — keyboard-created activity plan reopen | UPDATE | Saved protected detail supports timeline and estimates presence; it intentionally does not expose step names. |
| `plans-variations.spec.ts` — required activity-plan inputs | UPDATE | The composer enables Add step only after category selection, and Create becomes available after a step has valid completion and quantity. |
| `plans-variations.spec.ts` — settings unsaved units reload | KEEP (distinct profile-draft outcome) | This asserts a deliberately unsaved **profile display-units** change is discarded by reload. It is a distinct draft-recovery UX dimension, not training-preferences coverage; profile-units persistence remains covered by the P2 Settings scenario. |
| Original training-preferences schedule/preferences outcomes | BLOCKED | `/training-preferences` has no active route or menu target. Preferred units is a profile field saved by Update Profile, not the former plan-owned weekly count/duration/weekdays/progression/recovery capability. Retire that original outcome explicitly or provide its current plan-owned successor. |
| `auth-variations.spec.ts` — protected settings return path | KEEP (generic return path only) | `/settings` is a current protected route, so it remains return-path coverage; it is not training-preferences coverage. |
| `shell-screen-variations.spec.ts` — recipient empty/corrected search | UPDATE | The composer renders each matching recipient as a button named with `@username`; corrected search must assert the matching `@playwright_coach` result, not the static New message heading. |
| `shell-screen-variations.spec.ts` — narrow Settings destination | KEEP (generic Settings navigation) | The account menu exposes Settings and the scenario asserts its profile form is reachable on a narrow viewport. It does not assert display units or substitute for the blocked training-preferences outcome. |
| `shell-screen-variations.spec.ts` — Settings reload/messages history | UPDATE (generic Settings route) | Settings reload/history remains valid route coverage; units visibility is separate duplicate coverage, not proof of training preferences. |
| `plans-variations.spec.ts` — current activity/training-plan runtime contracts | UPDATE | The live activity-plan list re-renders after search, so its named card is first awaited and then opened by Playwright's retrying click (which scrolls the action into view) rather than retaining a detached element handle. A duplicate has no source-history entry, so the unchanged original is revisited through its explicit detail URL before searching it. Activity-plan creation still requires the current category-plus-step composition; the scheduled training entry's accessible name uses the fixture activity-plan title. |
| `screen-functionality.spec.ts` and `shell-screen-variations.spec.ts` — recording destination | UPDATE | `/record` renders the current category-specific heading (`run session` for the isolated actor), not the removed `Start an indoor activity` heading. The route, recorder controls, and history outcomes remain asserted. |
| `shell-screen-variations.spec.ts` — corrected recipient search | UPDATE | The isolated coach username is execution-scoped, not the stale literal `playwright_coach`. The scenario provisions that named recipient fixture and asserts its exact rendered `@username` result after correcting an empty query. |
| `goals-variations.spec.ts` — narrow filtered goal detail | UPDATE | Filtering re-renders the goal-card list. The exact retained card locator is awaited and then opened by the retrying click (which scrolls it into view), preserving the narrow-view search/history outcome without retaining a detached element handle. |
| `plans-variations.spec.ts` — source card and scheduled deletion dialog | UPDATE | Search results may include the newly created duplicate, so reopening the original uses the exact source-backed accessible name `Open activity plan Playwright Tempo Builder`. The current deletion dialog states `including 1 scheduled session`; the assertion preserves that protected-history/deletion-disabled outcome without relying on obsolete wording. |

**Final focused runtime evidence (2026-10-30):** after the repaired
`@repo/api/chatbot/recovery` export unblocked isolated actor provisioning, the
disposable Node 24 / Desktop Chrome runner completed the four remaining audited
specs with **44/44 passed, 0 unexpected, 0 skipped, and 0 flaky** in 285.1
seconds (`acceptance-2204328-1793382197592`). Exact combined list/JSON stdout
is retained privately at
`apps/web/.logs/audit-followup-runtime-final4-1793382197.stdout.log`. The
source-backed corrections retain category filtering, unchanged duplicate/source
behavior, current activity-plan composition and protected scheduling behavior,
recording-route reachability, corrected recipient discovery, and goal-detail
history; no planned-session capture expectations were introduced.
| `calendar-planning-variations.spec.ts` — blank create/back | UPDATE | Do not click a disabled control. The scenario visibly establishes the prefilled date, empty required Time, unselected Event time zone control, disabled Create, title focus, and Back to the selected-day Agenda. Source disables Create for missing date/timezone/time, while title is native `required`; it does not establish an invalid-submit recovery surface. |
| `capability-p0-public-share.spec.ts` — anonymous public activity/training reader | UPDATE | Public readers render overview/session flow but no owner Edit/Delete/Schedule controls; retain anonymous-reader absence assertions. |
| `capability-p0-public-share.spec.ts` — narrow public activity structure reload | UPDATE | The public fixture authors one named `Tempo` step with `1800 sec · 180 W`; `Tempo ride` and `Main set` are not fixture or reader output. |

**Open product decision:** explicitly retire the original training-preferences
outcome, or provide an intended current plan-owned preference surface. The
retained Settings units draft-discard scenario is intentionally distinct profile
draft UX; it does not close the blocked original outcome. Profile-units
persistence is already covered by the P2 Settings scenario, so no duplicate
save/restore variation is retained here.

**Focused post-correction execution (2026-10-30): PARTIAL / blocked by local
auth provisioning.** Disposable Node 24 / Desktop Chrome ran the seven affected
specs in `acceptance-1960897-1793377854482`: 14 passed, 48 failed, 0 skipped
(284.7 seconds). Per file: `activity-plans` 1 passed / 1 timed out;
`calendar-planning-variations` 10 passed / 1 failed; `capability-p0-public-share`
3 passed / 2 failed; `goals-variations` 0 / 6 failed; `plans-variations` 0 / 14
failed; `screen-functionality` 0 / 4 failed; `shell-screen-variations` 0 / 20
failed. Forty-three failures stopped before the scenario at isolated athlete
sign-up (`POST /api/auth/sign-up/email` returned HTTP 500); two equivalent coach
provisions did the same. The response was the generic Better Auth
`{"status":500,"unhandled":true,"message":"HTTPError"}`, so it does not
identify a source-level auth cause in this UI lane. This is a local prerequisite
blocker, not a basis to weaken the affected assertions. The remaining independent
failures were: the blank calendar form did not focus Title (fixed by adding native
autofocus, matching the scenario's visible focus contract); the public training
reader rendered the route error surface (`We could not load this page`) while
loading a fresh public fixture; and the long V5 authoring scenario left Create
plan disabled after completing its two steps and reached its 120-second timeout.
Those latter two retain their assertions pending source/owner diagnosis and a
rerunnable provisioner. No full suite was run.

**Focused recovery results (2026-10-30):** after adding native autofocus, the
calendar variation file reran cleanly (**11/11 passed**, `acceptance-1990798-*`,
92.4 seconds). The public-reader failure was traced to its E2E training-plan
builder writing a stale, incomplete V1 structure that the current public reader
correctly rejects with `trainingPlanSchema.parse`. The builder now writes the
required preferences plus valid session ID/demand; the public-share file then
reran cleanly (**5/5 passed**, `acceptance-2005037-*`, 40.0 seconds). The
activity-plan file still fails (**0/2**): its canonical discovery case clicks
the rendered account-menu trigger but the menu is absent from the observed
accessibility tree, and the authoring case keeps **Create plan** disabled after
the second completed step; both assertions remain intact pending owned
navigation/composer diagnosis. The all-seven batch was not rerun because that
remaining affected file is not green.

**Activity-plan correction (2026-10-30):** source/artifact diagnosis found two
separate causes. The account-menu artifact showed the server-rendered trigger
without any menu content after the click. `ShellPage.openAccountMenu()` now
waits for Radix's hydrated `data-state="closed"` trigger before performing the
same user click; it does not route around the menu. The authoring artifact
showed a complete two-step draft but a disabled Create button. This was not a
draft flush or blur defect: Core's `getActivityPlanAuthoringIssues()` rejects an
RPE target combined with objective watts. The V5 journey retains raw-invalid
input recovery, an explicit zero target, optional name/instructions, persistence,
manifest, timeline/estimate, and history-protection assertions, but uses the
permitted supplemental cadence target (`90 rpm`) rather than invalid `5 RPE`.
A focused composer regression passes (**21/21**) and asserts this repaired
zero-watts/cadence structure reaches save. The regular `test:e2e` invocation
was the wrong entrypoint and its shared-DB startup failure is not an acceptance
blocker. The verified-disposable Node 24 acceptance runner then executed both
browser scenarios: canonical menu discovery passed, while authoring reached
schedule and correctly surfaced the absolute-objective evidence requirement for
its `0 W` target instead of producing **Reschedule**. The zero target,
persistence, manifest, timeline/estimate, and history-protection assertions
remain intact; scheduling is presently an active, source-confirmed evidence
precondition failure, not a passed journey or an assertion to weaken.

**Scheduling-contract split follow-up:** the Thresholds UI is read-only (it
lists calculated thresholds/history) and exposes no user action to create the
fresh bike-power calibration fact required for an absolute watts target. The
journey therefore preserves the saved zero-watt/cadence structure and its DB
evidence, then uses the visible plan editor to replace that target set with
`5 RPE` before scheduling the same saved plan. Direct planned-session rows are
intentionally references: `drizzle-planned-session-repository.ts` writes
`activity_plan_revision`, `resolution_manifest`, and
`prescription_captured_at` as `null`; the live DB service test asserts that
same null shape. Recording launch captures the current prescription later.
The browser assertion now verifies the plan ID/date/status plus all three null
reference fields; immutable recording-start coverage remains in
`record-calendar.spec.ts`.

**Final focused activity-plan evidence (2026-10-30):** the verified disposable
Node 24 / Desktop Chrome runner completed **2/2 passed** in 26.2 seconds
(`acceptance-2120808-1793380502193`). This includes hydrated account-menu
discovery and the complete zero-authoring → visible RPE edit → direct reference
schedule → comment → protected deletion journey. `plans-variations.spec.ts`
does not import or use `ShellPage`, the only shared helper corrected here, so
its independent variations were not rerun for this helper-only change.

- Fresh disposable Node 24 / Desktop Chrome evidence at
  `acceptance-1702534-1793372844824` ran the two messaging specs plus
  `auth-variations.spec.ts`: **20 passed, 0 unexpected** in 177.7 seconds.
  The private runner stdout is
  `apps/web/.logs/messaging-auth-e2e-final-1793373000.stdout.log`.
- The prior messaging failures were a server-side SQL alias defect, not a
  profile/user-ID mismatch: raw SQL interpolated Drizzle alias objects as
  relation names (`membership` and `participant_count`) instead of declaring
  their underlying tables with aliases. Safe disposable diagnostics established
  PostgreSQL `42P01` for those relations. The API now declares each alias in
  its `FROM`/`JOIN`/`UPDATE` clause, and the live-DB regression verifies an
  empty direct conversation remains listable with its peer profile.
- Authentication variations are included in that final run. Sign-out correctly
  lands at `/auth/login`; the prior `/` expectation was a stale test helper
  expectation, not an auth redirect defect.

## Native current-candidate audit

- Native setup is runner-owned: its Playwright fixture creates the synthetic account and DB reads
  are postcondition evidence only. The Maestro flows do not seed artifacts or issue write APIs.
- The full journey now enters the composer through the Plan tab, Me library, and **Create**;
  schedules through the created plan's visible **Schedule** action; finds sessions through the
  visible Calendar date and training-breakdown row; and enters recording through the Record tab.
  Deep links remain only in `profile-onboarding.yaml` to attach the development client to the
  runner-owned Metro endpoint, a navigation-contract/setup boundary rather than journey discovery.
- The former selector failure in `acceptance-215839-1793338876014` was reproduced as a visible
  portal menu whose `activity-category-option-run` item and accessible name were absent from the
  Android hierarchy. Current candidate run `acceptance-300517-1793340607118` then completed
  onboarding, semantic `activity-category-option-run` selection, step authoring, and durable plan
  save through native UI. This proves the selector and plan-save stages only; it does not supersede
  any historical API failure.
- That current run stopped later in native scheduling: after the visible Create action, Maestro
  could not find `calendar-screen-ready` and the screenshot remained on Create Event. No HTTP 500
  was evidenced by this run. Scheduling, manual completion, recording, retry, association, web
  reopen, rescheduling, and cancellation remain unverified on this candidate. The active
  `packages/api` operation-receipt / mobile-submission lane remains excluded.
- Rerun `acceptance-4112170-1793332802276` did not reach Maestro: the disposable runner became
  ready, but `emulator-5554` was absent, so its runner-owned force-stop failed before Metro/native
  setup. Its cleanup also reported that same absent-device failure. No newly UI-navigated native
  stage ran, and no emulator, Metro process, or ADB reverse mapping remained afterward.
- Earlier runs established separate navigation defects: `acceptance-4186606-1793334210676` stopped
  because scheduling incorrectly tapped the tab bar after plan save, and
  `acceptance-30151-1793334937267` reached Android's date picker and visible **Create** but received
  HTTP 500 / tRPC `INTERNAL_SERVER_ERROR` from `plannedSessions.create`. Those are historical
  failures; the present composer selector failure prevents a new scheduling request, so it neither
  confirms nor supersedes the prior API failure.

| Disposition | Meaning |
| --- | --- |
| UI | The scenario's claimed action is driven through page controls. |
| UI + named prerequisite | Data is seeded only to isolate a different capability; it must not be read as authoring/scheduling coverage. |
| Fault/security transport | Direct request is the intentionally adversarial or protocol-level behavior under test. |

**Historical execution status (superseded by the fresh full-run result above):** every inventory row is **Audited — not run**, except
`record-calendar.spec.ts` (**2/2 passed**), `planning-variations.spec.ts`
(**3/3 passed**), and the final disposable Node 24/Desktop Chrome authoring
run `acceptance-161420-1793337734233`: `calendar-events` (**3/3**),
`capability-p1-goals` (**1/1**), `capability-p1-routes` (**1/1**), `goals`
(**4/4**), `goals-variations` (**6/6**), `planning` (**3/3**), and
`training-plans` (**5/5**). Earlier correction runs were intentionally
non-final evidence: `acceptance-79734-1793336043778` (**11 passed, 12
failed**) and `acceptance-105828-1793336570998` (**5 passed, 2 failed**);
their concrete selector/state faults were corrected and superseded by the
23/23 final run. Native flows are likewise audited but not newly passed; their
  current candidate passed the composer category-option and plan-save stages in
  `acceptance-300517-1793340607118`, then stopped at the later native scheduling
  `calendar-screen-ready` assertion. The earlier `plannedSessions.create` HTTP 500 /
  `INTERNAL_SERVER_ERROR` remains historical and independently unverified in this UI lane.

## Inventory

Execution cells below describe focused verification of the corrected scenarios,
not a fresh full-suite result. The broad 228-scenario run and its failures remain
separate historical evidence. An older “Audited — not run” cell means no focused
post-correction result is recorded in that cell; it does not mean the scenario
was absent from the historical broad run.

| Spec | Disposition | Execution | Evidence / boundary |
| --- | --- | --- | --- |
| activities.spec.ts | UI | Audited — not run | Import, filters, detail, and deletion use `ActivitiesPage`. |
| activities-variations.spec.ts | UI | Audited — not run | Import helper is the real importer UI wrapper. |
| activity-plans.spec.ts | UI | 2/2 passed (`acceptance-2120808-1793380502193`) | Zero-target authoring, visible RPE edit, reference-based scheduling, and history protection use actual UI. |
| activity-playback.spec.ts | UI | Audited — not run | Imported-activity playback is browser driven. |
| auth.spec.ts | Fault/security transport | Audited — not run | Verification, replay, and reset requests deliberately exercise auth protocol edges. |
| auth-variations.spec.ts | Fault/security transport | Audited — not run | Email-verification variants intentionally consume verification URLs. |
| calendar-events.spec.ts | UI | 3/3 passed (`acceptance-161420-1793337734233`) | Calendar event interactions are browser driven. |
| calendar-planning-variations.spec.ts | UI + named prerequisite | 11/11 passed (`acceptance-1990798`) | Calendar rendering/navigation is the claim; fixture data is setup. |
| capability-p0-auth-recovery.spec.ts | UI | Audited — not run | Recovery experience is exercised in browser. |
| capability-p0-public-share.spec.ts | UI + named prerequisite; Fault/security transport | 5/5 passed (`acceptance-2005037`) | Public activity/training/route artifacts are fixture prerequisites. The route visibility DB flip is a named fail-closed security fault, never authoring coverage. |
| capability-p0-record-lifecycle.spec.ts | UI + named prerequisite | Audited — not run | Recording lifecycle is UI driven; plan data is setup. |
| capability-p0-route-gaps.spec.ts | UI | Audited — not run | Route behavior is browser driven. |
| capability-p1-goals.spec.ts | UI | 1/1 passed (`acceptance-161420-1793337734233`) | Goal journeys use visible controls. |
| capability-p1-notifications.spec.ts | UI + named prerequisite | Audited — not run | Notification data is setup for visible behavior. |
| capability-p1-routes.spec.ts | UI + named prerequisite | 1/1 passed (`acceptance-161420-1793337734233`) | Route/plan fixtures isolate route behavior. |
| capability-p3-onboarding.spec.ts | UI | Audited — not run | Onboarding is browser driven. |
| capability-p3-settings-coaching.spec.ts | UI + named prerequisite; Fault/security transport | Audited — not run | Settings are UI. Coaching uses a named organization/role fixture; the DB role revocation is a named fail-closed authorization fault, not coaching authoring coverage. |
| capability-p3-threshold-overview.spec.ts | UI + named prerequisite | Audited — not run | Threshold/activity evidence is setup for overview behavior. |
| core-acceptance.spec.ts | UI + synthetic identity prerequisite | Separate focused rerun passed 1/1 after the earlier submission failure; not part of the 62-scenario correction batch | Uses the onboarding actor, not the ordinary seeded athlete library. Onboarding, settings timezone, plan creation/scheduling, recording, completion, importer, and replacement use visible UI. No fixture-created plans or activities count as authoring coverage. |
| discovery-notification-variations.spec.ts | UI + named prerequisite | Audited — not run | Discovery/notification data isolates visible flows. |
| feed-discovery.spec.ts | UI + named prerequisite | Audited — not run | Feed records are setup; assertions and interactions are browser based. |
| feed-discovery-variations.spec.ts | UI + named prerequisite | Audited — not run | Same isolation boundary as feed discovery. |
| goals.spec.ts | UI + named prerequisite | 4/4 passed (`acceptance-161420-1793337734233`) | Goal creation and edits use visible controls. The precise metadata case inserts an existing goal only to isolate metadata editing; it never counts as goal authoring. |
| goals-variations.spec.ts | UI | 6/6 passed (`acceptance-2204328-1793382197592`) | Goal variants use visible controls. |
| groups-events.spec.ts | UI + named prerequisite | Audited — not run | Group/event setup supports browser actions and assertions. |
| groups-variations.spec.ts | UI + named prerequisite | Audited — not run | Group fixtures isolate visible variants. |
| integrations.spec.ts | UI + named prerequisite | Audited — not run (credential-dependent paths conditionally skip) | Provider states are setup; user controls are browser driven. |
| integration-variations.spec.ts | UI + named prerequisite | Audited — not run (credential-dependent paths conditionally skip) | Provider-state fixtures isolate visible variants. |
| messaging-notifications.spec.ts | UI + named prerequisite | Audited — not run | Message/notification setup supports UI assertions. |
| messaging-variations.spec.ts | UI + named prerequisite | Audited — not run | Request data is setup; accept/reject occurs through controls. |
| onboarding-social-variations.spec.ts | UI | Audited — not run | Onboarding/social actions use browser controls. |
| onboarding.spec.ts | Fault/security transport | Audited — not run | Email verification transport is explicit protocol setup; onboarding is UI driven. |
| plan-chart-interaction.spec.ts | UI + named prerequisite | Audited — not run | Chart data is setup; chart interaction is browser driven. |
| planning.spec.ts | UI + named prerequisite | 3/3 passed (`acceptance-161420-1793337734233`) | Planning UI is the assertion surface; response inspection is evidence. |
| planning-variations.spec.ts | UI + named prerequisite | 3/3 passed | Agenda and training-plan scheduling use UI. The manual completion/association case names its direct planned-session fixture as an isolated prerequisite, not scheduling coverage. |
| plans-variations.spec.ts | UI + named prerequisite | 14/14 passed (`acceptance-2204328-1793382197592`) | Activity/training-plan actions are browser driven. Profile-unit draft recovery is distinct from the blocked training-preferences capability. |
| profiles-social.spec.ts | UI + named prerequisite | Audited — not run | Social graph data is setup for UI behavior. |
| profiles-social-variations.spec.ts | UI + named prerequisite | Audited — not run | Same isolation boundary as profile/social variants. |
| record-calendar.spec.ts | UI + named prerequisite; Fault/security transport | 2/2 passed | Scheduling and timezone setup use UI. Seeded plan data isolates recording. One explicit concurrent plan mutation is labeled fault injection to prove immutable start evidence, not plan-edit UX. |
| record-cockpit.spec.ts | UI + named prerequisite | Audited — not run | Recording controls are browser driven; plan/device data is setup. |
| recording.spec.ts | UI + named prerequisite | Audited — not run | Recorder UI is exercised; plan data is setup. |
| recording-variations.spec.ts | UI + named prerequisite | Audited — not run | Recorder variants are browser driven. |
| record-live-guidance.spec.ts | UI + named prerequisite | Audited — not run | Live guidance interaction is browser driven. |
| record-public-plan.spec.ts | UI + named prerequisite | Audited — not run | Public plan fixture isolates recording behavior. |
| record-sensor-playback.spec.ts | UI + named prerequisite | Audited — not run | Sensor/playback inputs are controlled prerequisites for browser runtime. |
| record-simulation.spec.ts | UI + named prerequisite | Audited — not run | Simulation fixture isolates recorder behavior. |
| record-street-map.spec.ts | UI + named prerequisite | Audited — not run | Map data/network controls are prerequisites for map UI behavior. |
| routes.spec.ts | UI + named prerequisite | Audited — not run | Route records are setup; route interactions are browser driven. |
| route-variations.spec.ts | UI + named prerequisite | Audited — not run | Route fixtures isolate visible variants. |
| screen-functionality.spec.ts | UI | 4/4 passed (`acceptance-2204328-1793382197592`) | Screen reachability and controls are browser driven. |
| shell-screen-variations.spec.ts | UI | 20/20 passed (`acceptance-2204328-1793382197592`) | Shell navigation variants are browser driven. |
| smoke.spec.ts | UI | Audited — not run | Smoke navigation is browser driven. |
| training-plans.spec.ts | UI + named prerequisite | 5/5 passed (`acceptance-161420-1793337734233`) | Training-plan data is setup; library/schedule UI is the claim. |

## Changes from this audit

1. Kept core acceptance's importer helper after verifying it is a real UI
   wrapper rather than an API shortcut.
2. Replaced `record-calendar`'s profile timezone tRPC initialization with the
   Settings UI, including save confirmation.
3. Kept the live plan update as an explicitly named concurrent-mutation fault
   injection because the test proves recording immutability after start, not
   edit UX.
4. Documented the direct planned-session setup in planning variations as an
   isolated association/completion prerequisite.
5. Reclassified seeded ordinary-actor/primary/21-plan/route/threshold/activity
   evidence as named prerequisites; reclassified the public-route visibility
   flip and coaching-role revocation as explicit security faults. These are
   scenario-level setup/fault boundaries, never seeded authoring results.
6. Replaced deep-link entry to goal, calendar-event, and training-plan authoring
   with their visible library/create controls. Route-contract coverage remains
   separately named where it intentionally navigates to a URL.
