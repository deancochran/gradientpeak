# System Route Templates Spec

## Goal

Add a system-owned route catalog that works the same way system activity-plan templates work today:

- route definitions live in code
- a sync script imports them into the backend
- the backend downloads the public route file, parses it, computes metadata, uploads the file to storage, and persists the route row
- system activity plans can reference these system routes by `route_id`

## Current State

### What already exists

- `packages/core/samples/index.ts` is the source of truth for system activity-plan templates.
- `packages/db/scripts/seed-templates.ts` syncs those templates into `activity_plans`.
- `packages/api/src/routers/routes.ts` already does the core route ingestion work for user uploads:
  - parse GPX
  - validate coordinates
  - calculate distance and elevation
  - simplify and encode preview polyline
  - upload the route file to storage
  - insert the `activity_routes` row

### Main gap

`activity_routes` is still modeled as user-owned only:

- `profile_id` is required
- there is no `is_system_template`
- there is no `import_provider` / `import_external_id`
- there is no canonical source metadata for redownload/revalidation

That means system routes cannot be represented cleanly the way system activity plans are today.

## Recommendation

Use the same table for both user routes and system routes.

Why this is the best fit:

- it matches the existing `activity_plans` model
- it reuses the current read paths and route references
- it avoids introducing a second route table and duplicate joins
- it keeps route IDs stable and directly attachable to activity plans

## Proposed Route Model Changes

Add the following concepts to `activity_routes`:

- `profile_id uuid null`
- `is_system_template boolean not null default false`
- `template_visibility text not null default 'private'`
- `import_provider text null`
- `import_external_id text null`
- `source_url text null`
- `source_license text null`
- `source_attribution text null`
- `file_format text not null default 'gpx'`
- `checksum_sha256 text null`

Recommended integrity rules:

- system routes must have `profile_id is null`
- user routes must have `profile_id is not null`
- system routes should default to public visibility
- `(profile_id, import_provider, import_external_id)` should be unique for user imports
- `(import_provider, import_external_id)` should be unique for system routes when `is_system_template = true`

## Core Package Structure

Keep route template definitions in `packages/core` as metadata only.

Suggested new file:

- `packages/core/samples/system-routes.ts`

Suggested shape:

```ts
export interface SystemRouteTemplate {
  id: string;
  activity_category: "run" | "bike" | "swim" | "other";
  name: string;
  description: string;
  source_provider: string;
  source_url: string;
  download_url?: string;
  source_license?: string | null;
  source_attribution?: string | null;
  import_external_id: string;
  tags?: string[];
  region?: string;
  route_type?: "loop" | "out_and_back" | "point_to_point";
}
```

Important boundary:

- `@repo/core` stores only deterministic metadata
- the actual download, parse, storage upload, and DB insert stay outside `@repo/core`

## Import Architecture

Refactor the current route upload logic into a shared service used by both:

- `packages/api/src/routers/routes.ts`
- a new sync script such as `packages/db/scripts/seed-system-routes.ts`

Suggested service split:

1. `parseAndBuildRouteArtifacts(fileContent, fileFormat)`
2. `storeRouteFile({ bucket, filePath, fileContent, contentType })`
3. `upsertRouteRecord({ ownership, metadata, artifacts, importIdentity })`

Then the new system sync script does:

1. read `SYSTEM_ROUTE_TEMPLATES` from `@repo/core`
2. download each public GPX from `download_url`
3. run the shared ingestion service
4. upload the file to storage
5. insert or update the `activity_routes` row as a system template
6. optionally link route IDs into system activity-plan templates
7. delete stale system routes only when they are no longer referenced

## Scope Recommendation

Start with route-capable categories only:

- `run`
- `bike`
- `other` as walk/hike/trail

Treat `swim` as a second-phase pilot:

- only open-water swim courses
- keep it curated and manual at first

Do not create system routes for `strength`.

Reason:

