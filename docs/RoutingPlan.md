# GPS Routing Implementation Plan

**Status:** Planning Phase  
**Updated:** 2025-01-29

## Overview

Add Route route support to GradientPeak for structured workouts with GPS guidance.

**Core Architecture:**
- Routes stored in Supabase Storage (Route files) + metadata in `activity_routes` table
- Polyline encoding (Mapbox) for efficient preview (~300 bytes vs 150KB JSON)
- Routes referenced via `route_id` column in `activity_plans` table
- Full coordinates loaded at runtime only when recording starts

---

## Database Schema

### 1. `activity_routes` - Route Library

```sql
CREATE TABLE public.activity_routes (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    activity_type activity_type NOT NULL,
    file_path text NOT NULL,  -- Storage path to Route file
    
    -- Calculated from Route
    total_distance integer NOT NULL CHECK (total_distance >= 0),
    total_ascent integer CHECK (total_ascent >= 0),
    total_descent integer CHECK (total_descent >= 0),
    
    -- Encoded preview (~150-200 simplified points)
    polyline text NOT NULL,
    elevation_polyline text,
    
    source text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_routes_profile_id ON activity_routes(profile_id);
CREATE INDEX idx_routes_activity_type ON activity_routes(activity_type);
```

### 2. `activity_plans` - Add Route Reference

```sql
ALTER TABLE activity_plans 
ADD COLUMN route_id uuid REFERENCES activity_routes(id) ON DELETE SET NULL,
ADD COLUMN notes text;

CREATE INDEX idx_activity_plans_route_id ON activity_plans(route_id) 
    WHERE route_id IS NOT NULL;
```

**Key Benefits:**
- ✅ Easy plan duplication (copy entire record)
- ✅ Foreign key integrity
- ✅ `structure` JSONB stays focused on intervals only

### 3. `planned_activities` - Add Notes

```sql
ALTER TABLE planned_activities 
ADD COLUMN notes text;
```

**Creating scheduled activities is dead simple:**
```typescript
{
  activity_plan_id: "plan-uuid",
  scheduled_date: "2025-01-28",
  notes: "Easy pace today"  // Optional
}
```

Route automatically comes from `activity_plan.route_id`.

---

## Core Concepts

### Activity Plans with Optional Routes

Plans are reusable templates. Routes live at the DB column level:

```typescript
// Intervals only (indoor/outdoor)
{
  structure: { steps: [...intervals] },
  route_id: null
}

// Route only (outdoor freeform)
{
  structure: { steps: [] },
  route_id: "route-uuid"
}

// Both (outdoor structured)
{
  structure: { steps: [...intervals] },
  route_id: "route-uuid"
}
```

**Validation:** Must have `steps` OR `route_id` (enforced in Zod schema).

### Recording View Configuration

Map visibility depends on activity type and route:

| Activity Type | Has route_id | Show Map | Show Route Overlay | Navigation |
|--------------|--------------|----------|-------------------|------------|
| Indoor Bike/Run | ❌ | ❌ | ❌ | Steps only |
| Indoor Bike/Run | ✅ | ✅ | ✅ | Follow route visually* |
| Outdoor Bike/Run | ❌ | ✅ | ❌ | GPS tracking only |
| Outdoor Bike/Run | ✅ | ✅ | ✅ | Turn-by-turn navigation** |

**Notes:**
- *Indoor + Route: Map shows route progress but no turn-by-turn (future: send grade to smart trainer)
- **Outdoor + Route: Full GPS navigation with turn-by-turn cues
- Step carousel shows if `structure.steps` exists

---

## Implementation

### Phase 1: Backend (1-2 weeks)

#### Dependencies
```bash
npm install @mapbox/polyline @xmldom/xmldom
```

#### Files to Create

**`packages/core/utils/polyline.ts`**
```typescript
import polyline from '@mapbox/polyline';

export function encodePolyline(coordinates: LatLng[]): string;
export function decodePolyline(encoded: string): LatLng[];
export function simplifyCoordinates(coords: LatLngAlt[], tolerance?: number): LatLngAlt[];
export function calculateRouteStats(coords: LatLngAlt[]): {
  totalDistance: number;
  totalAscent: number;
  totalDescent: number;
};
```

