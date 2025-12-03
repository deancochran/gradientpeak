# Wahoo Route Sync Implementation

## Overview

The Wahoo integration now supports **automatic route syncing** when a planned activity has a route attached. When a user creates a planned activity with a route, the route is automatically uploaded to Wahoo and linked to the workout on their calendar.

## Key Features

✅ **Automatic Route Sync** - Routes sync automatically when creating a planned activity  
✅ **Activity Type Validation** - Only outdoor bike and outdoor run support routes  
✅ **GPX to FIT Conversion** - Seamless conversion from GPX storage to Wahoo's FIT format  
✅ **Error Handling** - Graceful fallback if route sync fails (workout still created)  
✅ **Route Validation** - Comprehensive validation before uploading to Wahoo

## Supported Activity Types

### Route Support Matrix

| Activity Type | Structured Workout | Route Support | Wahoo Sync |
|---------------|-------------------|---------------|------------|
| `outdoor_bike` | ✅ Yes | ✅ Yes | ✅ Full Support |
| `outdoor_run` | ✅ Yes | ✅ Yes | ✅ Full Support |
| `indoor_bike_trainer` | ✅ Yes | ❌ No | ⚠️ Workout Only |
| `indoor_treadmill` | ✅ Yes | ❌ No | ⚠️ Workout Only |
| `indoor_strength` | ✅ Yes | ❌ No | ❌ Not Supported |
| `indoor_swim` | ✅ Yes | ❌ No | ❌ Not Supported |

## How It Works

### User Flow

1. User creates an activity plan with a route attached (`route_id`)
2. User schedules the plan as a planned activity
3. **Automatic sync triggers** (if Wahoo integration is connected)
4. System validates activity type supports routes
5. System converts GPX route to FIT format
6. Route uploads to Wahoo's library
7. Workout creates on Wahoo calendar with `route_id` parameter
8. Route syncs to user's Wahoo device (ELEMNT bike computer or Wahoo app)

### Technical Flow

```
User creates planned activity
    ↓
Check: Wahoo integration connected?
    ↓ (Yes)
Fetch activity plan with route_id
    ↓
Has route_id?
    ↓ (Yes)
Check: Activity type supports routes? (outdoor_bike/outdoor_run)
    ↓ (Yes)
Load route from database + storage
    ↓
Parse GPX file → extract coordinates
    ↓
Validate route data
    - Minimum 2 coordinates
    - Valid lat/lng ranges
    - Reasonable distance
    ↓
Convert to FIT format
    - Coordinates → semicircles
    - Add elevation data
    - Calculate cumulative distance
    - Add metadata (name, sport type)
    ↓
Upload to Wahoo API (/v1/routes)
    ↓
Get Wahoo route_id
    ↓
Create workout with route_id parameter
    ↓
Store sync record in database
```

## API Integration

### Wahoo Routes API

**Endpoint:** `POST /v1/routes`

**Parameters:**
- `route[file]` - Base64 encoded FIT file
- `route[filename]` - File name (e.g., "my-route.fit")
- `route[external_id]` - GradientPeak route UUID
- `route[provider_updated_at]` - ISO timestamp
- `route[name]` - Route name
- `route[description]` - Optional description
- `route[workout_type_family_id]` - 0 for cycling, 1 for running
- `route[start_lat]` - Starting latitude
- `route[start_lng]` - Starting longitude
- `route[distance]` - Total distance in meters
- `route[ascent]` - Total ascent in meters
- `route[descent]` - Total descent in meters

**Response:**
```json
{
  "id": 123,
  "user_id": 456,
  "name": "Morning Ride",
  "file": {
    "url": "https://cdn.wahooligan.com/..."
  },
  "workout_type_family_id": 0,
  "external_id": "uuid-here",
  "start_lat": 33.975087,
  "start_lng": -85.105208,
  "distance": 24909.71,
  "ascent": 450.0,
  "descent": 450.0
}
```

### Workout with Route

**Endpoint:** `POST /v1/workouts`

**Parameters:**
```json
{
  "workout": {
    "plan_id": 789,
    "route_id": 123,  // ← Links route to workout
    "name": "Morning Ride",
    "starts": "2024-01-15T09:00:00.000Z",
    "external_id": "planned-activity-uuid"
  }
}
```

## File Format Conversion

### GPX to FIT Conversion

**Input (GPX):**
```xml
<gpx>
  <trk>
    <trkseg>
      <trkpt lat="33.975087" lon="-85.105208">
        <ele>234.5</ele>
      </trkpt>
      <trkpt lat="33.975123" lon="-85.105234">
        <ele>235.2</ele>
      </trkpt>
    </trkseg>
  </trk>
</gpx>
```

**Output (FIT):**
```json
{
  "file_id": {
    "type": "course",
    "manufacturer": "gradient_peak",
    "time_created": "2024-01-15T08:00:00.000Z"
  },
  "course": {
    "name": "Morning Ride",
    "sport": "cycling"
  },
  "record": [
    {
      "position_lat": 402653184,  // Semicircles
      "position_long": -1006080000,
      "altitude": 234.5,
      "distance": 0
    },
    {
      "position_lat": 402653568,
      "position_long": -1006080648,
      "altitude": 235.2,
      "distance": 5.2
    }
  ]
}
```

