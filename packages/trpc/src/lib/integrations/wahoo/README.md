# Wahoo Integration

This directory contains the complete implementation of the bidirectional sync between GradientPeak and Wahoo.

## Supported Activity Types

Wahoo only supports **cycling** and **running** activities with structured workout plans. The following activity types can be synced:

### ✅ Supported Activity Types
- `outdoor_bike` → Wahoo Outdoor Cycling
- `indoor_bike_trainer` → Wahoo Indoor Cycling
- `outdoor_run` → Wahoo Outdoor Running
- `indoor_treadmill` → Wahoo Indoor Running

### ❌ Unsupported Activity Types
The following activity types **cannot** be synced to Wahoo and will be automatically skipped:
- `indoor_strength` - Wahoo does not support structured strength training workouts
- `indoor_swim` - Wahoo does not support structured swimming workouts
- `other` - Generic activity type not supported

## How It Works

### Activity Type Validation

When a user attempts to sync a planned activity to Wahoo, the system:

1. **Checks activity type compatibility** (`isActivityTypeSupportedByWahoo()`)
   - If the activity type is not supported, returns an error immediately
   - No API calls are made to Wahoo
   - User receives a clear error message explaining why

2. **Validates plan structure** (`validateWahooCompatibility()`)
   - Ensures the workout has at least one interval
   - Warns if the workout is too long (>100 steps)
   - Warns about features Wahoo doesn't support well (multiple targets, RPE, etc.)

3. **Converts to Wahoo format** (`convertToWahooPlan()`)
   - Throws an error if activity type mapping fails
   - Converts intervals and targets to Wahoo's JSON format
   - Maps activity types to Wahoo's workout_type_family and workout_type_location

4. **Creates plan and workout** (only if all validations pass)
   - Creates plan in Wahoo's library
   - Creates workout on Wahoo's calendar
   - Stores sync record in database

### Error Messages

Users receive clear, actionable error messages:

```
Activity type 'indoor_strength' is not supported by Wahoo. 
Only cycling (outdoor_bike, indoor_bike_trainer) and running 
(outdoor_run, indoor_treadmill) activities can be synced to Wahoo.
```

## Architecture

### Files

- **`client.ts`** - Wahoo API client with typed responses
- **`plan-converter.ts`** - Converts GradientPeak plans to Wahoo format
- **`sync-service.ts`** - Orchestrates the sync process
- **`activity-importer.ts`** - Imports completed workouts from Wahoo webhooks
- **`/apps/web/src/app/api/webhooks/wahoo/route.ts`** - Webhook receiver endpoint

### Flow Diagrams

#### Outbound Sync (GradientPeak → Wahoo)
```
User schedules activity
    ↓
Check activity type supported? 
    ↓ (No - strength, swim, other)
    Return error: "Activity type not supported"
    
    ↓ (Yes - bike, run)
Check plan structure valid?
    ↓ (No - empty, too long)
    Return error: "Plan structure incompatible"
    
    ↓ (Yes)
Convert to Wahoo format
    ↓
Create plan in Wahoo library
    ↓
Create workout on Wahoo calendar
    ↓
Store sync record in database
```

#### Inbound Sync (Wahoo → GradientPeak)
```
User completes workout on Wahoo device
    ↓
Wahoo sends webhook to /api/webhooks/wahoo
    ↓
Verify HMAC signature
    ↓
Find GradientPeak user by external_id
    ↓
Check for duplicate (unique constraint)
    ↓
Find linked planned activity (if exists)
    ↓
Map metrics to GradientPeak schema
    ↓
Create activity record
```

## Activity Type Mapping

### GradientPeak → Wahoo

| GradientPeak Type | Wahoo Family | Wahoo Location | Wahoo Type ID |
|-------------------|--------------|----------------|---------------|
| `outdoor_bike` | 0 (Biking) | 1 (Outdoor) | 0 |
| `indoor_bike_trainer` | 0 (Biking) | 0 (Indoor) | 12 |
| `outdoor_run` | 1 (Running) | 1 (Outdoor) | 1 |
| `indoor_treadmill` | 1 (Running) | 0 (Indoor) | 5 |

### Wahoo → GradientPeak

| Wahoo Type ID | Description | GradientPeak Type |
|---------------|-------------|-------------------|
| 0 | BIKING OUTDOOR | `outdoor_bike` |
| 12 | INDOOR BIKING | `indoor_bike_trainer` |
| 1 | RUNNING OUTDOOR | `outdoor_run` |
| 5 | TREADMILL RUNNING | `indoor_treadmill` |

## API Client

### Return Types

All Wahoo API methods return fully-typed responses:

```typescript
// Create plan - returns full WahooPlan object
const plan: WahooPlan = await wahooClient.createPlan({...});
console.log(plan.id); // number (Wahoo plan ID)

// Create workout - returns full WahooWorkout object
const workout: WahooWorkout = await wahooClient.createWorkout({...});
console.log(workout.id); // number (Wahoo workout ID)

// Get user profile - returns full WahooUser object
const user: WahooUser = await wahooClient.getUserProfile();
console.log(user.id); // number (Wahoo user ID)
```

