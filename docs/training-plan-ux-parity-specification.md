# GradientPeak training-plan builder: initial-release specification

> Activity-plan supersession (2026-09-30): use the [fixed V4 activity-plan specification](activity-plan-simplification-specification.md) for candidate prescriptions. Authored adaptation controls and parameter enumeration described below are retired; training-plan selection uses fixed plans without silently scaling their quantities. Completed multisport summaries remain in scope and unchanged.

Status: proposed requirements, not implemented-feature claims. Updated 2026-09-14.

### Binding authoring correction — 2026-09-17

One create/edit editor and one viewing detail surface per platform. Reuse web `TrainingPlanEditor` and mobile `TrainingPlanBuilderScreen` through the existing URLs. Detail offers Edit plan and linked activity read navigation, never direct session assignment/removal or visibility commits. Visibility (`private`, `followers`, `public`) is an editor field included in hydration, unsaved-change protection, and explicit Save. Cancel discards current unsaved edits only after the standard guard. Like/share/copy/apply/remove-schedule/delete remain separate supported actions.

Temporary open-editor input is not a persisted-draft product. All earlier durableDraft/draft-table or service proposals and durable-draft/autosave/resume phase requirements are explicitly superseded. No saved-draft UI or new persistence is required or permitted by this correction. Keep invalid input and failed-save/frozen-request state; retain durable recording recovery. Technical internal `draft` payloads and revision/source contracts remain valid; ordinary UI uses plan/changes and omits revision badges. See [form experience contract](form-experience-contract.md).

## 1. Objective and scope

**Simplify GradientPeak into a consistent web and mobile training planner and diary: enable quick workout scheduling, reusable plan creation and editing, manual completion, and clear planned-versus-actual summaries without requiring recordings, physiological data, or advanced predictions. Preserve authorization, data provenance, duplicate prevention, and completed history while making plan updates explicit and deferring advanced coaching, optimization, and platform expansion.**

Scope clarification (2026-09-14): quick scheduling uses an explicitly selected catalog workout, not generated free-form prescriptions. Users need not author their own reusable activity first. Existing frozen catalog-prescription authority remains unchanged. Activities-based manual completion and local schema changes are now approved in the [storage proposal](manual-training-diary-schema-proposal.md); migration application still requires separate permission. Completion controls belong directly in existing planned-session detail screens, using existing shared UI, not single-use modal/components. User-facing copy uses "activity" and "Mark complete", not "diary".

The six builder features below remain in scope. Two diary requirements extend them without adding forecasting or recording prerequisites:

- **D1 Manual log/completion:** full or partial training can be entered without a file or recording; actual duration/distance/effort/notes are optional. Skipped records no performed activity. Never copy planned values into actual observations.
- **D2 Planned versus actual:** show original planned values alongside actual known values and their source; unknown actuals are not zero. A later recording/import must not silently double-count a manually reported session. Completion correction must not delete recorded history.

D1-D2 acceptance requires manual-entry retry, unknown-metric totals, full/partial/skipped distinction, explicit later-import reconciliation, and correction authorization tests on web and mobile. These are not yet implemented or verified. Their minimum persistence change is an approval gate, not a request to introduce a second calendar or an offline/undo platform.

TrainingPeaks is a reference for familiar planning workflows, not a requirement to reproduce its entire coaching platform. This condensed specification replaces the previous extended parity roadmap. Deferred features below are not implementation requirements or launch dependencies. Initial-release completion must not be described as full TrainingPeaks parity.

No AI, wearable history, new physiological score, performance prediction, or advanced periodization engine is required. Reuse current templates, activity plans, calculations, and resolver behavior.

This document defines UX scope and defers domain authority to the [integrated planning specification](integrated-training-activity-planning-specification.md). Do not introduce parallel workout schemas, executable event recurrence, profile-level planning preferences, or an alternative prescription engine.

Technical companion: [current-code audit and implementation outline](training-plan-builder-implementation-audit.md). It maps F1-F6/T1-T9 to existing contracts, concrete gaps, affected files, and verification. It adds technical detail, not product scope.

