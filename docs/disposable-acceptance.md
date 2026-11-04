# Disposable journey acceptance

The acceptance runner composes the DB package's guarded disposable database and
Storage API helpers. It creates a uniquely named synthetic database on the
repository-managed local PostgreSQL instance, a separate storage container and
storage directory, and a loopback web server on port 3100. It does not reset either
existing Supabase stack or reuse the web server on port 3001.

From `apps/web`, with the documented local toolchain and local Supabase services
available:

```sh
mise exec -- pnpm exec tsx scripts/run-disposable-acceptance.ts
```

The default runs the combined desktop browser journey. Additional Playwright
specifications and project selectors may be supplied explicitly. Only use specs
whose fixtures support this disposable target; provider-account operations are
outside this runner's acceptance scope. Logs live in `.logs/acceptance-*` and
Playwright artifacts in `apps/web/test-results/acceptance-*`. Treat artifacts as
private: traces and Maestro logs can include synthetic credentials and signed URLs.

The runner always starts Vite with `vite.chatbot-acceptance.config.ts`. That
test-only config aliases only the chatbot host model-selection import to the
`@repo/api/test-support/chatbot-acceptance` deterministic local fixture while
retaining the real browser UI, Better Auth session, `/api/chat` HTTP handler,
chatbot host, tools, recovery service, and guarded disposable PostgreSQL target.
The fixture can issue a known approved diary-write tool call and then stall so
the browser journey can prove receipt recovery without a replacement model
generation. It clears OpenAI and TypeSafe credentials for the server and the
fixture refuses to start if either is present. Activation also requires matching
literal-loopback database URLs with the runner-PID-bound disposable database name;
the marker alone is insufficient. Normal `vite` and production
builds do not import that fixture.

Run the maintained chat journeys explicitly on both browser layouts:

```sh
mise exec node@24.19.0 -- pnpm exec tsx scripts/run-disposable-acceptance.ts \
  e2e/specs/chatbot.spec.ts --project='Desktop Chrome' \
  --project='Mobile Chrome 390x844' --reporter=list
```

The diary-write scenario supplies the synthetic actor's required planning
timezone as fixture setup. It does not seed an activity, thread, turn, action,
or receipt: those are created through the Assistant UI and real backend. The
assertions cover completion/restoration, stable viewport fit, cancellation,
status/recovery, same-receipt recovery with exactly one activity, and another
actor's denied thread read. This is deterministic provider-boundary acceptance,
not an evaluation of live model quality, OpenAI network behavior, or native Expo.

Normal completion, failures, SIGINT, and SIGTERM unwind owned resources. SIGKILL
and machine failure cannot run finalizers; inspect exact run-owned resource names
before any manual cleanup. Existing databases must remain untouched.

## Current Android candidate

Use only the designated synthetic test emulator and a current locally built APK.
The native specification uses `emulator-5554` and retains application data. It
requires a separate Metro server on port 8083 and ADB reverse mappings for 8083
and 3100. Never stop or repoint an existing manual Metro server.

Set `EXPO_NO_DOTENV=1`, `EXPO_PUBLIC_MAESTRO_E2E=1`,
`EXPO_PUBLIC_MAESTRO_E2E_API_URL=http://127.0.0.1:3100`, and
`EXPO_PUBLIC_MAESTRO_E2E_SUPABASE_URL=http://127.0.0.1:3100`, and use a private
`METRO_CACHE_DIR`. Disable telemetry for synthetic acceptance. A shared Metro
transform cache previously served a bundle containing the hosted API URL despite
explicit process environment overrides. Verify the actual runtime sentinel before
submitting credentials; the flow asserts that sentinel before sign-in.

```sh
mise exec -- pnpm exec tsx scripts/run-disposable-acceptance.ts \
  e2e/native/current-candidate.spec.ts --project='Desktop Chrome'
```

The native check uses the runner-wired per-run disposable Storage URL. APK build
success, app launch, and a browser journey pass alone still do not prove the
native recording/recovery journey; use the current-candidate specification and
its run record below.

## Native-to-web capability map (2026-10-29)

This map distinguishes source discovery from device-runtime evidence. The
disposable runner remains the only lifecycle owner; the synthetic account is
created by its Playwright fixture, and no activity plans, sessions, or
completions are seeded directly.

