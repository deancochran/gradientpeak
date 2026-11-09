# Web recording, playback, and simulation modernization

## Active completion gate

The accepted objective is a cohesive mobile-comparable web companion across
recording, execution, playback, and isolated simulation. Completion is unproven
until all requirements have passing evidence or a user-approved exception.

| Criterion | Current evidence / outstanding work | Status |
| --- | --- | --- |
| Single-screen record → review → save | Integrated desktop Chrome and narrow Firefox journeys pass, including public plans and accepted sensor artifacts. | Passed scoped software journeys |
| Visual recording workspace | Cockpit, measured-now strip, target guidance, intervals, opt-in geographic maps and elevation; screenshots inspected. User visual acceptance outstanding. | Partial: user acceptance |
| Live plan/route changes | Versioned timeline and durable recovery, category guard, supported intensity scale, API authorization; integrated journeys pass. | Passed scoped software journeys |
| Durable measured evidence | Interval-weighted accepted analytics, NP/efforts, source binding and no-GPS save/playback verified. Physical hardware not exercised. | Partial: hardware and capability limits |
| Persisted playback | Imported GPS and accepted no-GPS sensor activity journeys pass with gap/seek/reload and no-write assertions. | Passed scoped software journeys |
| Isolated simulation | Discoverable from ready recorder; full route/plan browser journey checks progression and no activity/calendar writes. Additional parity review remains. | Partial: final parity review |
| Shared integration | Canonical artifact-bound analytics and effort persistence verified. Scheduled calendar-to-save journeys verify frozen prescriptions, full/partial outcomes, repeat-save protection, and the completed activity link. | Passed scoped software journeys |
| Browser limits/accessibility | Keyboard/narrow journeys and map opt-in/referrer/error/retry/revoke checks pass. Full browser/device matrix and user visual acceptance remain. | Partial |

Hardware verification and visual acceptance are separate evidence gates, not
inferred from mocks, screenshots, or passing builds. No schema changes, deployment,
or account configuration are authorized by this implementation checklist.

### Latest integrated evidence

- 42 browser journeys passed with zero retries in desktop Chrome and narrow
  Firefox: recording, live changes, recovery/takeover, offline retries, public
  plans, cockpit, street-map privacy/failure recovery, accepted sensor analytics,
  persisted playback, and isolated simulation.
- Four additional scheduled-calendar journeys passed in both browsers. They
  exposed and regressed a navigation bug: a linked completed activity previously
  inherited the planned item's `/record` link. The shared calendar projection now
  supplies the accepted activity's navigation target instead.
- The accepted sensor fixture uses the real journal/artifact/upload/save path,
  then verifies activity averages/maxima, segment timing/NP, canonical effort
  source identity and offset bounds, and playback after reload. It is explicitly
  emulated test evidence, not physical BLE proof.
- Street tests intercept all OSM tile traffic with valid local PNGs; they prove
  renderer behavior and privacy, not public tile-service availability. No live
  community tile server was exercised by browser automation.
- Core/API/web typechecks and the final web production build passed. Targeted
  recording/interval/API tests and scoped Biome checks passed. Deep review found
  no remaining blocker in accepted analytics after linear interval clipping and
  accepted-artifact source binding fixes.
- `pnpm quality:agent` was attempted and failed at the checkout-wide formatting/
  lint phase, including existing external mobile authoring/form files. That work
  was not overwritten. The entire repository gate is therefore **not passed**.

### Explicit capability limits still requiring acceptance or further work

- Web currently manages one Bluetooth device connection, not mobile-style
  simultaneous multi-device sensor routing.
- Accepted no-GPS recording does not infer measured distance/movement from manual
  totals. Grade-dependent normalized metrics remain unavailable in its clipped
  interval adapter; raw artifact altitude is preserved, never interpolated into
  fabricated observations. Imported location-bearing activities retain their
  existing analysis path.
- Hardware checks remain: permission decline; HR/power/cadence/speed sample and
  unit verification; trainer-control authorization; pause/reconnect/counter reset;
  stale/disconnected display; recovery; and no trainer commands after finishing.
- User acceptance requires reviewing the actual desktop/narrow interfaces, not
  treating screenshot generation or passing tests as approval.

## Outcome and boundaries

Web is a functional companion to mobile, not a static approximation. Share domain
rules, contracts, and deterministic calculations while keeping browser transport,
storage, and presentation platform-specific. Mobile is a reference, not an oracle.

This work is local implementation only. Database migrations, deployments, releases,
and changes to external accounts require separate authorization. Existing unrelated
form/UI work in the checkout is outside this change's ownership.

## Behavior contract

- Real recording records measured evidence; missing values stay unavailable.
- Playback reads accepted persisted activity artifacts and preserves their timing.
- Simulation uses explicit synthetic inputs and cannot finalize, enqueue, or submit
  a real activity or change training/calendar history.