## 2. The six core features

| ID | Feature | Required initial-release behavior |
| --- | --- | --- |
| F1 | Create a plan | Start blank, copy an owned/authorized plan, or customize a template. All paths use the same editor. |
| F2 | Find and reuse plans | Simple library with search, mine/templates filters, detail, edit-own, and copy. Respect current visibility and access rules. |
| F3 | Build by week | Add activities to days; edit supported session demands; move, duplicate, remove, and copy one week. Multiple sports and sessions/day are supported. |
| F4 | Review and apply | Show the schedule and weekly summaries; choose a start date; preview and confirm application to the calendar. |
| F5 | Maintain future training | Move, shorten within supported bounds, or cancel eligible future sessions; explicitly apply a revised plan without affecting unrelated work. |
| F6 | Use either app | The same core tasks work on web and mobile. Saved plans are available across devices; unsaved editor input is protected as described below. |

### F1-F2: simple creation and library

- Collect name and optional description. Use existing supported goal association and plan preferences where available; neither a performance target nor physiological history is required.
- A template is a starting point, not something the user modifies for everyone. Customizing a read-only template creates an owned copy. Copy goals/preferences/session demands, not personal activity history or another athlete's resolved prescriptions.
- Show plan name, sports, session count, and known duration information. Label unknown durations rather than estimating them silently.
- Reuse existing list/detail/copy endpoints. Search must preserve authorization and pagination; do not fetch the whole catalog into either client. No new folder/tag system or sharing workflow is required.

### F3: weekly editor

- Web: week/day view with session cards. Mobile: week selector, day list, and session editor sheet. Matching functionality matters more than identical layouts.
- Add from the existing activity library. Reuse the current activity composer when creating a missing activity, then return to the preserved plan draft. Do not build a second structured-workout editor.
- Edit only supported session fields and authored adaptation controls. Fixed activities remain fixed. A materially different workout protocol uses a separate activity plan.
- Provide destination pickers/action menus for move and duplicate; dragging is optional. Keep multiple sessions on a day in a stable order.
- **Copy week** copies the selected seven-day block to a chosen destination week with fresh session IDs and preserved relative days/order. It adds alongside existing sessions after showing the resulting count; it never overwrites them. Reject out-of-span or over-limit copies before changing the draft. Extending plan span requires an explicit supported action, not silent truncation.
- Reuse canonical plan span and command limits. Any missing span semantics must be resolved in Core before exposing copy/extension; do not add a client-only duration model. No generalized recurrence wizard or arbitrary bulk-range command system is required.
- Weekly summary: session count, known planned time, count of sessions with unknown duration, and simple per-sport totals. Existing load estimates may be shown secondarily with their current meaning; no new load model is part of this release.

### F4: save, preview, and apply

- Editing a draft does not schedule sessions. Saving a ready plan validates the canonical definition. Applying is a separate confirmed action.
- Initial release uses **start-date anchoring only**. Show the resulting dates before commit and use calendar-day arithmetic in the athlete's planning timezone, including DST boundaries.
- Preview uses the existing server resolver and shows session count, date range, warnings, and any unavailable prescriptions. `no_context` uses supported authored/system defaults; genuinely unresolved required targets block apply with an actionable explanation.
- A new application is additive. Existing workouts are visible in the preview; multiple sessions on the same day are allowed. Never replace existing calendar work merely because it shares a date.
- Commit requires the preview fingerprint and relevant expected revisions. Safe retries must return the same durable result rather than insert duplicate sessions.

### F5: maintain an applied plan safely