| Capability | Source support | Runtime status | Explicit shortcut / limit |
| --- | --- | --- | --- |
| Native authentication and profile onboarding | `profile-onboarding.yaml` and semantic sign-in/onboarding IDs | Proven by the current full run | Synthetic account only. |
| Create an activity plan | `/create-activity-plan` and its composer route | Proven by the current full run | Created through native UI; the resulting v5 run/time-step structure is read back from the disposable DB. |
| Schedule a personal planned session | `calendar-day-select-{date}`, `create-type-planned`, `personal-planned-session-submit` | Proven by the current full run | A minimal week is created through UI, rather than a seeded/template training plan. |
| Planned-session detail and terminal status | `planned-session-detail-screen`, `planned-session-complete-full`, reschedule, and cancel IDs | Proven by the current full run | Cancellation is distinct from skip; durable status/revision is read after each UI action. |
| Native recording and retry | `planned-session-record` plus recorder routes | Proven by the current full run | Uses a real short device duration and runner-wired disposable Storage; no fabricated artifact or write-API substitute. The journey makes **one explicit UI retry** after the offline save failure; that is not merely one transport attempt. It proves in-process offline recovery, not process-restart recovery. |
| Manual-to-recorded association | `planned-session-associate-recorded`, candidate, confirmation, and linked-activity IDs | Proven by the current full run | The native flow follows the semantic linked-detail action to the associated activity's reopened detail; it does not assert an exact screen ID. |
| Web reopen/consistency check | Existing browser pages and disposable Playwright fixture | Proven by the current full run | Web detail, history, calendar, and plan-summary projections each assert the exact recorded ID; the superseded manual ID is absent from history/calendar active links and the completed plan projection. |
| Common Load / RPE | Existing completed-session and activity detail source | Proven unknown, not numeric, in the current full run | No threshold evidence is created; completed-item and day Common Load remain `unavailable`. |

## Verification record — 2026-10-29

- Combined browser journey passed, including onboarding, schedule/reschedule/remove,
  offline save/retry, manual-to-recorded replacement, and reopened view consistency.
- The final broader browser run passed all four selected journeys: combined journey,
  narrow imported-activity history/detail navigation, offline queue recovery across
  reload, and queue recovery across feature navigation.
- Current Android candidate passed profile-only onboarding on `gradientpeak-e2e`
  (`emulator-5554`), with runtime loopback routing asserted before credentials and
  persisted-profile/no-invented-activity assertions afterward.
- Actual SIGTERM during Playwright and SIGINT during Storage startup each produced
  a failing run exit and removed the exact owned database, storage container,
  storage directory, and port-3100 server.
- Web/DB typechecks, 21 routing/foundation tests, two onboarding tests, two Storage
  proxy tests, the DB package test suite, scoped Biome checks, and diff whitespace
  checks passed. Independent read-only review findings were addressed.
- `pnpm quality:agent` stopped at an existing import-order error in
  `packages/core/index.ts`. Later integration-gate stages were not established by
  that run. Full native scheduling, recording/retry, replacement, and summary
  consistency are not established by the profile-only native test.

### Native runtime follow-up

- `acceptance-2895543-1793307911549` passed the Android onboarding candidate on
  the restarted `gradientpeak-e2e` emulator. It proves the runner's fresh
  loopback Metro routing and the dynamic Storage endpoint sentinel before
  credential submission, then proves persisted profile completion. The device
  flow did **not** create a plan, schedule a session, record, retry, replace a
  manual completion, or reopen the result on web; those capabilities remain
  unproven and must not be inferred from this run.
- The first native runner attempt exposed that Expo's `--localhost` listener
  bound only IPv6 while the runner and ADB reverse use `127.0.0.1`. The runner
  now starts Metro with IPv4-first DNS ordering. A second attempt exposed the
  fixed-port sentinel against a per-run Storage port; the flow now receives the
  exact per-run sentinel from the runner. The subsequent candidate run passed.

### Native core-journey attempt

- A follow-up candidate invokes profile onboarding and a separate native
  activity-plan composer flow in the **same synthetic account and disposable
  backend lifetime**. The plan flow navigates through the app scheme, enters a
  generated plan name through the composer, creates a one-minute step, and saves
  the executable plan. It does not seed a plan or call a write API.
- Diagnosis of the initial `step-editor-modal` failure found a delayed
  `usePostHog was called without a PostHog client` development toast covering the
  fixed composer toolbar. The runner had disabled telemetry by omitting the
  client entirely while Plan-tab analytics hooks still mounted. It now supplies
  a disabled local PostHog client, preserving no-telemetry behavior without the
  blocking missing-provider toast. The composer action itself was not defective.
- Runtime `acceptance-2981920-1793309647131` passed onboarding and all native
  plan-authoring steps, including the step editor and durable plan save. The
  native DB assertion observed the generated plan owned by the synthetic actor.
  A following native schedule stage is implemented and consumes that read-only
  observed plan ID, but has not yet been executed. Terminal session status,
  recording/retry, replacement, and web reopen remain unproven.

### Native full-journey verification