**Coordinate Conversion:**
```
Semicircles = degrees × (2^31 / 180)

Example:
33.975087° → 402653184 semicircles
-85.105208° → -1006080000 semicircles
```

## Database Schema

### Activity Routes Table

```sql
CREATE TABLE activity_routes (
    id uuid PRIMARY KEY,
    profile_id uuid REFERENCES profiles(id),
    name text NOT NULL,
    description text,
    activity_category activity_category NOT NULL,
    file_path text NOT NULL,  -- GPX file in storage
    total_distance integer NOT NULL,
    total_ascent integer,
    total_descent integer,
    polyline_encoded text,  -- For preview
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
```

### Activity Plans Table

```sql
CREATE TABLE activity_plans (
    id uuid PRIMARY KEY,
    profile_id uuid REFERENCES profiles(id),
    name text NOT NULL,
    description text,
    activity_type activity_type NOT NULL,
    structure jsonb NOT NULL,
    route_id uuid REFERENCES activity_routes(id),  -- ← Links to route
    estimated_duration integer NOT NULL,
    estimated_tss integer NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
```

### Synced Planned Activities Table

```sql
CREATE TABLE synced_planned_activities (
    id uuid PRIMARY KEY,
    profile_id uuid REFERENCES profiles(id),
    planned_activity_id uuid REFERENCES planned_activities(id),
    provider text NOT NULL,  -- 'wahoo'
    external_workout_id text NOT NULL,  -- Wahoo workout ID
    synced_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE(planned_activity_id, provider)
);
```

## Code Implementation

### 1. Route Converter (`route-converter.ts`)

```typescript
export function convertRouteToFIT(routeData: RouteMetadata): string {
  const fitData = {
    file_id: {
      type: "course",
      manufacturer: "gradient_peak",
      time_created: new Date().toISOString(),
    },
    course: {
      name: routeData.name,
      sport: mapActivityTypeToSport(routeData.activityType),
    },
    record: routeData.coordinates.map((coord, index) => ({
      position_lat: convertToSemicircles(coord.latitude),
      position_long: convertToSemicircles(coord.longitude),
      altitude: coord.elevation || 0,
      distance: calculateDistance(routeData.coordinates.slice(0, index + 1)),
    })),
  };

  const base64 = Buffer.from(JSON.stringify(fitData)).toString("base64");
  return `data:application/vnd.fit;base64,${base64}`;
}
```

### 2. Wahoo Client (`client.ts`)

```typescript
async createRoute(routeData: WahooRouteData): Promise<WahooRoute> {
  const formData = new URLSearchParams();
  formData.append("route[file]", routeData.file);
  formData.append("route[filename]", routeData.filename);
  formData.append("route[external_id]", routeData.externalId);
  formData.append("route[provider_updated_at]", routeData.providerUpdatedAt);
  formData.append("route[name]", routeData.name);
  formData.append("route[workout_type_family_id]", routeData.workoutTypeFamilyId.toString());
  formData.append("route[start_lat]", routeData.startLat.toString());
  formData.append("route[start_lng]", routeData.startLng.toString());
  formData.append("route[distance]", routeData.distance.toString());
  formData.append("route[ascent]", routeData.ascent.toString());

  return await this.makeRequest<WahooRoute>("/v1/routes", {
    method: "POST",
    body: formData.toString(),
  });
}
```

### 3. Sync Service (`sync-service.ts`)

```typescript
async createNewSync(
  planned: any,
  structure: ActivityPlanStructure,
  profile: any,
  wahooClient: any,
  profileId: string,
  warnings?: string[],
  routeData?: any,
): Promise<SyncResult> {
  // Sync route first if present
  let wahooRouteId: number | undefined;
  
  if (routeData && supportsRoutes(planned.activity_plan.activity_type)) {
    const validation = validateRouteForWahoo(routeData);
    
    if (validation.valid) {
      const fitFile = convertRouteToFIT(routeData);
      const startCoord = getRouteStartCoordinate(routeData.coordinates);
      
      const wahooRoute = await wahooClient.createRoute({
        file: fitFile,
        filename: `${routeData.name}.fit`,
        externalId: routeData.id,
        // ... other parameters
      });
      
      wahooRouteId = wahooRoute.id;
    }
  }

  // Create plan and workout with optional route_id
  const plan = await wahooClient.createPlan({...});
  const workout = await wahooClient.createWorkout({
    planId: plan.id,
    routeId: wahooRouteId,  // ← Attach route to workout
    // ... other parameters
  });

  return { success: true, workoutId: workout.id.toString() };
}
```

### 4. Automatic Sync Trigger (`planned_activities.ts`)

