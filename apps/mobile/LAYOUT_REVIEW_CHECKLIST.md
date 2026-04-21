# Mobile Layout Review Checklist

Use this checklist before adding new UI and when reviewing existing screens for cleanup.

## Goal

Build screens with:
- one clear content hierarchy
- minimal wrapper depth
- relative/flex layout over manual positioning
- reusable small/medium/large content displays
- no repeated identity or metadata

## Quick Rules

1. Start from content, not containers.
2. Prefer one strong parent surface with light child sections.
3. Avoid card-inside-card unless the nested card is truly a separate object.
4. Avoid repeating the same icon, title, category, or metadata twice.
5. Let rich content use full width whenever possible.
6. Use vertical stacking by default; only use horizontal layout when it clearly improves scanning.
7. If a wrapper only adds spacing, see if the spacing can live on the real content element instead.
8. If a component feels squeezed rightward, audit parent `flex-row` containers first.

## Hierarchy Check

Ask these in order:

1. What is the primary subject?
2. What is secondary context?
3. What is supportive detail?
4. What is actionable?

Good examples:
- event screen: event -> attached activity plan -> preview -> actions
- training plan week tab: week -> day -> linked activity plan -> actions
- activity plan detail: summary -> preview -> comments

Bad examples:
- activity plan shown as a child card inside a session card inside a day card inside a week card
- event summary repeated above and inside the attached activity block

## Nesting Audit

Count actual content units first:
- title
- subtitle or meta line
- estimates
- visual preview
- notes
- owner
- actions

Then compare that to the rendered structure.

Warning signs:
- 5 content units but 10+ wrappers
- multiple nested bordered boxes for one concept
- a section title plus another section title immediately inside it
- separate identity row and metadata row both restating the same activity category

## Wrapper Smell Tests

A wrapper is suspicious if it only provides one of these:
- `gap`
- `margin`
- `padding`
- border only
- muted background only
- a flex row around two already-simple children

Prefer:
- move spacing to the nearest meaningful content block
- move border/background to the main owning container
- merge adjacent wrapper layers into one container

## Identity Deduping

Only show identity once unless there is a strong reason.

Avoid:
- activity icon in header and again in metadata line
- category label repeated beside the same preview
- event title repeated inside attached activity plan summary
- linked activity plan name stored in session title and also rendered from the linked plan

Prefer:
- one title row
- one metadata line
- one preview block

## Width And Flow

Rich content should usually be stacked vertically:
- intensity chart
- elevation profile
- route preview
- session flow

If rich content appears narrow or shifted right:

1. inspect parent `flex-row`
2. inspect fixed-width side columns
3. inspect nested action columns
4. move actions below or into header accessory flow

## Size Variants

For reusable content surfaces, define size by information density.

### Small
- title
- estimates row
- intensity chart or elevation fallback

### Medium
- small content
- description if helpful
- route context

### Large
- medium content
- richer route/detail blocks
- session flow
- supplemental notes or social context

Rule:
- do not create a new visual system for each surface
- adapt density, not identity

## Training Plan Rules

1. Week tab owns the hierarchy.
2. Sessions should visually disappear into the selected week card.
3. Linked activity plans should not be doubly boxed under sessions.
4. Session rows should be thin wrappers around linked activity plans.
5. Do not store linked activity plan names redundantly in session titles.

## Event Rules

1. Event remains primary.
2. Attached activity plan is embedded secondary content.
3. Event list item uses the smallest preview.
4. Event detail uses medium or large preview.
5. Keep event metadata and activity plan metadata distinct.

## Creation Flow Rules

1. Forms should read as one continuous flow, not stacked subcards.
2. Selected object preview should sit directly in form flow.
3. Search, selected state, and preview should be one section unless they are truly separate steps.
4. Helper text should explain the next action, not repeat visible information.

## Implementation Sequence

When cleaning a screen:

1. identify the primary subject
2. list actual content units
3. remove duplicate identity and metadata
4. flatten wrapper-only containers
5. replace horizontal squeeze layouts with vertical flow if needed
6. reduce nested borders/backgrounds
7. verify small/medium/large preview rules still hold
8. test the screen at mobile widths first

## PR Review Questions

Ask before shipping:

1. Does this screen have one obvious owner container?
2. Are any cards nested only for presentation, not semantics?
3. Is any title, icon, or category shown twice?
4. Does any chart/map/preview get squeezed by side layout?
5. Could one wrapper be deleted without changing meaning?
6. Does the component fit an existing size variant instead of creating a new one?

## Default Bias

When two layouts are both correct, prefer:
- fewer containers
- fewer borders
- fewer repeated labels
- more vertical flow
- stronger parent ownership