- Use the existing planned-session lifecycle as the authority. Moving preserves a frozen workout prescription; changing dose/activity requires resolution and an explicitly accepted replacement.
- Saving a reusable plan revision does not update the calendar. Offer a separate "Update scheduled plan" preview that identifies changes to eligible future sessions from that application only.
- For this initial plan-maintenance flow, eligible sessions are on a later civil day than today, still scheduled, not started/completed, and unchanged since preview. Today/past work is excluded. Existing recording/start capabilities remain separate and must not be weakened.
- Show affected and protected sessions before confirmation. Recheck eligibility, source access, and revisions at commit; conflicts require refreshed review without partial replacement of the confirmed batch.
- "Remove scheduled plan" cancels only the selected application's eligible future sessions. Completed/in-progress activities, unrelated plans, and standalone workouts remain untouched.
- Reuse existing lineage/revision/idempotency infrastructure. If it cannot scope an update reliably, block the operation until that boundary is fixed rather than implementing broad delete-by-date behavior.
- Keep existing provider delivery behavior and truthful pending/failure states. Calendar confirmation must not claim device delivery completed. No new device/format integration is required.

### F6: unsaved-input protection and platform parity

- Preserve unsaved edits during navigation to the activity picker/composer. Warn before discarding work. Keep the draft after validation, network, or stale-revision errors.
- Provide explicit Save and Cancel (mobile header back is guarded Cancel). Cancel discards current unsaved edits, restoring the initial/last-saved state or leaving the editor; no durable draft, command-history, or undo platform is required.
- Require online save/apply. Display unsaved/saving/saved/error states truthfully. Do not claim offline operation or automatic cross-device synchronization of unsaved drafts.
- Saved plans reload consistently across devices. Concurrent saves use expected revisions; a conflict preserves the user's unsaved work and offers reload or an authorized independent copy rather than silent last-write-wins.
- Every core action works without dragging: web keyboard/menu access and mobile labeled action sheets. Show readable errors and restore focus after dialogs.

## 3. Non-negotiable safeguards

1. Existing scheduled prescriptions remain frozen until an explicit permitted update; source edits never silently propagate.
2. Completed/in-progress history is never deleted or rewritten by plan editing, copying, updating, or removal.
3. Permissions are enforced on the server for list/read/copy/save/preview/commit. A copied reference cannot reveal a private activity. Revoked source access blocks new resolution rather than silently substituting workouts.
4. Preview and commit share one resolver. Clients own presentation, not competing prescription calculations.
5. Missing data is not zero. Unsupported targets, estimated values, and partial totals are visible.
6. Retry and cross-device conflict checks are launch requirements, not advanced features.

Any necessary database/schema changes require a separate proposal and approval. This specification authorizes no migration, deployment, or external account action.

## 4. Reuse the current app

The earlier source audit found partial implementations, not verified end-to-end completion. Recheck current code before implementation.

| Area | Existing location | Work to focus on |
| --- | --- | --- |
| Web plans | `apps/web/src/routes/_protected/training-plans/`; `components/training-plan/` | Replace the minimal day-offset list with the weekly editor; align existing actions with mobile |
| Mobile plans | `apps/mobile/components/training-plan/create/`; `apps/mobile/lib/training-plan-creation/` | Reuse existing builder and session sheets; add copy-week and consistent save/apply review |
| Activity authoring | Existing web/mobile activity-plan composers | Preserve plan draft while selecting/creating an activity; no duplicate composer |
| Shared logic | `packages/core/plan/`, `packages/core/activity-plan/` | Canonical copy/move/date transforms, validation and existing bounded adaptation |
| API | `routers/planning/training-plans/base.ts`; `application/training-plan/projection-planning.ts`, `applyTemplateUseCase.ts`, `appliedScheduleUseCases.ts` | Reuse preview/save/copy/apply/remove; enforce application scope and retry/revision checks |
| Persistence/UI | Existing API repositories, `packages/db`, `packages/ui` | Add only necessary approved persistence support; reuse accessible primitives |

## 5. Delivery and acceptance

### Step 1: build and reuse

Deliver F1-F3 and draft protection: three creation paths, simple library, weekly editing, copy week, and clear summaries on both apps.

### Step 2: apply and maintain

Deliver F4-F5 with server-authoritative previews, scoped updates/removal, protected history, and retry/concurrency handling. Existing no-context resolver and lifecycle contracts are prerequisites; do not bypass them to show a working UI.

### Step 3: prove equivalent behavior