- Plan compilation and occurrence identity use the shared Core compiler.
- Scheduled recordings preserve the frozen prescription, revision, and provenance.
- Partial/skipped execution is not full completion when terminal evidence exists.
- Recorded elapsed/active time is conserved across partial steps, pauses, revisits,
  and post-plan continuation. Instantaneous skips do not invent duration.
- Review edits survive background queue updates. Failed configuration does not
  navigate as success. Retry/recovery cannot silently replace user work.
- Browser capability limits are visible. Background suspension pauses recording;
  unsupported sensor/control capabilities are not advertised as working.
- Imported historical GPS playback and newly recorded route position are separate
  policies: current recording acceptance explicitly excludes GPS coordinates.

## Implementation sequence and evidence

1. **Recording integrity — implemented locally.** Review preservation, transition
   result propagation, final-step Previous, finished-artifact navigation, planned
   naming, redirect context, frozen provenance, manifest time accounting, partial
   calendar outcome, and zero-duration skip handling have targeted regressions.
2. **Durable measured samples — pending.** Reuse Core sample/source contracts and
   Bluetooth parsers. Capture actual notifications, not repeated UI snapshots.
   Persist samples with lifecycle boundaries and restore after interruption. Use
   existing accepted artifact storage where possible; verify TCX/FIT round trips.
   Current TCX parser also needs explicit speed-extension support.
3. **Persisted playback — pending.** Use `activityFiles.getStreams` and original
   timestamps, with synchronized metrics/route position, seek/pause/speed controls,
   and explicit missing-data/gap handling. No reusable playback engine was found.
4. **Plan/route simulation — pending.** Shared deterministic virtual clock and
   route distance index; bounded progress, missing elevation as unknown, no fake
   measured samples. Simulation stays separate from the recording save pipeline.
5. **Integration verification — pending.** Browser journeys, recovery/failure
   injection, accessibility, calendar/history linkage, physical-device limits,
   and independent review. Passing mocked tests is not physical BLE or E2E proof.

## Compatibility and known limitations

Legacy mobile occurrence records did not distinguish skipped, completed, and early
finish. Their historical intent cannot be reconstructed. Wholly unclassified legacy
mobile-shaped submissions retain their previous calendar full-completion behavior
for compatibility, not as evidence of actual completion. New mobile producers emit
completed/skipped evidence or explicit `completion: null` for unfinished work;
mixed evidence is classified conservatively. Web timer submissions do not use the
legacy fallback. Historical outcomes are not backfilled.

The API/Core consumer must be deployed before a mobile producer using explicit
null completion, because an older API rejects that new value. No deployment has
been performed. Existing 256-segment submission bounds remain.

Real sensor samples can be retained in existing accepted artifacts without a new
database schema, but submission currently leaves several sensor-summary/analysis
fields empty. Stream readability alone will not establish analytics correctness.

## Verification checkpoint

Supported runtime: `mise exec node@24.19.0 -- ...` from the dev checkout.

The integrity slice has passing targeted native Jest (56), mobile Vitest (68), Core
Vitest (83), API Vitest (88), and web Vitest (100) tests. Mobile/Core/API/web
typechecks, scoped Biome, architecture (zero new violations), and diff whitespace
checks passed. The coordinator independently reran the 100 web tests after the
cross-platform compatibility changes. Regression failures were observed before
fixes. Independent review identified and drove fixes for partial completion,
instantaneous skips, and mobile compatibility.

No browser E2E, live-database, physical-device, or production verification has yet
been completed for this modernization. The overall objective remains incomplete.

## Subsequent recording/playback and picker checkpoint

The prior checkpoint above describes the initial integrity slice only. Since then:

- Measured Bluetooth notifications are captured in a bounded journal, flushed in
  append batches with an atomic committed cursor, and included in TCX. Recovery
  promises the committed prefix, not the unacknowledged tail. The current journal
  cap is 20,000 notifications. Isolated storage protects new drafts from old tabs.
- Legacy artifacts with submission jobs stay archive-only and cannot be copied as
  unqueued new submissions. Prior journal epochs have recovery tests.
- Persisted activity playback is integrated with play/pause, seek, speed, gaps,
  and recorded GPS markers. A real accepted-file journey passed desktop and narrow
  Chromium. No synthetic interpolation is presented as measured evidence.
- Real IndexedDB checks proved bounded writes, committed-prefix recovery, and
  old-reader isolation, including a 20,000-notification collection/reload.

The user then reported that all library plans were disabled before recording.
Root cause: `canRecord` was incorrectly tied to ownership, disabling readable
public/system plans. The shared projection/DTO now permits read-authorized
executable plans, provides a derived execution hash, and submission checks read
access rather than requiring ownership. Private access and owner-only metadata
remain protected. A stale public test fixture was corrected to satisfy the real
authoring contract rather than weakening database validation.

