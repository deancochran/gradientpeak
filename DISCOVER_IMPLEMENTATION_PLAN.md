# Discover MVP Implementation Plan

## Purpose

Turn the Discover MVP spec into a practical implementation sequence.

## MVP Priorities

1. stabilize the search-first UI shell
2. replace assumption-heavy default browsing with lightweight cold-start content
3. move training plan search/filtering into SQL
4. remove unnecessary derived or estimated fields from Discover list responses
5. add the smallest useful set of search indexes

## Phase 1: Stabilize The Search-First Shell

### Tasks

1. keep the compact search row with embedded filter button
2. keep the tab switcher
3. preserve per-tab applied and draft filter state
4. preserve bottom-sheet apply/reset behavior
5. keep `Profiles` search-only

### Exit Criteria

1. Discover shell behavior is stable
2. mobile tests cover filter button and sheet behavior

## Phase 2: Replace Browse-First Default Content

### Tasks

1. remove any remaining category-led default dashboard patterns
2. define lightweight cold-start content per tab
3. keep neutral-state content useful but minimal

### Recommendation

Use tab-scoped sample lists for MVP.

### Exit Criteria

1. neutral state no longer reads as a browse dashboard

## Phase 3: Move Training Plan Search Into SQL

### Tasks

1. replace fetch-all-then-filter behavior in `trainingPlans.listTemplates`
2. run sport, experience, duration, and search in SQL
3. preserve auth and visibility behavior

### Exit Criteria

1. training plan search no longer filters in memory

## Phase 4: Remove Unnecessary Derived Fields From Discover Lists

### Tasks

1. audit list procedures used by Discover
2. skip estimated or processed fields where Discover does not need them
3. preserve detail endpoints that genuinely need those fields

### Immediate Candidate

1. `activityPlans.list` should support skipping estimation for Discover

### Exit Criteria

1. Discover list endpoints avoid unnecessary estimation work

## Phase 5: Add Lightweight Search Indexing

### Tasks

1. enable `pg_trgm`
2. add trigram indexes for:
   `profiles.username`
   `activity_plans.name`
   `activity_routes.name`
3. optionally add weighted generated `tsvector` columns only where clearly useful now

### Exit Criteria

1. MVP search is faster and more tolerant on names/usernames

## Testing

### Mobile

1. neutral cold-start state
2. search-only results state
3. filter-only results state
4. search plus filters
5. filter icon state

### Backend

1. training plan SQL-backed search behavior
2. auth and visibility behavior in search results
3. any list endpoint flags that disable estimation or derived payload work

## Explicitly Deferred

1. global multi-entity search
2. shared generalized search abstraction
3. search document index table
4. pagination redesign for future-proofing only

## Definition Of Done

This MVP is done when:

1. Discover feels search-first
2. cold-start is useful without being assumption-heavy
3. results are clearly driven by user intent
4. training plan search is SQL-backed
5. Discover list responses stay lean and avoid unnecessary estimation work
