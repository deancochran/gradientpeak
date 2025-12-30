# Route Architecture Recommendations

## Current State Summary

### ✅ Correctly Implemented
- `activity_routes` table with proper metadata (polylines, elevation, distance, ascent/descent)
- `activity_plans.route_id` FK relationship (optional, nullable)
- `planned_activities` references plans only (no direct route relationship) - CORRECT
- Route upload/management UI and tRPC API
- Route selection in activity plan creation filtered by category

### ❌ Missing/Incomplete
- Routes not loaded during activity recording
- No route visualization during recording
- No turn-by-turn navigation
- No GPS track vs. planned route comparison
- Completed activities don't inherit route from plan

---

## Recommended Architecture for Full Route Integration

### 1. Data Model (Already Correct)

```
activity_routes (standalone route library)
    ↓
activity_plans.route_id (optional - for outdoor activities)
    ↓
planned_activities.activity_plan_id (inherits route through plan)
    ↓
activities.route_id (can be different if user went off-route)
```

**Key Principles:**
- Routes are reusable assets in a library
- Activity plans optionally reference routes
- Planned activities inherit route through the plan
- Completed activities can have a different route if user deviated
- Indoor activities don't need routes
- Structured workouts can be route-agnostic or route-specific

### 2. Activity Plan Types

Classify plans by their route requirements:

#### Type A: Indoor/No Route Required
```typescript
{
  name: "FTP Test",
  activity_category: "bike",
  activity_location: "indoor",
  route_id: null,
  structure: { intervals: [...] }  // Required
}
```

#### Type B: Outdoor Route-Agnostic
```typescript
{
  name: "Easy Run",
  activity_category: "run",
  activity_location: "outdoor",
  route_id: null,  // User can run anywhere
  structure: { intervals: [{ duration: { type: "time", seconds: 1800 } }] }
}
```

#### Type C: Outdoor Route-Specific
```typescript
{
  name: "Mountain Loop Ride",
  activity_category: "bike",
  activity_location: "outdoor",
  route_id: "uuid-of-route",  // Specific route with navigation
  structure: { intervals: [...] }  // Can be simple or complex
}
```

#### Type D: Route-Only (No Structured Intervals)
```typescript
{
  name: "Lake Trail Run",
  activity_category: "run",
  activity_location: "outdoor",
  route_id: "uuid-of-route",
  structure: null,  // Or auto-generated minimal structure
  description: "Scenic lake loop"
}
```

**Recommendation:** Allow structure to be null. Auto-generate minimal structure when starting recording if needed.

#### Type E: Description-Only (Casual Activity)
```typescript
{
  name: "Morning Swim",
  activity_category: "swim",
  activity_location: "outdoor",
  route_id: null,
  structure: null,
  description: "Easy 30 minute swim at the lake"
}
```

**Use Case:** Casual activities, recovery sessions, unstructured workouts.
**Recommendation:** Support completely flexible activities with just a name and description.

### 3. Recording Flow Enhancements

#### Phase 1: Route Display (Basic)
**When user starts recording with a plan that has a route:**

1. Load route from `activity_plans.route_id`
2. Fetch full coordinates via `trpc.routes.loadFull`
3. Display route polyline on map during recording
4. Show route stats (distance, elevation)
5. Display current position vs. route

**Implementation:**
```typescript
// In ActivityRecorder/index.ts
selectPlan(plan: RecordingServiceActivityPlan, plannedActivityId?: string) {
  // ... existing code ...
  
  if (plan.route_id) {
    this.loadRoute(plan.route_id);
  }
}

async loadRoute(routeId: string) {
  const route = await trpc.routes.loadFull.query({ id: routeId });
  this.currentRoute = route;
  this.metadata.hasRoute = true;
  // Emit event for UI to display route on map
}
```

**UI Changes:**
- Recording map shows planned route polyline in one color
- GPS track shows in different color
- User can see if they're on/off route visually

#### Phase 2: Turn-by-Turn Navigation (Advanced)
**For outdoor activities with routes:**