- the current route stack is GPX and map based
- `strength` has no natural route file model
- `swim` is valid only for open-water courses, not pool sessions

## Candidate Route Catalog

These are the best starter candidates I found from publicly visible route/event sources. For `run`, `bike`, and `other`, I prioritized popularity-ranked public route lists. For `swim`, I used iconic/high-traffic open-water event lists because I did not find a single reliable public GPX popularity ranking comparable to running/cycling.

### Run candidates

Source: Plotaroute popular running routes

1. Leadville 100 Run
2. BCM24
3. Walk Jog Run - 1 Mile Reps
4. 2024 UW Medicine Seattle Marathon
5. 2024 UW Medicine Seattle Half Marathon
6. Lidingoloppet 30km
7. Blackpool Marathon
8. 5k Run Route
9. 2019 Amica Insurance Seattle Marathon - Full
10. North Shore Marathon & Half Marathon

### Bike candidates

Source: Plotaroute popular cycling routes

1. LT100 MTB
2. 2024 Silver Rush 50 Run And Bike
3. 2024 LT 100 MTB
4. Tour De Beara 160km
5. Hotter"n Hell 100 Mile Route 2025
6. The Tour De Mon Mawr
7. Lap The Lough 2023
8. W200 2024
9. Ring Of Beara Cycle - 140km
10. Tour De Beara 120km

### Other candidates

Recommended interpretation: walk / hike / trail routes, not generic misc.

Source: filtered from Plotaroute popular walking routes for outdoor relevance

1. Allermuir Hill Circuit
2. West Dorset Three Peaks
3. West Kip, East Kip & Scald Law
4. North Downs Way
5. Longmynd Hike Route
6. Oxford Jubilee Walk (Adapted)
7. Lynmouth To Watersmeet Circular
8. Julia Bradbury's Watersmeet Walk
9. Turnhouse Hill, Carnethy Hill And Scald Law
10. Eastleigh > Winchester (via Itchen Way)

### Swim candidates

Recommended interpretation: open-water only.

Sources: Triathlete destination list, WOWSA World Top 100, LongSwims/WOWSA discovery

1. Bosphorus Cross-Continental Swim
2. El Cruce Cancun
3. South32 Rottnest Channel Swim
4. Kingdom Swim
5. Great Chesapeake Bay Swim
6. Long Bridge Swim
7. Big Shoulders Swim
8. Swim the Suck
9. 20 Bridges Swim
10. Sharkfest Swim from Alcatraz Island

### Strength candidates

None recommended.

If the product needs a system concept for strength, it should be a location, venue, or workout template concept instead of a route file.

## Product Notes

The route model should probably grow one extra concept beyond `activity_category`:

- `route_sport` or `route_subtype`

Examples:

- `run`: road, trail, race_course
- `bike`: road, gravel, mtb, climb
- `other`: walk, hike, trail
- `swim`: open_water_loop, point_to_point

This would let `other` stay broad in the app while still making the system catalog searchable and useful.

## Suggested Implementation Order

1. Add system-route support to the DB schema.
2. Extract route-ingestion logic from the tRPC router into a shared service.
3. Add `packages/core/samples/system-routes.ts` and export the catalog.
4. Create `packages/db/scripts/seed-system-routes.ts` with dry-run support.
5. Add route-template linking support in system activity-plan metadata where useful.
6. Update route queries so public/system routes are visible where expected.
7. Add focused tests for:
   - system route upsert
   - duplicate import identity handling
   - stale route cleanup rules
   - route visibility and ownership reads

## Source URLs

- https://www.plotaroute.com/routes/running/popular/1
- https://www.plotaroute.com/routes/cycling/popular/1
- https://www.plotaroute.com/routes/walking/popular/1
- https://www.triathlete.com/culture/travel/the-11-coolest-open-water-swim-races/
- https://ultraswimming.org/database/
- https://www.openwaterswimming.com/world-top-100/
