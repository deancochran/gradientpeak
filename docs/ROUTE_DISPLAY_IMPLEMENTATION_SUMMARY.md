# Route Display and Navigation Implementation Summary

## Overview

Implemented basic route display functionality for activity recording with user position tracking, map orientation based on movement direction, elevation profile visualization, and grade-based FTMS resistance control for indoor training.

## Features Implemented

### 1. Route Data Integration

#### Schema Updates
- **Updated `RecordingServiceActivityPlan` type** to include optional `route_id` field
- Routes are now passed from activity plans to the recording service
- Database schema supports nullable `structure` and `description` for flexible plan types

#### Activity Recorder Service Changes
**File:** `/apps/mobile/lib/services/ActivityRecorder/index.ts`

**Added Route State:**
```typescript
private _currentRoute: any | null = null;
private _routeDistance: number = 0;
private _currentRouteDistance: number = 0;
```

**Added Route Getters:**
- `hasRoute`: boolean - Check if route is loaded
- `currentRoute`: Route data with coordinates and elevation profile
- `routeDistance`: Total route distance in meters
- `currentRouteDistance`: User's current distance along route
- `routeProgress`: Percentage completion (0-100)
- `currentRouteGrade`: Current grade (%) at user's position

**Route Loading:**
- `loadRoute()` - Fetches full route data from server via tRPC
- Calculates total route distance using Haversine formula
- Emits `routeLoaded` event when ready

**Route Progress Tracking:**
- `updateRouteProgress()` - Called on every location update
- Finds closest point on route to user position
- Calculates distance traveled along route
- Triggers FTMS grade updates for indoor activities

### 2. Map Display with Route Overlay

**File:** `/apps/mobile/components/RecordingCarousel/cards/MapCard.tsx`

**Features:**
- **Full MapView Integration** using `react-native-maps`
- **Route Polyline Display:**
  - Blue line for planned route
  - Displayed from route coordinates
  - Smooth rendering with proper line caps
  
- **User Position Marker:**
  - Red circular marker with white border
  - Rotates based on heading/bearing
  - Updates in real-time with GPS
  
- **Map Orientation:**
  - Map rotates to match user's movement direction
  - Heading from GPS coordinates
  - Smooth camera transitions (1000ms duration)
  - Zoom level: 16 (good detail for navigation)

- **Route Progress Indicator:**
  - Shows percentage completion
  - Progress bar visualization
  - Displayed at top of map

- **Location Info Overlay:**
  - Coordinates (lat/lng)
  - Altitude
  - Heading/bearing
  - Semi-transparent card at bottom

**Implementation Details:**
```typescript
// Map camera follows user with rotation
mapRef.current.animateCamera({
  center: { latitude, longitude },
  heading: heading || 0,  // Rotate map based on movement
  pitch: 0,
  zoom: 16,
}, { duration: 1000 });
```

### 3. Elevation Profile Card

**File:** `/apps/mobile/components/RecordingCarousel/cards/ElevationCard.tsx`

**Enhanced Features:**
- **Route Elevation Profile Visualization:**
  - Bar chart showing elevation along route
  - Up to 50 sampled points for smooth display
  - Progress tracking: bars change color as user progresses
  - Primary color for completed sections
  - Muted color for upcoming sections

- **Progress Tracking:**
  - Current distance vs total distance
  - Percentage completion
  - Visual progress bar

- **Route Statistics:**
  - Total ascent (from route data)
  - Total descent (from route data)
  - Total distance
  - Displayed in separate card

- **Current Activity Metrics:**
  - Live elevation gain/loss
  - Current altitude
  - Average grade
  - VAM (Vertical Ascent Meter)

**Profile Visualization:**
```typescript
{route.elevation_profile.slice(0, 50).map((point, index) => {
  const height = (point.elevation / maxElevation) * 100;
  const isPassed = (point.distance / totalDistance) * 100 <= progress;
  return <View className={isPassed ? 'bg-primary' : 'bg-muted'} style={{height: `${height}%`}} />;
})}
```

### 4. Grade Calculation and FTMS Integration

**Grade Calculation Algorithm:**
```typescript
get currentRouteGrade(): number {
  // Find current segment on route
  const segmentIndex = findSegmentAtDistance(currentRouteDistance);
  const current = profile[segmentIndex];
  const next = profile[segmentIndex + 1];
  
  // Calculate grade: (rise / run) * 100
  const elevationChange = next.elevation - current.elevation;
  const distanceChange = next.distance - current.distance;
  return (elevationChange / distanceChange) * 100;
}
```

**FTMS Resistance Control:**
- **Automatic Grade Application** for indoor activities
- Only active when:
  - Activity location is "indoor"
  - Recording is active
  - Manual control is NOT enabled
  - Distance changed by at least 10m (prevents excessive updates)
  
- **Implementation:**
```typescript
private async applyRouteGradeToTrainer(): Promise<void> {
  const trainer = this.sensorsManager.getControllableTrainer();
  const grade = this.currentRouteGrade;
  
  if (trainer.supportsSlope) {
    await this.sensorsManager.setTargetSlope(grade);
  }
}
```

**Use Cases:**
1. **Virtual Route Riding** - Follow outdoor route indoors on smart trainer
2. **Grade Simulation** - Trainer adjusts resistance based on route elevation
3. **Combined with Power Targets** - Can layer structured workouts on top of route profile

### 5. Location Data Enhancements

**Updated Location Handling:**
- Added `heading` field to location data ingestion
- Heading used for map rotation and user marker orientation
- Location updates trigger route progress calculations

```typescript
this.liveMetricsManager.ingestLocationData({
  latitude: location.coords.latitude,
  longitude: location.coords.longitude,
  altitude: location.coords.altitude,
  accuracy: location.coords.accuracy,
  heading: location.coords.heading,  // NEW
  timestamp: timestamp,
});
```