**`packages/trpc/src/lib/routes/route-parser.ts`**
```typescript
export interface ParsedRoute {
  name?: string;
  coordinates: LatLngAlt[];
  metadata?: { author, time, bounds };
}

export function parseRoute(routeContent: string): ParsedRoute;
```

**`packages/trpc/src/routers/routes.ts`**
```typescript
export const routesRouter = createTRPCRouter({
  list: protectedProcedure.query(), // List with encoded polylines
  get: protectedProcedure.query(),  // Single route details
  loadFull: protectedProcedure.query(), // Load full Route for recording
  upload: protectedProcedure.mutation(), // Upload Route
  delete: protectedProcedure.mutation(),
});
```

#### Files to Modify

**`packages/core/schemas/activity_plan_structure.ts`**
```typescript
// Structure ONLY contains steps (no route reference)
export const activityPlanStructureSchema = z.object({
  steps: z.array(stepOrRepetitionSchema).max(50).optional(),
});

// Full plan schema with validation
export const activityPlanSchema = z.object({
  name: z.string().min(3).max(100),
  activity_type: activityTypeEnum,
  structure: activityPlanStructureSchema,
  route_id: z.string().uuid().optional(),  // DB column
  notes: z.string().optional(),
  estimated_duration: z.number().int().min(5).max(480),
  estimated_tss: z.number().int().nonnegative().max(500).nullable(),
}).refine(
  (data) => {
    const hasSteps = data.structure.steps && data.structure.steps.length > 0;
    const hasRoute = !!data.route_id;
    return hasSteps || hasRoute;
  },
  { message: "Plan must have steps, route, or both" }
);
```

**`packages/core/utils/plan-view-logic.ts`**
```typescript
export interface RecordingViewConfig {
  showMapCard: boolean;
  showStepCarousel: boolean;
  showRouteOverlay: boolean;
  showTurnByTurn: boolean;  // Only for outdoor + route
  primaryNavigation: 'steps' | 'distance' | 'time';
}

export function getRecordingViewConfig(
  activityType: ActivityType,
  structure: ActivityPlanStructure,
  routeId: string | null
): RecordingViewConfig {
  const hasSteps = !!(structure.steps && structure.steps.length > 0);
  const hasRoute = !!routeId;
  const isIndoor = activityType === 'indoor_run' || activityType === 'indoor_bike';
  const isOutdoor = activityType === 'outdoor_run' || activityType === 'outdoor_bike';
  
  // Indoor without route
  if (isIndoor && !hasRoute) {
    return {
      showMapCard: false,
      showStepCarousel: hasSteps,
      showRouteOverlay: false,
      showTurnByTurn: false,
      primaryNavigation: hasSteps ? 'steps' : 'time',
    };
  }
  
  // Indoor with route (visual guidance, no turn-by-turn)
  if (isIndoor && hasRoute) {
    return {
      showMapCard: true,
      showStepCarousel: hasSteps,
      showRouteOverlay: true,
      showTurnByTurn: false,  // No navigation for indoor
      primaryNavigation: hasSteps ? 'steps' : 'distance',
    };
  }
  
  // Outdoor without route
  if (isOutdoor && !hasRoute) {
    return {
      showMapCard: true,
      showStepCarousel: hasSteps,
      showRouteOverlay: false,
      showTurnByTurn: false,
      primaryNavigation: hasSteps ? 'steps' : 'time',
    };
  }
  
  // Outdoor with route (full turn-by-turn navigation)
  if (isOutdoor && hasRoute) {
    return {
      showMapCard: true,
      showStepCarousel: hasSteps,
      showRouteOverlay: true,
      showTurnByTurn: true,  // Enable navigation
      primaryNavigation: hasSteps ? 'steps' : 'distance',
    };
  }
  
  // Fallback
  return {
    showMapCard: false,
    showStepCarousel: hasSteps,
    showRouteOverlay: false,
    showTurnByTurn: false,
    primaryNavigation: 'time',
  };
}

export function canHaveRoute(activityType: ActivityType): boolean {
  return ['outdoor_run', 'outdoor_bike', 'indoor_run', 'indoor_bike'].includes(activityType);
}
```

