# Discover UX MVP Plan

## Summary

Ship a focused UI/UX polish pass across Discover and its linked detail screens using existing queries, routes, and components.

## Workstreams

1. Audit current Discover browse/search states and linked detail screens.
2. Redesign list cards and supporting copy for better information scent.
3. Reorder detail screen sections so summary comes before actions and destructive controls.
4. Run targeted mobile validation.

## Implementation Notes

- Reuse existing card, badge, icon, and text primitives.
- Prefer file-local helpers over new abstractions unless a pattern is clearly shared.
- Keep changes UI-only unless a tiny behavior fix is required to remove misleading interactions.

## Validation

- Run targeted Jest coverage for Discover/detail routes if available.
- Run typecheck or focused verification only if edits touch typed interfaces broadly.
