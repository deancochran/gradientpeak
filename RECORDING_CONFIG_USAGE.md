# Recording Configuration System - Usage Guide

## Overview

The recording configuration system automatically determines what UI should be shown and what automation should run based on:
- Activity type (outdoor run, indoor trainer, etc.)
- Recording mode (planned vs unplanned)
- Connected devices (FTMS trainer, sensors)
- Plan structure (has steps, route, etc.)
- GPS availability

This eliminates manual UI logic scattered across components and ensures users only see relevant features.

---

## Quick Start

### In Components

```typescript
import { useRecordingCapabilities } from '@/lib/hooks/useRecordingConfig'

function RecordingScreen() {
  const service = useSharedActivityRecorder()
  const capabilities = useRecordingCapabilities(service)
  
  return (
    <>
      {capabilities?.shouldShowMap && <MapCard />}
      {capabilities?.shouldShowSteps && <StepCarousel />}
      {capabilities?.shouldShowPowerTarget && <PowerTargetCard />}
      <MetricsCard />
    </>
  )
}
```

### Validation Before Recording

```typescript
import { useRecordingValidation } from '@/lib/hooks/useRecordingConfig'

function StartButton() {
  const service = useSharedActivityRecorder()
  const { isValid, errors, warnings } = useRecordingValidation(service)
  
  const handleStart = () => {
    if (!isValid) {
      // Show errors
      return
    }
    
    if (warnings.length > 0) {
      // Show warnings but allow proceeding
    }
    
    service.startRecording()
  }
}
```

---

## Capabilities Reference

### Data Collection
- `canTrackLocation` - GPS tracking available (outdoor activities with GPS enabled)
- `canTrackPower` - Power meter or FTMS trainer connected
- `canTrackHeartRate` - Heart rate monitor connected
- `canTrackCadence` - Cadence sensor connected

### UI Features
- `shouldShowMap` - Display map card (outdoor with GPS OR indoor with route visualization)
- `shouldShowSteps` - Display step carousel (structured plan exists)
- `shouldShowRouteOverlay` - Overlay route on map (outdoor + GPS + route)
- `shouldShowTurnByTurn` - Turn-by-turn navigation (outdoor + GPS + route)
- `shouldShowFollowAlong` - Follow-along mode (swim, other activities)
- `shouldShowPowerTarget` - Power target display (FTMS trainer + structured plan)

### Automation
- `canAutoAdvanceSteps` - Automatically advance steps when duration complete
- `canAutoControlTrainer` - Automatically apply power/resistance targets to FTMS trainer

### Navigation
- `primaryMetric` - Primary metric for the activity (`'time'` | `'distance'` | `'reps'` | `'power'`)

### Validation
- `isValid` - Configuration is valid, recording can start
- `errors` - Blocking errors (e.g., "GPS required for outdoor activities")
- `warnings` - Non-blocking warnings (e.g., "No sensors connected")

---

## Configuration Matrix Examples

### 1. Quick Treadmill Jog (Unplanned)
```typescript
Input: {
  activityType: 'indoor_treadmill',
  mode: 'unplanned',
  devices: { /* no devices */ },
  gpsAvailable: false
}

Result: {
  shouldShowMap: false          ✅ No map for indoor unplanned
  shouldShowSteps: false         ✅ No steps without plan
  shouldShowPowerTarget: false   ✅ No trainer control
  primaryMetric: 'time'
}
```

### 2. Outdoor Run with GPS and Plan
```typescript
Input: {
  activityType: 'outdoor_run',
  mode: 'planned',
  plan: {
    hasStructure: true,
    hasRoute: true,
    stepCount: 5
  },
  devices: { hasHeartRateMonitor: true },
  gpsAvailable: true
}

Result: {
  shouldShowMap: true            ✅ Outdoor + GPS
  shouldShowSteps: true           ✅ Has plan structure
  shouldShowRouteOverlay: true    ✅ Has route + GPS
  shouldShowTurnByTurn: true      ✅ Navigation available
  canAutoAdvanceSteps: true       ✅ Auto advance enabled
  canTrackHeartRate: true         ✅ HR monitor connected
  primaryMetric: 'distance'
}
```

### 3. Indoor Trainer with Structured Plan
```typescript
Input: {
  activityType: 'indoor_bike_trainer',
  mode: 'planned',
  plan: {
    hasStructure: true,
    stepCount: 10
  },
  devices: {
    ftmsTrainer: {
      deviceId: 'trainer-1',
      features: { powerTargetSettingSupported: true },
      autoControlEnabled: true
    },
    hasPowerMeter: true
  },
  gpsAvailable: false
}

Result: {
  shouldShowMap: false           ✅ Indoor without route
  shouldShowSteps: true           ✅ Has plan structure
  shouldShowPowerTarget: true     ✅ FTMS trainer + plan
  canAutoAdvanceSteps: true       ✅ Auto advance enabled
  canAutoControlTrainer: true     ✅ Auto ERG mode
  canTrackPower: true             ✅ Power meter available
  primaryMetric: 'power'
}
```