---

### Phase 2: Mobile UI (1-2 weeks)

#### Route Management Screens

**`apps/mobile/app/(internal)/routes/upload.tsx`** (NEW)
- Document picker for Route files
- Preview map with statistics
- Name/description/activity type inputs

**`apps/mobile/app/(internal)/routes/index.tsx`** (NEW)
- List routes with map thumbnails
- Filter by activity type
- Edit/Delete actions

**`apps/mobile/app/(internal)/routes/[id].tsx`** (NEW)
- Full-screen route preview
- Elevation profile
- "Use in Plan" button

#### Plan Creation Integration

**`apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx`** (MODIFY)
```typescript
const CreateActivityPlanScreen = () => {
  const [selectedRoute, setSelectedRoute] = useState<RouteMetadata | null>(null);
  
  return (
    <ScrollView>
      {/* Step builder */}
      <StepBuilder steps={steps} onChange={setSteps} />
      
      {/* Route picker (for any activity type that supports routes) */}
      {canHaveRoute(activityType) && (
        <RouteSelector
          routes={routes}
          selected={selectedRoute}
          onSelect={setSelectedRoute}
        />
      )}
      
      <Button onPress={() => {
        createMutation.mutate({
          structure: { steps: steps.length > 0 ? steps : undefined },
          route_id: selectedRoute?.id,  // DB column
        });
      }}>
        Save Plan
      </Button>
    </ScrollView>
  );
};
```

#### Recording Flow

**`apps/mobile/app/(internal)/(tabs)/plan/index.tsx`** (MODIFY)
```typescript
const handleStartActivity = async (plannedActivity: any) => {
  const plan = plannedActivity.activity_plan;
  const routeId = plan.route_id;
  
  let loadedRoute = null;
  if (routeId) {
    const routeData = await trpc.routes.loadFull.query({ id: routeId });
    loadedRoute = {
      id: routeData.id,
      coordinates: routeData.coordinates,
      totalDistance: routeData.totalDistance,
    };
  }
  
  activitySelectionStore.setSelection({
    type: plan.activity_type,
    plan: plan,
    route: loadedRoute,
  });
  router.push('/record');
};
```

**`apps/mobile/app/(internal)/record/index.tsx`** (MODIFY)
```typescript
const RecordScreen = () => {
  useEffect(() => {
    const selection = activitySelectionStore.consumeSelection();
    
    const config = getRecordingViewConfig(
      selection.type,
      selection.plan.structure,
      selection.plan.route_id
    );
    
    setViewConfig(config);
    
    if (selection.route) {
      const encoded = encodePolyline(selection.route.coordinates);
      setRoutePolyline(encoded);
    }
  }, []);
  
  return (
    <RecordingCarousel
      config={viewConfig}
      routePolyline={routePolyline}
    />
  );
};
```

---

### Phase 3: Map Component (1 week)

#### Install Maps
```bash
npx expo install react-native-maps
```

#### Configure API Keys
```json
// app.json
{
  "expo": {
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "EXPO_PUBLIC_GOOGLE_API_KEY"
        }
      }
    }
  }
}
```

#### Map Card Implementation