1. Calculate user's position relative to route
2. Detect upcoming turns (using bearing changes)
3. Provide audio/visual cues:
   - "Turn right in 100m"
   - "Stay straight"
   - "You're off route - 50m to left"
4. Recalculate distance to finish based on remaining route

**Implementation Considerations:**
- Use map matching algorithms (snap GPS to route)
- Pre-process route for turn detection
- Audio cues using expo-speech or react-native-tts
- Vibration for alerts

#### Phase 3: Route Deviation Handling (Advanced)
**When user goes off-route:**

Options:
1. **Continue with original route** - Show distance off-route, suggest return
2. **Auto-adjust route** - Recalculate route from current position
3. **Record actual path** - Save actual GPS track as new route

**Implementation:**
```typescript
// Check distance from route
const distanceFromRoute = calculateDistanceToPolyline(
  currentPosition,
  plannedRoute.coordinates
);

if (distanceFromRoute > 50) {  // 50m threshold
  this.emit('route-deviation', { distanceFromRoute });
}
```

### 4. Activity Submission Enhancement

**When completing a recording with a planned route:**

```typescript
// In useActivitySubmission.ts
const activity = {
  // ... existing fields ...
  route_id: plan?.route_id || null,  // Inherit from plan
  
  // Optional: Save actual GPS track as new route if significantly different
  route_deviation_meters: metadata.routeDeviation || null,
  route_completion_percentage: metadata.routeCompletion || null,
};

// If user went significantly off-route, offer to save actual track
if (metadata.routeDeviation > 500 || metadata.routeCompletion < 80) {
  Alert.alert(
    "Route Deviation Detected",
    "Your actual route was different from the plan. Save it as a new route?",
    [
      { text: "No, thanks", style: "cancel" },
      { text: "Save New Route", onPress: () => saveActualRouteAsNew() }
    ]
  );
}
```

### 5. Schema Adjustments

#### Make structure and description optional, add validation
```sql
-- Make structure nullable (for route-only or description-only plans)
ALTER TABLE activity_plans
ALTER COLUMN structure DROP NOT NULL;

-- Make description nullable (not all plans need descriptions)
ALTER TABLE activity_plans
ALTER COLUMN description DROP NOT NULL;

-- Ensure at least ONE of structure, route_id, or description exists
ALTER TABLE activity_plans
ADD CONSTRAINT activity_plans_has_content CHECK (
  structure IS NOT NULL OR 
  route_id IS NOT NULL OR 
  (description IS NOT NULL AND description != '')
);
```

**Rationale:** 
- Support route-only plans (just follow a route)
- Support description-only plans (casual activities)
- Prevent completely empty plans with the check constraint

#### Add route metadata to activities (optional)
```sql
ALTER TABLE activities
ADD COLUMN route_completion_percentage integer CHECK (route_completion_percentage >= 0 AND route_completion_percentage <= 100),
ADD COLUMN route_deviation_meters integer CHECK (route_deviation_meters >= 0);
```

**Rationale:** Track how well user followed planned route.

### 6. UI/UX Recommendations

#### Activity Plan Creation
```
┌─────────────────────────────────────┐
│ Create Activity Plan                │
├─────────────────────────────────────┤
│ Name: [Morning Ride         ]       │
│ Category: 🚴 Bike                   │
│ Location: ◉ Outdoor  ○ Indoor       │
│                                     │
│ ┌─ Structure ─────────────────────┐ │
│ │ [+ Add Warmup] [+ Add Interval] │ │
│ │ [+ Add Cooldown]                │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ Route (Optional) ──────────────┐ │
│ │ [ Select Route ▼ ]             │ │
│ │ or                              │ │
│ │ [ Upload GPX File ]             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Description (optional):             │
│ [________________________]          │
│                                     │
│ [ Save Plan ]                       │
└─────────────────────────────────────┘
```

**Flow Options:**

**Option 1: Start with Route**
1. User selects "Create plan from route"
2. Picks route from library or uploads GPX
3. System auto-generates basic structure (single "follow route" step)
4. User can add intervals on top (e.g., "sprint on hills")