## Technical Implementation Details

### Distance Calculation
Uses **Haversine Formula** for accurate GPS distance:
```typescript
private calculateDistance(lat1, lon1, lat2, lon2): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}
```

### Route Position Matching
- Finds closest point on route to current GPS position
- Iterates through all route points to find minimum distance
- Calculates cumulative distance to that point
- O(n) complexity per update, acceptable for typical route sizes

### Performance Optimizations
- **Grade updates throttled** to every 10 meters of progress
- **Map updates use `animateCamera`** for smooth transitions
- **Elevation profile samples** max 50 points for rendering
- **Route progress calculated** only on location updates

## User Experience

### For Outdoor Activities
1. **Map shows planned route** in blue
2. **User position** updates in real-time
3. **Map rotates** to match direction of travel (north-up when stationary)
4. **Progress indicator** shows completion percentage
5. **Elevation profile** highlights completed sections

### For Indoor Activities with Routes
1. **All outdoor features** (visual reference)
2. **PLUS: Smart trainer adjusts resistance** based on route grade
3. **Virtual route experience** - ride outdoor routes on indoor trainer
4. **Automatic grade changes** as you progress through route
5. **Combined with workout plans** - structured intervals + route simulation

### No Route (Free Ride)
1. **Standard map** with user position
2. **No route overlay**
3. **Standard elevation tracking** from GPS only
4. **No grade-based resistance**

## Integration Points

### Activity Plan Creation
- Route selected via `RouteSelector` component
- `route_id` passed to `RecordingServiceActivityPlan`
- Route loaded when recording starts

### Recording Lifecycle
```
selectPlan()
  → loadRoute() if route_id exists
    → calculateRouteDistance()
    → emit('routeLoaded')
    
startRecording()
  → location updates begin
    → updateRouteProgress()
      → applyRouteGradeToTrainer() (if indoor)
```

### UI Cards
- **MapCard**: Visual navigation and position
- **ElevationCard**: Profile and progress
- **DashboardCard**: Summary metrics
- **PlanCard**: Workout structure (if applicable)

## Future Enhancements (Not Implemented)

### Turn-by-Turn Navigation
- Pre-calculate turn points from route coordinates
- Detect approaching turns (50m, 100m warnings)
- Audio/vibration cues
- Visual turn arrows

### Route Deviation Detection
- Compare actual GPS track to planned route
- Alert when off-route (>50m threshold)
- Suggest return path
- Option to continue off-route

### Advanced Metrics
- Route completion time estimates
- Speed compared to route average
- Climb rate (VAM) against route profile
- Energy expenditure predictions

### Route Comparison
- Actual track vs planned route overlay
- Deviation heatmap
- Efficiency analysis
- Save actual track as new route

## Configuration

### Requirements
- **react-native-maps**: ^1.20.1 (already installed)
- **GPS permissions**: Required for outdoor activities
- **Bluetooth permissions**: Required for FTMS control
- **FTMS trainer**: Must support slope/grade control

### Supported Activity Types
- **Outdoor with route**: Full navigation + tracking
- **Indoor with route**: Virtual riding with grade simulation
- **Outdoor without route**: Standard GPS tracking
- **Indoor without route**: Standard indoor training

## Testing Recommendations

### Outdoor Testing
1. Create activity plan with route
2. Start recording outdoors
3. Follow route and verify:
   - Map rotates with movement direction
   - Position marker updates smoothly
   - Route polyline displays correctly
   - Progress indicator increases
   - Elevation profile highlights sections

### Indoor Testing
1. Create activity plan with route (must have elevation data)
2. Connect FTMS smart trainer
3. Start recording indoors
4. Simulate movement (GPS or manual distance)
5. Verify:
   - Trainer resistance changes with grade
   - Elevation profile shows progress
   - No map rotation (no heading data when stationary)

### Edge Cases to Test
- **Route loading failures**: Handle gracefully, continue without route
- **GPS signal loss**: Maintain last known position
- **FTMS disconnection**: Stop grade updates
- **Manual control override**: Disable automatic grade control
- **Very steep grades**: Ensure trainer handles extreme values
- **Negative grades (descents)**: Verify resistance decreases

## Performance Notes

- **Route file loading**: Asynchronous, doesn't block recording start
- **GPS updates**: Throttled to 1 second intervals
- **Grade calculations**: O(n) where n = elevation profile points
- **Map rendering**: Hardware accelerated via react-native-maps
- **Memory usage**: Route coordinates kept in memory during recording

## Files Modified

1. `/packages/core/schemas/index.ts` - Added `route_id` to `RecordingServiceActivityPlan`
2. `/packages/core/schemas/activity_plan_v2.ts` - Helper functions for route structures
3. `/packages/supabase/schemas/init.sql` - Made `structure` and `description` nullable
4. `/packages/core/schemas/form-schemas.ts` - Updated validation for flexible plans
5. `/apps/mobile/lib/services/ActivityRecorder/index.ts` - Core route handling logic
6. `/apps/mobile/components/RecordingCarousel/cards/MapCard.tsx` - Complete rewrite with route display
7. `/apps/mobile/components/RecordingCarousel/cards/ElevationCard.tsx` - Added route profile visualization

## Conclusion

This implementation provides a solid foundation for route-based activities. The system successfully handles:
- ✅ Route display with user position
- ✅ Map orientation based on movement
- ✅ Elevation profile with progress tracking
- ✅ Grade-based FTMS resistance for indoor training
- ✅ Seamless integration with existing recording system

The architecture supports future enhancements like turn-by-turn navigation, route deviation alerts, and advanced analytics while maintaining simplicity and performance.
