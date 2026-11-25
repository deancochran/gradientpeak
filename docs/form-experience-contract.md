# Form experience contract

Forms across web and mobile should share meaning, validation, and lifecycle rules without forcing identical platform widgets. Apply this contract to new forms and when extending existing forms.

## Product correction — 2026-09-17

There is no persisted-draft product. Temporary input in an open editor (including invalid text, a last-saved Cancel snapshot, and a frozen failed-save request) is ordinary form state, not a saved draft. Internal `draft` identifiers and API payload names may remain; user-facing copy says plan, changes, entered values, or recording as appropriate.

Training plans have one create/edit owner per platform: web `TrainingPlanEditor`, mobile `TrainingPlanBuilderScreen`. Their existing create/edit routes reuse that owner. Details are viewing surfaces: Edit plan opens the canonical editor; linked activity cards open activity-plan detail. Visibility and session assignment changes belong exclusively to the editor and persist only on explicit Save. Cancel/back uses the standard discard guard; rejecting discard retains current input. Failed saves retain input and the existing safe retry contract.

This correction explicitly supersedes all earlier durable-draft table/service proposals and any draft-persistence, save-draft, resume-draft, autosave, or cross-device unsaved-input phase requirements. It authorizes no data deletion, migration, or auth change. Durable recording recovery remains recording functionality. Copy, like, share, apply, remove scheduled sessions, and delete retain their existing authorization and idempotency contracts.

## Shared controls

- Use the semantic field components in `@repo/ui`: text, multiline text, number, bounded quantity, weight, duration, pace, date, time, selection, and file inputs.
- Keep persistent labels, visible units, associated descriptions/errors, visible keyboard focus, and comfortable touch targets. Prefer one parent form surface with lightweight sections over nested decorative cards.
- Preserve the editable string while typing. Partial decimals and trailing zeros must not disappear because a parent echoes a numeric value. Normalize presentation at an explicit commit boundary, not on every keystroke.
- Bounded inputs currently publish a bounded numeric projection while retaining the raw editable string. Schemas remain authoritative. Generic number fields reject malformed drafts rather than silently treating them as optional clears. Declare schema-compatible `emptyValue`/parsers where required; do not assume null, empty string, and undefined are interchangeable.
- Explicit resets must discard editable drafts even if the numeric value is unchanged. Shared form wrappers connect this to `useZodForm.reset`; direct bounded/weight consumers can change `resetKey`.
- Forward form refs to the actual focusable input. Combine field, explicit, and submission-disabled state. An invalid submission should identify the field and offer a correction path.
- Use steppers for small integer choices. Boundary buttons must be disabled, direct entry must remain available, and web steppers must support arrow keys and spinbutton semantics.
- Keep calendar dates as local dates. Convert to instants only with an explicit timezone. Recurrence end dates represent the end of the selected local day, not a UTC day inferred from string slicing.

## Web composition

- Use semantic forms and one submit path. Nested editor controls must explicitly be non-submit buttons. Enter in multiline text remains a newline.
- Adopt `useUnsavedChangesGuard` with the complete semantic draft, a clean baseline, and all relevant pending operations. Include selections and attachments, not just text fields.
- Route cancellation through `guardedCancel` where closing a modal or invoking a callback does not necessarily navigate.
- Call `markSaved` only after authoritative success. For redirecting server functions, `useFormServerFn` marks success after the raw server response and before TanStack follows the redirect.
- Native browser POST forms are a specific exception: confirmation hands ownership to the browser at submission. Do not describe that handoff as verified persistence.
- Keep pending saves protected. Discarding a screen cannot cancel an already-dispatched mutation. Preserve the draft and protection after failure.

## Mobile composition

- Use `FormScreen` for header-action screens or the existing keyboard-aware modal container. Keep long forms scrollable, including edit variants, and allow taps to reach controls with the keyboard open.
- Use `useDirtyNavigationGuard` for route-owned drafts. It uses native-stack-aware removal protection; do not replace it with a bare navigation listener.
- Use `useDirtyCloseGuard` for modal close callbacks and OS close requests. Successful completion can close directly; cancellation must not imply that an in-flight save was cancelled.
- Propagate nested form dirty and pending state to the route/header. Draft snapshots must include selected resources, mode, recurrence, and other state outside React Hook Form.
- Keep labels, roles, selected states, and busy states meaningful to accessibility services. Match the keypad or picker to the value's meaning.

## Workflow hierarchy

- Goals: goal kind, relevant target, deadline, optional detail.
- Activity plans: session outline and focused step editing; make units explicit.
- Training plans: plan identity, schedule workspace, review; keep advanced configuration secondary.
- Route uploads: choose file, inspect validation/preview, confirm details, save. Preserve retryable metadata.
- Groups: identity and privacy first; media and longer descriptions are secondary.
- Events: identity, date/time/timezone, recurrence, attachments, notes. Explain recurrence scope before save and reject scopes that cannot represent the requested changes.

## Verification

For shared controls, cover partial entry, middle-of-text edits, clearing, external updates, same-value reset, blur, submit without blur, disabled input, and focus forwarding. For workflows, cover dirty navigation, discard/cancel, pending saves, successful redirects, failed-save retention, resource-only changes, timezone boundaries, and recurrence scope.

Use component tests for state contracts, router tests for navigation, and browser/device checks for geometry, keyboard occlusion, gestures, screen readers, and large text. Node-based native component tests are not proof of device behavior. The repository's `audit:forms` command is advisory: review candidates by semantic fit rather than blindly replacing every raw field.