### 4. Indoor Trainer with Route Visualization
```typescript
Input: {
  activityType: 'indoor_bike_trainer',
  mode: 'planned',
  plan: {
    hasStructure: true,
    hasRoute: true  // Route for visualization only
  },
  devices: { ftmsTrainer: {...} },
  gpsAvailable: false
}

Result: {
  shouldShowMap: true            ✅ Show map for route viz
  shouldShowRouteOverlay: false   ✅ No GPS = no overlay
  shouldShowTurnByTurn: false     ✅ No navigation
  canTrackLocation: false         ✅ No GPS tracking
  primaryMetric: 'power'
}
```

---

## Validation Rules

### Blocking Errors
- **Outdoor activity without GPS**: "GPS is required for outdoor activities. Please enable location services."
- **Route navigation without GPS**: "Route navigation requires GPS."

### Warnings
- **Trainer auto-control without plan**: "Auto trainer control requires a structured plan. Control will be manual."
- **Planned activity without structure**: "Selected plan has no structure. Recording as unplanned."
- **No sensors for continuous activity**: "No sensors connected. Metrics will be limited."

---

## Adding New Activity Types

When adding a new activity type:

1. **Add to `activity_payload.ts`** helper functions if needed:
   ```typescript
   export function isNewActivityType(type: PublicActivityType): boolean {
     return type === 'new_activity'
   }
   ```

2. **Update resolver logic** in `recording-config-resolver.ts` if special handling needed:
   ```typescript
   if (isNewActivityType(input.activityType)) {
     // Special capability logic
   }
   ```

3. **Add tests** in `recording-config-resolver.test.ts`:
   ```typescript
   it('new activity type with specific config', () => {
     const input: RecordingConfigInput = { /* ... */ }
     const config = RecordingConfigResolver.resolve(input)
     expect(config.capabilities.shouldShowX).toBe(true)
   })
   ```

4. **UI automatically adapts** - no component changes needed!

---

## How It Works

### 1. Service Integration
`ActivityRecorderService.getRecordingConfiguration()` builds the input from current state:
- Current activity type
- Plan details (if any)
- Connected devices
- GPS status

### 2. Resolution
`RecordingConfigResolver.resolve()` computes capabilities:
```typescript
const config = service.getRecordingConfiguration()
// Returns: { input, capabilities }
```

### 3. React Hook
`useRecordingCapabilities()` subscribes to changes:
- Recomputes when activity selected
- Recomputes when plan selected/cleared
- Recomputes when devices connect/disconnect
- Recomputes when recording state changes

### 4. Component Rendering
Components query capabilities:
```typescript
{capabilities?.shouldShowMap && <MapCard />}
```

---

## Benefits

### For Users
✅ Only see relevant UI for their recording type
✅ No confusion from irrelevant features
✅ Clear error messages when something is wrong
✅ Automatic behavior (trainer control, step advance) just works

### For Developers
✅ Single source of truth for UI logic
✅ Easy to add new activity types
✅ Testable (50+ test cases)
✅ No scattered conditionals across components
✅ Clear validation rules

---

## Testing

Tests cover all major permutations:
- Outdoor activities (with/without GPS)
- Indoor activities (with/without plans, devices)
- Planned vs unplanned
- With/without sensors
- With/without structured plans
- Edge cases (missing GPS, no plan structure, etc.)

To run tests (when test runner is configured):
```bash
npm test -- recording-config-resolver.test.ts
```

---

## Migration Notes

### Before
```typescript
// Scattered conditional logic
const cardsConfig = useMemo(() => {
  const config = createDefaultCardsConfig()
  
  config.map.enabled = isOutdoorActivity
  config.plan.enabled = plan.hasPlan
  config.trainer.enabled = service?.sensorsManager.getControllableTrainer()?.isControllable ?? false
  
  return config
}, [isOutdoorActivity, plan.hasPlan, service])
```

### After
```typescript
// Capability-based
const capabilities = useRecordingCapabilities(service)
const cardsConfig = useMemo(() => {
  const config = createDefaultCardsConfig()
  
  if (!capabilities) return config
  
  config.map.enabled = capabilities.shouldShowMap
  config.plan.enabled = capabilities.shouldShowSteps
  config.trainer.enabled = capabilities.shouldShowPowerTarget
  config.power.enabled = capabilities.canTrackPower
  config.heartrate.enabled = capabilities.canTrackHeartRate
  
  return config
}, [capabilities])
```

**Result**: Simpler, centralized, and automatically handles all edge cases.

---

## Future Enhancements

Possible future additions:
- User preference overrides (e.g., "always show map even indoors")
- Configuration persistence (save user's preferred card order)
- Dynamic capability updates during recording (handle device disconnect gracefully)
- Custom automation rules for advanced users
- A/B testing different UI configurations

---

## Support

For issues or questions:
1. Check capabilities in React DevTools: `useRecordingCapabilities(service)`
2. Verify input: `service.getRecordingConfiguration().input`
3. Check validation: `useRecordingValidation(service)`
4. Review test cases in `recording-config-resolver.test.ts` for expected behavior
