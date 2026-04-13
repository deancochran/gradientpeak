# Discover Search-First MVP Spec

## Goal

Redesign Discover so it behaves like a search-first surface.

The MVP should:

1. make no strong assumption about what the user wants by default
2. make search the primary action
3. hide filters behind a bottom sheet
4. show useful cold-start content without turning the page into a browse dashboard
5. keep backend search and payloads simple, fast, and maintainable

## Product Model

Discover supports two states only.

### State A: No Search And No Filters

This is the cold-start state.

Requirements:

1. the screen must not feel empty
2. the screen must not assume a preferred search path
3. default content should be lightweight sample content, not category-led browsing

### State B: Search Or Filters Exist

This is the active results state.

Requirements:

1. content must directly reflect user search and filters
2. the page should behave like a results surface, not a browse surface
3. filter state should be indicated only by the filter icon

## UI Structure

Keep only these persistent controls above content:

1. `AppHeader`
2. tab switcher
3. compact search row with:
   search icon, text input, clear affordance, filter button when supported

Do not show:

1. persistent helper copy below search
2. persistent inline filter chips
3. large intro cards that push content lower
4. category-led default dashboards

## Filter UX

### Filter Button

1. lives inside the search row
2. opens the bottom sheet
3. shows active state only on the icon itself
4. uses no summary row and no numeric badge

### Filter Sheet

1. uses a bottom sheet with backdrop
2. supports draft state until `Apply`
3. discards draft edits when dismissed without apply
4. supports `Reset` for the active tab only

## Tab Behavior

### Activity Plans

1. searchable
2. filterable by activity category
3. Discover list path should not request estimated or derived fields when they are not needed for MVP list rendering

### Training Plans

1. searchable
2. filterable by sport, experience level, and duration presets
3. search and filtering must run in SQL, not in memory

### Routes

1. searchable
2. filterable by activity category

### Profiles

1. search-only in MVP
2. no filter button

## Search Principles

For MVP, search should follow these rules:

1. run in Postgres, not in memory
2. use `pg_trgm` for short-text fuzzy matching on names and usernames
3. use PostgreSQL full text search only where it clearly adds value now
4. keep tRPC contracts typed and consistent where practical
5. avoid generalized multi-entity search infrastructure in MVP

## Search Infrastructure Requirements

### Must Do In MVP

1. move training plan search and filters into SQL
2. add `pg_trgm`
3. add trigram indexes for:
   `profiles.username`
   `activity_plans.name`
   `activity_routes.name`
4. allow Discover list endpoints to skip unnecessary derived or estimated fields

### Can Do In MVP If Needed

1. add weighted generated `tsvector` columns for activity plans and training plans
2. use `websearch_to_tsquery` where full text search is introduced

### Explicitly Deferred

1. global multi-entity search
2. `search_documents` table
3. shared generalized search framework below every router
4. pagination redesign purely for future-proofing
5. recommendation systems or semantic search

## Copy Guidance

Copy should be neutral, short, and utilitarian.

### Neutral State Examples

1. `Search anything in Discover`
2. `Find plans, routes, and people with search or filters`

### Results State Examples

1. `Search results`
2. `Running plans`
3. `Training plan results`
4. `Routes`
5. `Profiles`

### Empty State Examples

1. `No matching plans`
2. `No matching routes`
3. `No matching training plans`
4. `No profiles found`

Supporting text:

1. `Try another search or adjust filters.`

## Acceptance Criteria

### Product

1. Discover feels search-first rather than browse-first
2. cold-start content is useful but lightweight
3. no default state relies on a category-led dashboard
4. results clearly reflect user search and filters
5. filters remain hidden behind the bottom-sheet trigger
6. active filters are indicated only through the filter icon state
7. `Profiles` remains search-only

### Backend

1. training plan search no longer filters in memory
2. Discover list search paths avoid unnecessary estimated or processed fields
3. name and username search paths are positioned to use trigram indexes
4. the MVP does not introduce generalized global search infrastructure

## Implementation Note

The current worktree implementation already covers the compact search row, filter button, and bottom-sheet interaction.

The remaining MVP work is:

1. align cold-start content with this spec
2. move training plan search into SQL
3. trim unnecessary derived fields from Discover list responses
4. add lightweight indexing where it improves search quality and speed