### ID Handling

- **Wahoo API**: Uses integer IDs (`id: number`)
- **GradientPeak Database**: Stores as text (`external_workout_id: text`)
- **Conversion**: `workout.id.toString()` when storing, `parseInt()` when calling API

## Configuration

### Environment Variables

```bash
# OAuth credentials
WAHOO_CLIENT_ID=your_client_id
WAHOO_CLIENT_SECRET=your_client_secret

# Webhook configuration
WAHOO_WEBHOOK_TOKEN=your_secure_random_token
```

### OAuth Scopes

```typescript
[
  "user_read",       // Read user profile
  "plans_write",     // Create workout plans
  "workouts_read",   // Read workout summaries
  "workouts_write",  // Create/update workouts
  "offline_data",    // Webhook access to completed data
  "routes_write",    // Optional - for future route support
]
```

## Testing

### Test Activity Type Validation

```typescript
import { isActivityTypeSupportedByWahoo } from "./plan-converter";

// Supported
console.log(isActivityTypeSupportedByWahoo("outdoor_bike")); // true
console.log(isActivityTypeSupportedByWahoo("indoor_bike_trainer")); // true
console.log(isActivityTypeSupportedByWahoo("outdoor_run")); // true
console.log(isActivityTypeSupportedByWahoo("indoor_treadmill")); // true

// Unsupported
console.log(isActivityTypeSupportedByWahoo("indoor_strength")); // false
console.log(isActivityTypeSupportedByWahoo("indoor_swim")); // false
console.log(isActivityTypeSupportedByWahoo("other")); // false
```

### Test Sync Service

```typescript
const syncService = new WahooSyncService(supabase);

// Try to sync a strength workout
const result = await syncService.syncPlannedActivity(
  strengthActivityId, 
  profileId
);

// Expected result:
{
  success: false,
  action: "no_change",
  error: "Activity type 'indoor_strength' is not supported by Wahoo. Only cycling (outdoor_bike, indoor_bike_trainer) and running (outdoor_run, indoor_treadmill) activities can be synced to Wahoo."
}
```

### Test Webhook Endpoint

```bash
# Check webhook status
curl https://yourdomain.com/api/webhooks/wahoo

# Expected response:
{
  "service": "Wahoo Webhook Receiver",
  "status": "active",
  "events": ["workout_summary"],
  "configured": true
}
```

## Metrics Mapping

### Wahoo → GradientPeak

| Wahoo Field | GradientPeak Field | Conversion |
|-------------|-------------------|------------|
| `distance_accum` | `distance` | meters → meters |
| `duration_active_accum` | `moving_time` | seconds → seconds |
| `duration_total_accum` | `elapsed_time` | seconds → seconds |
| `ascent_accum` | `total_ascent` | meters → meters |
| `calories_accum` | `calories` | kCal → kCal |
| `power_avg` | `avg_power` | watts → watts |
| `power_bike_np_last` | `normalized_power` | watts → watts |
| `power_bike_tss_last` | `training_stress_score` | TSS → TSS |
| `heart_rate_avg` | `avg_hr` | bpm → bpm |
| `cadence_avg` | `avg_cadence` | rpm → rpm |
| `speed_avg` | `avg_speed` | m/s → km/h (×3.6) |
| `work_accum` | `work` | joules → kilojoules (÷1000) |

## Error Handling

### Validation Errors

1. **Unsupported Activity Type**
   - Detected immediately, before any API calls
   - Returns clear error message
   - No data sent to Wahoo

2. **Empty Workout Structure**
   - Detected during compatibility validation
   - Returns error: "Workout has no intervals"
   - No plan created

3. **Invalid Plan Structure**
   - Caught during conversion
   - Returns specific warnings about incompatibilities
   - Plan creation may fail

### API Errors

- **401 Unauthorized**: Token expired (needs refresh)
- **429 Rate Limited**: Retry with exponential backoff
- **4xx Client Errors**: Don't retry (except 429)
- **5xx Server Errors**: Retry up to 3 times

### Webhook Errors

- **Always returns 200** to prevent retry storms
- Logs all errors internally
- Continues processing even on partial failures

## Future Enhancements

- [ ] UI badges showing sync status on planned activities
- [ ] Manual sync button for failed syncs
- [ ] Automatic token refresh on 401 responses
- [ ] Fetch actual workout start time from Wahoo API
- [ ] Support for workout notes/descriptions
- [ ] Bi-directional workout updates (edit synced workouts)
- [ ] Route/GPS data sync
- [ ] Power zone sync

## Support

For issues or questions about the Wahoo integration:
1. Check the error message for specific guidance
2. Verify activity type is supported (cycling or running only)
3. Ensure OAuth scopes are correct
4. Check webhook token is configured
5. Review logs for detailed error information