**Option 2: Start with Structure**
1. User creates intervals first
2. Optionally adds route for outdoor execution
3. Route determines location context but not workout structure

**Recommendation:** Support both flows. Add a toggle:
- "Create from Route" → Route-first flow
- "Create from Template" → Structure-first flow

#### Recording Screen with Route
```
┌─────────────────────────────────────┐
│ 🚴 Mountain Loop Ride               │
├─────────────────────────────────────┤
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│ ┃  [MAP WITH ROUTE OVERLAY]      ┃  │
│ ┃  Blue line = planned route     ┃  │
│ ┃  Orange line = your track      ┃  │
│ ┃  • = current position          ┃  │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                                     │
│ Route Progress: 5.2 / 25.0 km      │
│ ██████░░░░░░░░░░░░░░░ 21%          │
│                                     │
│ Next Turn: 150m ↱ Right             │
│                                     │
│ Current Interval: Tempo (12 min)    │
│ Power: 245W (88% FTP) ✓             │
│                                     │
│ [ Pause ] [ Stop ]                  │
└─────────────────────────────────────┘
```

### 7. FTMS BLE Integration with Routes

**Indoor Training (Bike/Treadmill):**

When `activity_location = "indoor"` and FTMS connected:

```typescript
// No route needed, but can use route elevation for resistance
if (plan.route_id && ftmsConnected) {
  // Virtual ride mode
  const elevationProfile = await trpc.routes.loadFull({ id: plan.route_id });
  
  // Match resistance to elevation changes
  // If at km 5 and elevation is +5% grade → increase resistance
  const currentDistance = recorder.currentMetrics.distance;
  const targetGrade = interpolateGradeAtDistance(elevationProfile, currentDistance);
  
  await ftmsDevice.setTargetResistance(targetGrade);
}
```

**Use Cases:**
1. **Virtual Route Riding** - Use outdoor route's elevation on indoor trainer
2. **ERG Mode with Structure** - Ignore route, follow power targets from intervals
3. **Sim Mode** - Route elevation controls resistance, intervals control intensity

**Recommendation:** Add toggle in recording screen:
- "Follow Route Profile" - Use elevation for resistance
- "Follow Power Targets" - Ignore route, use interval targets
- "Hybrid" - Combine both (adjust power targets for elevation)

### 8. Implementation Priority

#### P0 (Must Have for MVP)
1. ✅ Route storage and upload (DONE)
2. ✅ Route selection in plan creation (DONE)
3. ✅ Route library management (DONE)
4. ⚠️ **Make description optional** (quick schema change)
5. ❌ **Load and display route during recording** (basic map overlay)

#### P1 (Important for Outdoor Users)
6. ❌ Inherit route_id from plan when completing activity
7. ❌ Route progress tracking (% complete, distance remaining)
8. ❌ Basic off-route detection (visual only, no alerts)
9. ❌ Route preview in activity plan detail screen

#### P2 (Enhanced Navigation)
10. ❌ Turn-by-turn navigation with audio cues
11. ❌ Route deviation alerts
12. ❌ Save actual GPS track as new route
13. ❌ Route comparison in activity analysis

#### P3 (Advanced Features)
14. ❌ Virtual route riding with FTMS (elevation → resistance)
15. ❌ Route recommendations based on history
16. ❌ Route sharing/social features
17. ❌ Multi-lap route detection and handling

---

## Specific Code Changes Needed

### 1. Make Description Optional
```sql
-- Migration file: 20251223_make_activity_plan_description_optional.sql
ALTER TABLE activity_plans
ALTER COLUMN description DROP NOT NULL;
```

```typescript
// packages/core/schemas/plan_builder_v2.ts
export const activityPlanCreateFormSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),  // Changed
  // ... rest
});
```

