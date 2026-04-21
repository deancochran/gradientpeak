# List Page Audit Checklist

## Purpose

Use this checklist to audit list-based mobile screens against `list-page-spec.md`.

This checklist is meant to be used screen by screen during refactors.

## Global Checklist

Apply these checks to every list screen.

### Header

- [ ] The screen uses a top-right header overflow trigger by default for page-level actions.
- [ ] The header dropdown contains only page-level actions, not row-level actions.
- [ ] The body does not duplicate the same create, upload, sort, or schedule action at the top.
- [ ] The screen still reads clearly when the dropdown is closed.

### Intro And Summary

- [ ] The screen opens with a clear intro or intentionally skips it for a stronger reason.
- [ ] The intro explains what lives on the page in one short sentence or card.
- [ ] Counts and scope summaries are compact and quiet.
- [ ] The nav title is not repeated as a heavy in-body heading.

### Controls

- [ ] Filters, sort controls, and scope controls live in one coherent block.
- [ ] The page uses only controls that materially change the result set.
- [ ] The page does not scatter controls above and below the list.
- [ ] `My ...` screens do not default to search/filter controls unless those controls solve a real browsing problem.

### Rows

- [ ] Each row reads as a preview of a first-class destination.
- [ ] Identity appears before metadata or metrics.
- [ ] Supporting context is short and useful.
- [ ] Metrics or status are compact and easy to compare.
- [ ] Row chrome is calm and not overly administrative.
- [ ] Row tap behavior is obvious and reliable.

### Actions

- [ ] Destructive row actions are removed unless the screen is explicitly a management console.
- [ ] Quick row actions are used only when time-sensitive or intrinsic to the row.
- [ ] Create actions use consistent wording: `Create`, `Schedule`, or `Upload`.
- [ ] `My ...` screens do not use body-level `Create`, `Record`, or similar encouragement by default.

### States

- [ ] Loading state matches the screen family and preserves the page frame when possible.
- [ ] Empty state explains what is missing and offers one useful next action.
- [ ] Error state is simple and offers retry when possible.

## Family-Specific Checklist

### Agenda Lists

- [ ] The page feels schedule-first, not library-first.
- [ ] Grouping is clear and calm.
- [ ] Quick actions such as `Start Activity` are visually secondary to row navigation.
- [ ] Schedule counts are integrated into the intro or summary, not detached as random chrome.

### Library Or History Lists

- [ ] The page feels browse-first and comparison-friendly.
- [ ] Row density supports scanning many entries quickly.
- [ ] Filters and sorting are useful without dominating the screen identity.
- [ ] Delete or archive has moved off the list row when a real detail flow exists.
- [ ] Owner-library `My ...` screens remain read/manage-first rather than create-first.

### Communication Or Inbox Lists

- [ ] Recency and unread state are immediately scannable.
- [ ] Unread treatment uses one primary signal and at most one secondary signal.
- [ ] Preview text stays compact.
- [ ] Inline response actions appear only on rows that genuinely require them.

## Screen Audit Worksheets

## 1. `calendar-day`

- [ ] Header dropdown exists if day-level actions are needed.
- [ ] Intro card remains the opening reference for agenda lists.
- [ ] Event count stays quiet and integrated with the intro.
- [ ] Planned-event quick actions remain secondary to opening the event.
- [ ] Empty, loading, and retry states feel consistent with the shared agenda pattern.

## 2. `scheduled-activities-list`

- [ ] Add a top-right header dropdown with `Schedule` and `Open Calendar` if both remain needed.
- [ ] Remove the detached count strip or merge it into the intro.
- [ ] Remove the duplicate schedule entry point so the page uses one primary action model.
- [ ] Group headers and row spacing align with `calendar-day`.
- [ ] The screen opens with context, not just a list.

## 3. `activities-list`

- [ ] Keep the screen as a straightforward activity index, not a search surface.
- [ ] Remove default filter chips and search-style controls unless a real browsing need appears.
- [ ] Add a top-right header dropdown only if there are real list-level actions worth keeping.
- [ ] Reduce feed-like row density and chrome.
- [ ] Make metrics easier to compare without heavy labels.
- [ ] Remove `Record Activity` encouragement from the empty state unless this screen becomes the recording hub.

## 4. `routes-list`

- [ ] Add a top-right header dropdown with `Upload` and future route-library actions.
- [ ] Remove duplicated upload affordances if the header action is added.
- [ ] Reduce map-preview dominance so route identity leads.
- [ ] Remove row-level delete once detail/header flow is authoritative.
- [ ] Add a short routes-library intro and quiet result summary.

## 5. `training-plans-list`

- [ ] Keep the screen browse/manage-first rather than create-first.
- [ ] Remove create encouragement from the body and empty state.
- [ ] Keep header actions minimal unless real browse/manage actions are needed.
- [ ] Quiet or remove visibility treatment unless it materially changes expectations.
- [ ] Remove filler footer copy from rows.
- [ ] Make rows feel like previews of `training-plan-detail`.

## 6. `activity-efforts-list`

- [ ] Add a top-right header dropdown with `Create`.
- [ ] Remove row-level delete when the detail screen is authoritative enough to own it.
- [ ] Simplify the row into one compact press target.
- [ ] Add a short efforts-history intro and summary.
- [ ] Keep value, unit, duration, and date easy to compare.

## 7. `profile-metrics-list`

- [ ] Add an intro and quiet summary even if no header actions are needed yet.
- [ ] Keep rows calm and compact.
- [ ] Align spacing and row hierarchy with other history lists.
- [ ] Only add header dropdown actions if metric logging is actually exposed here.
- [ ] Make the screen feel like part of the same system as efforts and activities.

## 8. `messages`

- [ ] Add a top-right header dropdown only if there are real inbox-level actions; otherwise keep the header intentionally minimal.
- [ ] Decide whether the page needs a short inbox intro or an unread summary.
- [ ] Tighten unread treatment to one primary signal plus one secondary signal at most.
- [ ] Improve empty-state language so it explains how conversations start.
- [ ] Keep rows compact around name, preview, time, and unread state.

## 9. `notifications`

- [ ] Keep a top-right header dropdown with `Read All` as the default page-level action model.
- [ ] Decide whether an unread summary improves orientation.
- [ ] Keep timestamps short and visually quiet.
- [ ] Make unread state visible without overpowering titles.
- [ ] Keep inline `Accept` and `Reject` controls visually secondary to the notification row.
- [ ] Avoid making actionable rows feel like separate forms.