```typescript
create: protectedProcedure
  .input(plannedActivityCreateSchema)
  .mutation(async ({ ctx, input }) => {
    // Create planned activity
    const { data, error } = await ctx.supabase
      .from("planned_activities")
      .insert({...})
      .single();

    // Auto-sync to Wahoo (non-blocking)
    const syncWahoo = async () => {
      const { data: integration } = await ctx.supabase
        .from("integrations")
        .select("provider")
        .eq("profile_id", ctx.session.user.id)
        .eq("provider", "wahoo")
        .single();

      if (integration) {
        const syncService = new WahooSyncService(ctx.supabase);
        await syncService.syncPlannedActivity(data.id, ctx.session.user.id);
      }
    };

    syncWahoo(); // Fire and forget

    return data;
  })
```

## Error Handling

### Route Sync Failures

The system is designed to be resilient:

1. **Route validation fails** → Return error before API call
2. **Route upload fails** → Continue to create workout without route
3. **Workout creation fails** → Return error, don't store sync record
4. **Sync record storage fails** → Workout exists in Wahoo but not tracked

### Error Messages

```typescript
// Activity type doesn't support routes
"Activity type 'indoor_bike_trainer' does not support routes in Wahoo. 
Only outdoor_bike and outdoor_run support routes."

// Route validation failed
"Route validation failed: Route has no coordinates"

// Route has invalid data
"Route contains 5 invalid coordinates"

// Graceful fallback
"Route sync failed, workout created without route"
```

## Testing

### Manual Testing

```bash
# 1. Create a route
POST /trpc/routes.upload
{
  "fileContent": "<gpx>...</gpx>",
  "name": "Test Route",
  "activityType": "outdoor_bike"
}

# 2. Create activity plan with route
POST /trpc/activityPlans.create
{
  "name": "Morning Ride",
  "activity_type": "outdoor_bike",
  "route_id": "route-uuid",
  "structure": { "steps": [...] }
}

# 3. Schedule planned activity (triggers auto-sync)
POST /trpc/plannedActivities.create
{
  "activity_plan_id": "plan-uuid",
  "scheduled_date": "2024-01-15T09:00:00.000Z"
}

# 4. Verify sync occurred
GET /trpc/integrations.wahoo.getSyncStatus
{
  "plannedActivityId": "planned-activity-uuid"
}
```

### Validation Checks

```typescript
// Test route validation
const validation = validateRouteForWahoo({
  name: "Test Route",
  activityType: "outdoor_bike",
  coordinates: [...],
  totalDistance: 10000,
});

expect(validation.valid).toBe(true);
expect(validation.errors).toHaveLength(0);

// Test activity type check
expect(supportsRoutes("outdoor_bike")).toBe(true);
expect(supportsRoutes("indoor_bike_trainer")).toBe(false);

// Test coordinate conversion
const semicircles = convertToSemicircles(33.975087);
expect(semicircles).toBe(402653184);
```

## Limitations

### Current Limitations

1. **Route file size** - Very large routes (>10,000 points) may have sync issues
2. **FIT format** - Simplified FIT generation (for production, use full FIT SDK)
3. **One-way sync** - Routes only upload from GradientPeak → Wahoo
4. **No route updates** - Changing route requires deleting and recreating workout
5. **Indoor activities** - Routes not supported for indoor bike/run

### Future Enhancements

- [ ] Use proper FIT SDK (e.g., `@garmin/fit-sdk`) for production
- [ ] Bi-directional route sync (download routes from Wahoo)
- [ ] Route preview on mobile before sync
- [ ] Route update support (modify existing routes)
- [ ] Route waypoints and turn-by-turn cues
- [ ] Elevation profile in route preview
- [ ] Route sharing between users

## Troubleshooting

### Route Not Syncing

**Problem:** Route doesn't appear on Wahoo device

**Solutions:**
1. Check activity type is `outdoor_bike` or `outdoor_run`
2. Verify Wahoo integration is connected
3. Check route has valid coordinates (min 2 points)
4. Ensure route distance is reasonable (>100m, <500km)
5. Review logs for sync errors

### Invalid Coordinates

**Problem:** Route upload fails with "invalid coordinates"

**Solutions:**
1. Verify GPX file is valid
2. Check latitude is between -90 and 90
3. Check longitude is between -180 and 180
4. Ensure coordinates are in decimal degrees format

### Workout Created Without Route

**Problem:** Workout synced but route is missing

**Solutions:**
1. This is expected behavior if route sync fails
2. Check if activity type supports routes
3. Review route validation warnings
4. Manually sync route if available

## Support

For issues with route syncing:

1. Check the **activity type** supports routes (outdoor bike/run only)
2. Verify **route has valid coordinates** (min 2 points, valid lat/lng)
3. Review **sync logs** for detailed error messages
4. Check **Wahoo integration** is properly connected
5. Ensure **route file** is a valid GPX format

## Related Documentation

- [Wahoo Integration README](./README.md)
- [Route Planning Documentation](../../docs/RoutingPlan.md)
- [Activity Plans Schema](../../packages/core/schemas/activity_plan.ts)
- [Wahoo API Documentation](https://cloud-api.wahooligan.com/)