### 2. Pass Route to Recording Service
```typescript
// apps/mobile/lib/services/ActivityRecorder/types.ts
export interface RecordingServiceActivityPlan {
  name: string;
  activity_category: string;
  activity_location: string;
  structure: ActivityPlanStructureV2;
  route_id?: string | null;  // Add this
}

// apps/mobile/lib/services/ActivityRecorder/index.ts
selectActivityFromPayload(payload: ActivityPayload): void {
  if (payload.plan) {
    const plan: RecordingServiceActivityPlan = {
      name: payload.plan.name,
      activity_category: payload.plan.activity_category,
      activity_location: payload.plan.activity_location,
      structure: payload.plan.structure,
      route_id: payload.plan.route_id,  // Add this
    };
    this.selectPlan(plan, payload.plannedActivityId);
  }
}

selectPlan(
  plan: RecordingServiceActivityPlan,
  plannedActivityId?: string,
): void {
  // ... existing code ...
  
  // Load route if present
  if (plan.route_id) {
    this.loadAndDisplayRoute(plan.route_id);
  }
  
  // Update metadata
  this.metadata.hasRoute = !!plan.route_id;  // Fix the TODO
}

private async loadAndDisplayRoute(routeId: string): Promise<void> {
  try {
    const route = await trpc.routes.loadFull.query({ id: routeId });
    this.currentRoute = route;
    this.emit('route-loaded', route);
  } catch (error) {
    console.error('Failed to load route:', error);
    this.currentRoute = null;
  }
}
```

### 3. Inherit Route in Activity Submission
```typescript
// apps/mobile/lib/hooks/useActivitySubmission.ts
const activity = {
  // ... existing fields ...
  route_id: activityRecorder.currentPlan?.route_id || null,  // Changed
};
```

### 4. Display Route in Detail Screen
```typescript
// apps/mobile/app/(internal)/activity-plan-detail.tsx
{activityPlan.route_id && (
  <View className="bg-card border border-border rounded-xl p-4 mb-6">
    <View className="flex-row items-center mb-2">
      <Icon as={MapPin} size={16} className="text-muted-foreground mr-2" />
      <Text className="text-sm font-semibold">Route</Text>
    </View>
    
    {/* Add route details query and display */}
    <RoutePreview routeId={activityPlan.route_id} />
  </View>
)}
```

---

## Final Recommendations

### 1. **Keep your current data model** - It's correct!
- Routes on plans ✓
- Plans referenced by planned activities ✓
- Optional route_id ✓

### 2. **Make structure and description optional** - Schema changes implemented ✅
- Migration created: `20251223_make_activity_plan_flexible.sql`
- Schema updated with check constraint ensuring at least one of: structure, route, or description
- Form validation updated to support all edge cases

### 3. **Implement route display first** (P0)
- Load route when starting recording with a plan
- Show route polyline on map
- Track basic completion metrics

### 4. **Add navigation later** (P1/P2)
- Turn-by-turn is complex
- Start with visual route display
- Add audio cues in later iteration

### 5. **Consider simplified plan creation**
- Allow creating plans with just a route + name
- Auto-generate structure: single "follow route" interval
- Let users add intervals on top if desired

### 6. **FTMS + Routes is powerful**
- Virtual route riding is a killer feature
- Elevation profile → resistance adjustment
- Makes indoor training more engaging
- Implement after basic route display works

---

## Questions to Consider

1. **Should users be able to record without a plan but with a route?**
   - Example: "Just follow this route, no intervals"
   - Recommendation: Yes, allow starting recording with route only

2. **How to handle multi-lap routes?**
   - Detect when user completes route and starts again
   - Show lap counter
   - Recommendation: Add lap detection in P2

3. **What if user goes completely off-route?**
   - Still save activity with original route_id?
   - Or set route_id to null and save actual track?
   - Recommendation: Keep original route_id, add deviation metrics

4. **Should route completion metrics be separate fields or in metadata JSONB?**
   - Separate fields: easier to query, better performance
   - JSONB: more flexible, faster to add
   - Recommendation: Start with JSONB, move to columns if needed for querying

---

## Conclusion

Your architecture is **fundamentally sound**. The main gaps are in execution/integration:
- Routes exist but aren't used during recording
- Routes selected but not displayed
- Completed activities don't reference routes

Follow the P0 → P1 → P2 → P3 priority order above. Start with making description optional and loading routes during recording. Navigation and FTMS integration can come later once basic route display works.