Browser verification also exposed an aggregate timing constraint violation:
partial aggregate coverage cannot carry numeric active time with unknown movement.
Submission again uses the existing aggregate timing contract; known active time
remains conserved in per-segment summaries. No database schema change was needed.

Latest picker verification: 141 API tests, 16 web picker/launcher tests, and 14
Core contract tests passed; API/Core/web typechecks passed. The coordinator reran
the 141 API and 16 web tests. Real desktop and narrow Chromium each passed all ten
recording variations and the nonowner public-plan select/start/save/history
journey: 22 passed, zero failed/skipped. Actor-owned fixtures were cleaned up;
no migrations or production mutations were performed.

Simulation implementation was interrupted for this blocker and is not yet accepted
or verified complete. Remaining work includes simulator integration/review,
sensor-summary analytics, physical-device evidence, and final broad verification.

## Unified recorder and live changes

The recorder is now the entry surface: `/record` preserves search context while
redirecting directly to `/record/session`. There is no required launch/setup page
or Open recorder step. Start/pause/finish controls precede optional inline plan,
route, and device controls. Finish enters the review/submission state.

Plan and route attach/detach/replacement work in recording and paused states. A
shared versioned guidance timeline records effective offsets, closed execution
epochs, and original prescriptions without replacing the immutable session
snapshot or deleting samples/laps. Draft recovery and accepted TCX retain this
timeline. The original plan (otherwise the first attached plan) and first route
are primary saved associations; later attachments remain in the timeline.

Category is editable before Start and follows a selected plan. Once recording
starts, category is fixed and incompatible plans are rejected. Intensity scaling
currently supports relative cycling-power guidance (50–150%) with an explicit
Apply action; other target types remain authored values. Scaling is not a measured
performance value and does not implicitly command a trainer. Plan/intensity
changes conservatively make scheduled completion partial; route-only changes do
not. Terminal/fenced recordings cannot issue trainer-control commands.

Review corrections enforce primary route/plan association, initial timeline start,
closed-epoch bounds, and authorization for every referenced plan/route. API
comparison normalizes validated metadata to JSON because TCX omits optional
undefined fields retained by SuperJSON. That transport mismatch was reproduced
in the real live-change/save journey and has a targeted regression.

Verification includes free Start, live plan attach/replace/detach, intensity and
route changes, paused reload/recovery, TCX timeline inspection, actual Save, and
database-backed history associations on desktop and narrow Chromium. Existing
offline retry, repeated pause/resume, keyboard control, and cross-tab takeover
journeys are retained. Physical-device compatibility and broader modernization
remain unverified; this change does not claim unsupported browser background/GPS
capabilities or individual step-duration editing.

Final unified-recorder checkpoint: 189 web recording/route tests, 116 Core
recording/schema tests, and 153 API tests passed; web/Core/API typechecks passed.
All 30 selected desktop/narrow Chromium recording journeys passed with zero
retries, including the new live-change/save journey, offline retries, cross-tab
takeover, and keyboard control. Scoped formatter/lint and diff whitespace checks
passed. The repository architecture gate is not clean: its UI generated-artifact
check reports the already externally modified
`packages/ui/src/testing/selectors.generated.json` as stale. That unrelated file
was not regenerated or overwritten. The isolated web test server was stopped;
local database/storage services were left running. No migration or deployment
was performed.

## Visual recording cockpit correction

The single-screen route alone did not satisfy the recording-interface outcome.
It now presents an app-owned cockpit composition rather than a setup-first stack:
large elapsed timer, current target/step and remaining time, next-step preview,
Previous/Next/Skip, one main Start/Pause/Resume/Lap/Finish control group, and the
shared interval chart with visible selection. Chart inspection does not change
the executing step. Plan/route and device setup are secondary disclosures.

The route panel loads actual route geometry and elevation with an explicitly
labeled metadata-polyline fallback. This is a route-reference visualization, not
a tiled street map or a claim of measured GPS position. Ready and active layouts
were screenshot-reviewed at desktop and 390px width using an actual uploaded GPX
and a three-interval workout. Narrow overflow, ready target labels, duplicate
discard confirmation, and finalization-control availability were corrected.

Latest evidence: 193 scoped web tests passed, web typecheck and scoped Biome
passed, and all 34 selected desktop/mobile Chromium recording browser journeys
passed without retries. The full-route and fallback cockpit tests also passed
on narrow Firefox. Screenshots are under `/tmp/opencode/record-cockpit-*`.
The main dev server on port 3000 was left running; only the isolated test server
was stopped. Broader simulator/analytics work and physical-device verification
remain outside this visual-completion claim.
