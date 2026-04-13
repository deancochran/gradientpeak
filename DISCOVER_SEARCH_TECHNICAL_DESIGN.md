# Discover MVP Search Technical Design

## Purpose

Define the minimum backend and database design needed to support the Discover MVP search experience.

## Goals

1. keep search inside Postgres
2. improve performance using simple proven primitives
3. standardize tRPC behavior where it improves DX
4. keep Discover list responses lean
5. avoid premature generalized search infrastructure

## Non-Goals

1. global search across all entities
2. external search engines
3. semantic search or recommendation systems
4. a generalized search platform for the entire app

## Current Issues

1. `activityPlans.list` adds estimation fields on the list path
2. `trainingPlans.listTemplates` filters in memory
3. several search paths still rely on plain `ILIKE`

## Recommended Search Modes

### Short-Text Search

Use `pg_trgm` for:

1. `profiles.username`
2. `activity_plans.name`
3. `activity_routes.name`

Why:

1. good typo tolerance for short strings
2. good DX with Postgres and Drizzle
3. minimal architectural overhead

### Full Text Search

Use full text search only where it clearly improves MVP search now.

Primary candidates:

1. activity plan descriptions
2. training plan descriptions

Recommended parsing:

1. `websearch_to_tsquery` when FTS is introduced

## Entity Decisions

### Activity Plans

MVP direction:

1. support search on `name` and description
2. allow Discover list callers to skip estimation fields
3. add trigram index on `name`
4. only add weighted `tsvector` if description search needs immediate improvement

### Training Plans

MVP direction:

1. move all search and filters into SQL
2. search on `name` first
3. add trigram index on name if schema shape allows
4. add FTS only if needed after SQL migration

### Routes

MVP direction:

1. keep SQL filtering by category
2. search by `name`
3. add trigram index on `name`

### Profiles

MVP direction:

1. search by `username`
2. add trigram index on `username`
3. keep existing simple contract for now

## tRPC Design

tRPC should:

1. validate input with Zod
2. preserve auth and visibility scope
3. return stable typed list envelopes
4. allow list procedures to opt out of derived or estimated fields when appropriate

Do not build a generalized search abstraction for MVP.

## Database Changes

### Required

1. enable `pg_trgm`
2. add trigram indexes for the key name/username fields

### Optional

1. generated weighted `tsvector` columns for activity plans and training plans if needed after basic SQL search is in place

## Payload Rules

For Discover list endpoints:

1. return fields close to raw stored record data where possible
2. avoid estimated values like `estimated_tss`, `estimated_duration`, `confidence_score`, and similar derived fields unless the specific list UI clearly needs them
3. preserve derived fields on detail endpoints or other screens that actually use them

## Recommended Backend Sequence

1. move training plan search/filtering into SQL
2. add `includeEstimation`-style opt-outs where Discover lists do not need derived fields
3. add `pg_trgm`
4. add trigram indexes
5. evaluate whether FTS is still necessary for MVP after the above changes

## Success Criteria

1. Discover search is database-backed
2. training plan search is no longer in memory
3. Discover list payloads avoid unnecessary derived fields
4. the MVP uses simple, maintainable Postgres features rather than generalized search infrastructure