**`apps/mobile/components/RecordingCarousel/cards/MapCard.tsx`** (REPLACE)
```typescript
import MapView, { Polyline, Marker } from 'react-native-maps';

interface MapCardProps {
  service: ActivityRecorderService;
  routePolyline?: string | null;
  showTurnByTurn: boolean;  // Only true for outdoor + route
}

export const MapCard = ({ service, routePolyline, showTurnByTurn }: MapCardProps) => {
  const [recordedPath, setRecordedPath] = useState<LatLng[]>([]);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  
  const routeCoordinates = useMemo(
    () => routePolyline ? decodePolyline(routePolyline) : null,
    [routePolyline]
  );
  
  useEffect(() => {
    const subscription = service.subscribe((state) => {
      if (state.location) {
        const newPoint = {
          latitude: state.location.coords.latitude,
          longitude: state.location.coords.longitude,
        };
        setUserLocation(newPoint);
        setRecordedPath(prev => [...prev, newPoint]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  
  return (
    <MapView
      region={userLocation}
      scrollEnabled={false}
      showsUserLocation={false}
    >
      {/* Planned route overlay (gray dashed) */}
      {routeCoordinates && (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#94a3b8"
          strokeWidth={4}
          lineDashPattern={[10, 10]}
        />
      )}
      
      {/* Recorded path (orange solid) */}
      {recordedPath.length > 1 && (
        <Polyline
          coordinates={recordedPath}
          strokeColor="#f97316"
          strokeWidth={4}
        />
      )}
      
      {/* User location marker */}
      {userLocation && (
        <Marker coordinate={userLocation} />
      )}
      
      {/* Turn-by-turn cues (only if showTurnByTurn) */}
      {showTurnByTurn && (
        <NavigationOverlay
          userLocation={userLocation}
          route={routeCoordinates}
        />
      )}
    </MapView>
  );
};
```

---

## Future Enhancements

### Smart Trainer Integration
- Parse elevation data from route Route
- Send grade updates to smart trainers via ANT+/Bluetooth
- Simulate outdoor route on indoor trainer

### Route Creation
- Draw routes directly in app
- Convert recorded activities to routes
- Import from Strava/Komoot

### Navigation Features
- Voice turn-by-turn directions
- Off-course alerts
- Breadcrumb navigation (reverse route)

---

## Implementation Checklist

### Sprint 1: Database & Core Utils
- [ ] Add `activity_routes` table to init.sql
- [ ] Add `route_id` and `notes` to `activity_plans`
- [ ] Add `notes` to `planned_activities`
- [ ] Run migration: `supabase db reset`
- [ ] Install dependencies: `@mapbox/polyline`, `@xmldom/xmldom`
- [ ] Create `packages/core/utils/polyline.ts`
- [ ] Test encode/decode functions

### Sprint 2: Backend API
- [ ] Create Route parser (`packages/trpc/src/lib/routes/route-parser.ts`)
- [ ] Create routes router (`packages/trpc/src/routers/routes.ts`)
- [ ] Update activity plan schema with `route_id` validation
- [ ] Create `plan-view-logic.ts` with corrected indoor/outdoor logic
- [ ] Test route upload and retrieval

### Sprint 3: Mobile UI - Route Management
- [ ] Create route upload screen
- [ ] Create route library screen
- [ ] Create route detail screen
- [ ] Test Route upload flow

### Sprint 4: Mobile UI - Plan Integration
- [ ] Add route picker to plan creation
- [ ] Update activity start flow to load routes
- [ ] Test creating plans with routes

### Sprint 5: Mobile UI - Recording
- [ ] Install and configure `react-native-maps`
- [ ] Implement MapCard with route overlay
- [ ] Add turn-by-turn logic for outdoor activities
- [ ] Test indoor vs outdoor map behavior
- [ ] Test on iOS and Android

---

## Key Technical Details

### Polyline Compression
- Raw JSON (5000 points): ~150KB
- Mapbox polyline (150 simplified points): ~300 bytes
- Compression: **500x smaller**

### Data Flow
```
Upload: GPX → Parse → Simplify → Encode → Store polyline in DB
Preview: DB polyline → Decode → Render map
Recording: Load full GPX → Parse all points → High-detail overlay
```

### Validation
Plans must have at least one of:
- `structure.steps` with items
- `route_id` defined

Enforced in `activityPlanSchema` with `.refine()`.

---

**Document Version:** 3.0  
**Last Updated:** 2025-01-29  
**Key Changes:** 
- Condensed document
- Fixed map visibility logic for indoor/outdoor activities
- Added turn-by-turn navigation flag
- Added future smart trainer integration notes
