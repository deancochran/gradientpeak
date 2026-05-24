# Form Field Standards

Use this guide when creating or editing user-configured forms in `apps/web`, `apps/mobile`, or shared UI package code.

## Default Hierarchy

1. Use `@repo/ui/components/form` wrappers by default for React Hook Form screens.
2. Use raw `FormField` only for composite widgets that do not yet have wrappers.
3. If a raw `FormField` pattern appears in two places, create a reusable wrapper.
4. If a field represents a repeated domain concept, prefer a semantic field component over generic primitives.
5. Keep schemas and domain parsing in `@repo/core`; keep UI field composition in `@repo/ui`.

## Canonical Mapping

| Field type | Preferred component |
| --- | --- |
| Single-line text | `FormTextField` |
| Long text | `FormTextareaField` |
| 2-5 fixed options | `FormSegmentedSelectField` |
| 6+ options or dynamic options | `FormSelectField` |
| Boolean | `FormSwitchField` |
| Integer range | `FormIntegerStepperField` |
| Decimal or bounded unit value | `FormBoundedNumberField` |
| Percent or fraction-backed percent | `FormPercentSliderField` |
| Date | `FormDateInputField` |
| Time | `FormTimeInputField` |
| Date and time | `FormDateTimeField` |
| Duration | `FormDurationField` |
| Pace | `FormPaceField` |
| Weight | `FormWeightInputField` |

## Raw `FormField` Exceptions

Raw `FormField` is acceptable when the field is a true composite or has layout behavior a wrapper does not support yet.

Current valid examples:

- File pickers such as route uploads.
- Message composers or chat inputs.
- Password fields with extra label-row actions, such as a forgot-password link.
- Server-action/native `FormData` cases where hidden inputs or exact browser submission semantics are required.
- Large technical select lists that are intentionally dropdowns.

When adding a new exception, prefer a short PR note explaining why a shared wrapper was not appropriate.

## UX Standards

- Small enums should be direct-tap segmented controls, not dropdowns.
- Numeric values should avoid free text when a bounded or stepped input is available.
- Optional values must be reversible to `null` or unset from the same input area.
- Clear/unset actions should be compact and colocated with the input.
- Helper text should explain constraints, privacy, formatting, sync/import behavior, or why a value matters.
- Avoid helper text that repeats the label or says only that a value is stored.

## Review Workflow

Run the non-blocking audit before reviewing form-heavy changes:

```bash
pnpm audit:forms
```

The audit reports likely drift patterns. It is intentionally advisory so reviewers can distinguish valid custom composites from fields that should move to shared wrappers.