Run these journeys on web, iOS, and Android using equivalent fixtures. Compare canonical results, not screenshot similarity.

| Test | Pass condition |
| --- | --- |
| T1 Create | Blank/template/copy produce an editable owned plan; source and completed history remain unchanged |
| T2 Edit | Add/move/duplicate/remove/copy-week preserve intended dates, ordering and fresh-copy identities; invalid bounds fail without data loss |
| T3 Return | Activity selection/create/cancel returns to the intact draft; failed save retains edits |
| T4 Summaries | Multisport and multiple sessions/day display correctly; unknown durations are not counted as zero |
| T5 Apply | No-history athlete can apply supported defaults; timezone/DST dates match preview; unsupported prescriptions explain the blocker |
| T6 Maintain | Update/remove touches only eligible future sessions from the selected application; unrelated, today, completed and in-progress work stays unchanged |
| T7 Retry/conflict | Lost acknowledgement/retry creates no duplicates; concurrent save/update cannot overwrite silently or partially mutate a confirmed batch |
| T8 Access | Unauthorized or revoked source access blocks read/write/copy as appropriate; private references do not leak |
| T9 Cross-platform | All six core features work with web keyboard/menu and mobile non-drag controls; saved plans reload consistently across devices |

Run focused Core/API tests, app typechecks, and browser/native journeys. Product integration also requires `pnpm quality:agent` and relevant approved DB/provider verification where touched. Record actual failures/skips; source inspection alone is not acceptance evidence.

Usability targets to validate, not current claims: template-based plan creation under five minutes; copy one week under fifteen seconds; no lost edits during ordinary picker navigation or failed save. No new analytics platform is required to measure these in usability tests.

## 6. Explicitly excluded from initial releases

Do not add implementation tickets or supporting infrastructure for these under this specification:

- Coach/group assignment, collaboration permissions/invitations, dual calendars, and automatic/shared-plan update distribution.
- Annual/season planning, manual phase editors, dated availability exceptions, optimizer controls, or advanced goal forecasting.
- New common-load normalization, tissue-fatigue/recovery estimates, injury prediction, AI generation, or scientific model replacement.
- Durable undo receipts, revision-history restoration UI, offline outboxes, automatic draft sync, or background autosave infrastructure.
- Folders/tags, marketplace features, new sharing systems, and new export/device formats.
- End-date anchoring, arbitrary bulk-range editing, generalized recurring workouts, or repeat-rule engines. Copy week is the bounded initial alternative.

Existing supported functionality in these areas need not be removed. It is simply not expanded or made a dependency of this release. Reconsider a deferred feature only after a concrete user need and a separate scoped specification.

## 7. TrainingPeaks references

Official documentation reviewed 2026-09-14 supports the workflow choices, not a claim that all TrainingPeaks capabilities exist on mobile. Its reusable plan creation is documented for coaches; GradientPeak's target is self-service on both surfaces.

- [Create a reusable plan](https://help.trainingpeaks.com/hc/en-us/articles/204072514-How-to-create-a-new-Training-Plan-Coaches-only): calendar-based assembly and workout reuse.
- [Apply/unapply a plan](https://help.trainingpeaks.com/hc/en-us/articles/204071974-How-do-I-apply-unapply-my-TrainingPeaks-Training-Plan): athlete calendar workflow on web/iOS/Android.
- [Move/copy workouts](https://help.trainingpeaks.com/hc/en-us/articles/204072164-How-do-I-move-a-workout): familiar schedule maintenance.
- [Structured workout builder](https://help.trainingpeaks.com/hc/en-us/articles/235164967-Structured-Workout-Builder): reusable structured activities; reuse GradientPeak's existing composer rather than copying the full feature set now.
- [Edit/update a plan](https://help.trainingpeaks.com/hc/en-us/articles/204715504-How-to-Edit-or-Update-a-Training-Plan): copying and revisions. GradientPeak intentionally requires explicit updates to already scheduled work.

**Initial-release completion means F1-F6 pass T1-T9 on both product surfaces. It does not mean full TrainingPeaks parity or guaranteed athletic outcomes.**