Final closeout: `pnpm quality:agent` passed on Node 24.19.0 after the review
corrections, including its selected static, database, and browser checks.
Non-blocking lint and router code-splitting warnings remain. Full gate output is
retained privately in shell record `sh_18a716ce6001HjVlXXs8HY8B5q`.
The task-owned `gradientpeak-e2e` emulator was stopped after verification; no
task-owned Metro/acceptance process or ADB reverse mapping remained before stop.
No app data, preserved database, or preview installation was cleared.

- `acceptance-3594613-1793322494271` passed the single Desktop Chrome
  `e2e/native/current-candidate.spec.ts` journey in 5.6 minutes. It used the
  designated `emulator-5554`, fresh disposable DB/Storage lifecycle, and the
  real native UI for onboarding, executable plan creation, scheduling, manual
  completion, timer-backed recording, offline retained-artifact save, **one explicit UI retry**,
  association, cross-month reschedule, and cancellation. That retry proves in-process offline
  recovery, not process-restart recovery. The reschedule fixture
  starts on next month's first day and semantically selects Android's previous
  month before its final-day selection.
- The test reads the UI-created plan back as a v5 `run` plan with a 60-second
  time step, then reads each durable session/activity transition. Association
  follows the semantic native linked-detail action and asserts the reopened activity
   detail summary; it does not assert the recorded identity from native screen content.
   Browser detail opens the recorded activity URL and verifies its heading; history,
   calendar, and plan-summary projections assert the exact recorded activity;
  the superseded manual activity is absent from history/calendar active links and
  the completed plan projection.
- This no-threshold athlete intentionally establishes only unknown Common Load:
  no threshold evidence exists, and the completed item/day projection is
  `load: null`, `loadStatus: "unavailable"`. It does not establish any numeric
  Common Load threshold or provider-sync behavior.
- Candidate identity captured before this run: HEAD
  `2a0f32794c78c606c2f2c24d1ea29c3b8b400911`; task-source manifest
  `/home/deancochran/.local/share/opencode/current-candidate-20261030T010813Z.manifest`;
  debug APK SHA-256
  `551bdd98a20ea690b80041d50363b875e640443105778d320689685716ff1233`.
  The manifest records the dirty-candidate and task-source hashes; the APK is
  the development client shell while Metro serves this run's JavaScript.
- Re-run after the planned-session error and runner-cleanup corrections:
  `acceptance-3646355-1793323603575` passed the same single Desktop Chrome
  `e2e/native/current-candidate.spec.ts` journey in 5.6 minutes. Private stdout:
  `/home/deancochran/.local/share/opencode/acceptance-current-candidate-20261030T012643Z.stdout.log`.
  Source manifest captured before that run:
  `/home/deancochran/.local/share/opencode/current-candidate-20261030T012635Z.manifest`.

Private run evidence: `.logs/acceptance-20261029/`; final browser run
`acceptance-2769204-1793305317157`; native run
`acceptance-2750030-1793304992156`. Changes remain local and uncommitted.

### Evidence-specificity audit — 2026-10-30

- The browser journey now selects `UTC` through the Settings **Planning
  Timezone** picker and submits **Update Profile**, then reads the persisted
  value before it creates three executable 10-minute RPE-3 run plans through
  the web composer. It no longer initializes the timezone or creates plans
  through tRPC/fixture write capability. The audit exposed and repaired the
  form-transport blocker: the shared timezone picker did not contribute its
  React Hook Form value to browser `FormData`, so Settings showed success while
  leaving `planning_timezone` null.
- Browser attempts `acceptance-3979334-1793330596634` and
  `acceptance-3985135-1793330698744` reached the real UI-created plans and the
  offline retained-artifact retry, but both stopped when that pre-existing
  retry remained `failed retryable (internal)` rather than exposing **Open saved
  activity**. This audit therefore does not establish the full browser
  journey. Private artifacts are under the corresponding `.logs/` directories.
- Native attempt `acceptance-3993385-1793330834228` used a newly started,
  retained-data `gradientpeak-e2e` emulator and the updated candidate manifest
  `/home/deancochran/.local/share/opencode/current-candidate-20261030T032656.manifest`.
  Its debug APK SHA-256 was
  `551bdd98a20ea690b80041d50363b875e640443105778d320689685716ff1233`.
  Onboarding, executable-plan creation, and scheduling completed, but the
  native manual-completion flow could not find `planned-session-linked-activity`
  after its completion action. Recording/retry, association, reopen, and
  projection evidence are consequently unverified for this candidate.
- The retained-recording flow is named **one explicit UI retry** and the browser
  interception asserts one failed initial operation before it waits for the
  successful retry response. That wording does not infer a transport-attempt
  count. Process-restart recovery remains a distinct, unverified scenario; this
  bounded audit did not add or exercise it.
