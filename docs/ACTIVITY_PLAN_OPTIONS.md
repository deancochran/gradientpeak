# Activity Plan Configuration Options

## Complete Reference for All Activity Types

### Overview
Your activity plan structure supports comprehensive workout configuration across all activity types (outdoor bike, indoor trainer, run, swim, strength, etc.).

---

## Duration Options

### 1. **Time-Based**
```typescript
duration: {
  type: "time",
  value: number,  // 1-240
  unit: "seconds" | "minutes"
}
```
**Use for:** Most workouts  
**Example:** 10 minutes warm-up, 30 seconds sprint

### 2. **Distance-Based**
```typescript
duration: {
  type: "distance",
  value: number,  // any positive
  unit: "meters" | "km"
}
```
**Use for:** Outdoor runs/rides with GPS  
**Example:** 5 km run, 400 meter intervals

### 3. **Repetitions**
```typescript
duration: {
  type: "repetitions",
  value: number,  // any positive integer
  unit: "reps"
}
```
**Use for:** Strength training  
**Example:** 10 reps squats, 15 reps push-ups

### 4. **Until Finished**
```typescript
duration: "untilFinished"
```
**Use for:** Open-ended segments  
**Example:** Cool-down until ready

---

## Intensity Targets

### Supported Targets (Max 2 per step)

#### For Cycling (Outdoor Bike, Trainer)

**1. %FTP (Recommended)**
```typescript
{ type: "%FTP", intensity: 50-500 }
```
- **Sweet Spot**: 88-94% FTP
- **Threshold**: 95-105% FTP
- **VO2 Max**: 106-120% FTP
- **Recovery**: <55% FTP

**2. Watts (Absolute)**
```typescript
{ type: "watts", intensity: 0-5000 }
```
- **Use when:** Fixed power targets regardless of FTP
- **Example:** Hold 250W for intervals

**3. Cadence**
```typescript
{ type: "cadence", intensity: 0-300 }
```
- **Low cadence**: 50-70 rpm (strength work)
- **Normal**: 85-95 rpm
- **High cadence**: 100-120 rpm (efficiency drills)

**4. Speed**
```typescript
{ type: "speed", intensity: 0-100 }
```
- **Use for:** Outdoor rides with specific pace goals
- **Units:** km/h

#### For Running

**1. %MaxHR**
```typescript
{ type: "%MaxHR", intensity: 0-200 }
```
- **Recovery**: 60-70%
- **Easy**: 70-80%
- **Tempo**: 80-90%
- **Threshold**: 90-95%
- **Intervals**: 95-100%

**2. %ThresholdHR**
```typescript
{ type: "%ThresholdHR", intensity: 0-200 }
```
- **Better for:** Runners who know their lactate threshold HR
- **Z1 (Recovery)**: <80%
- **Z2 (Aerobic)**: 80-90%
- **Z3 (Tempo)**: 90-100%
- **Z4 (Threshold)**: 100-105%
- **Z5 (VO2)**: >105%

**3. Speed**
```typescript
{ type: "speed", intensity: 0-100 }
```
- **Use for:** Pace-specific workouts
- **Example:** 12 km/h for tempo run

**4. BPM (Absolute)**
```typescript
{ type: "bpm", intensity: 30-250 }
```
- **Use when:** Targeting specific heart rate zones
- **Example:** Hold 155 BPM for steady state

#### Universal (All Activity Types)

**RPE (Rate of Perceived Exertion)**
```typescript
{ type: "RPE", intensity: 1-10 }
```
- **1-2**: Very easy, conversational
- **3-4**: Easy, comfortable
- **5-6**: Moderate, breathing harder
- **7-8**: Hard, can speak short sentences
- **9-10**: Very hard to maximal effort

---

## Repeat Blocks

### Configuration
```typescript
{
  type: "repetition",
  repeat: 1-50,  // Number of times to repeat
  steps: [       // 1-20 steps per repetition
    { /* step config */ },
    { /* step config */ },
  ]
}
```

### Common Patterns

#### **Interval Training** (Outdoor Bike Example)
```typescript
{
  type: "repetition",
  repeat: 8,
  steps: [
    {
      name: "Hard",
      duration: { type: "time", value: 3, unit: "minutes" },
      targets: [
        { type: "%FTP", intensity: 105 },
        { type: "cadence", intensity: 90 }
      ]
    },
    {
      name: "Recovery",
      duration: { type: "time", value: 2, unit: "minutes" },
      targets: [
        { type: "%FTP", intensity: 50 }
      ]
    }
  ]
}
```

#### **Pyramid Intervals**
```typescript
{
  type: "repetition",
  repeat: 3,
  steps: [
    { name: "1 min hard", duration: { type: "time", value: 1, unit: "minutes" } },
    { name: "1 min easy", duration: { type: "time", value: 1, unit: "minutes" } },
    { name: "2 min hard", duration: { type: "time", value: 2, unit: "minutes" } },
    { name: "2 min easy", duration: { type: "time", value: 2, unit: "minutes" } },
    { name: "3 min hard", duration: { type: "time", value: 3, unit: "minutes" } },
    { name: "3 min easy", duration: { type: "time", value: 3, unit: "minutes" } },
  ]
}
```

---

## Complete Outdoor Bike Workout Example

```typescript
{
  steps: [
    // Warm-up
    {
      type: "step",
      name: "Warm-up",
      duration: { type: "time", value: 10, unit: "minutes" },
      targets: [
        { type: "%FTP", intensity: 55 },
        { type: "cadence", intensity: 85 }
      ]
    },
    
    // Build intervals
    {
      type: "step",
      name: "Build",
      duration: { type: "time", value: 5, unit: "minutes" },
      targets: [{ type: "%FTP", intensity: 75 }]
    },
    
    // Main set: 6x5min @ threshold with 3min recovery
    {
      type: "repetition",
      repeat: 6,
      steps: [
        {
          type: "step",
          name: "Threshold Interval",
          duration: { type: "time", value: 5, unit: "minutes" },
          targets: [
            { type: "%FTP", intensity: 100 },
            { type: "cadence", intensity: 90 }
          ]
        },
        {
          type: "step",
          name: "Recovery",
          duration: { type: "time", value: 3, unit: "minutes" },
          targets: [{ type: "%FTP", intensity: 50 }]
        }
      ]
    },
    
    // Cool-down
    {
      type: "step",
      name: "Cool-down",
      duration: { type: "time", value: 10, unit: "minutes" },
      targets: [{ type: "%FTP", intensity: 50 }]
    }
  ]
}
```

---

## Validation Rules

### Per Step
- ✅ 1-100 character name
- ✅ Optional duration (or "untilFinished")
- ✅ 0-2 intensity targets
- ✅ Optional notes (max 1000 chars)

### Per Repetition
- ✅ 1-50 repeat count
- ✅ 1-20 steps per repetition

### Per Plan
- ✅ Max 50 total items (steps + repetitions)
- ✅ Must have at least 1 step

---

## UI Access

### Creating a Repeat Block
1. Go to **Activity Plan** → **Edit Structure**
2. Tap **"+ Repeat"** button
3. Configure:
   - Number of repetitions (1-50)
   - Steps within the repeat (add/edit/reorder)
4. Each step supports full configuration:
   - Duration type & value
   - Up to 2 intensity targets
   - Notes

### Editing Steps in Repeat
1. Tap any step card within the repeat
2. Opens **Step Editor Dialog** with all options:
   - ✅ Step name
   - ✅ Duration (time/distance/reps/until finished)
   - ✅ Add up to 2 targets
   - ✅ Select target type (FTP/HR/watts/cadence/speed/RPE)
   - ✅ Set intensity value
   - ✅ Add notes

---

## Troubleshooting

### Issue: "Can't add repeat block to outdoor bike workout"
**Resolution:** You can! The UI supports all activity types. Steps:
1. Create activity plan with "Outdoor Bike" category
2. Tap "Edit Structure"
3. Tap "+ Repeat" button
4. Configure your intervals

### Issue: "Missing intensity options"
**Check:** All 8 intensity types are available in dropdown:
- %FTP ⭐ (recommended for cycling)
- %MaxHR
- %ThresholdHR
- Watts
- BPM
- Speed
- Cadence ⭐ (great for cycling drills)
- RPE

### Issue: "Can't set multiple targets"
**Resolution:** Each step supports up to 2 targets. Example for cycling:
- Target 1: %FTP (power)
- Target 2: Cadence (pedaling rhythm)

---

## Best Practices

### For Outdoor Bike Workouts

**Use %FTP when available:**
```typescript
{ type: "%FTP", intensity: 88 }  // Sweet spot
```

**Combine power + cadence for specificity:**
```typescript
targets: [
  { type: "%FTP", intensity: 95 },
  { type: "cadence", intensity: 90 }
]
```

**Structure with clear names:**
```typescript
{
  name: "VO2 Max Interval",
  duration: { type: "time", value: 4, unit: "minutes" },
  targets: [{ type: "%FTP", intensity: 110 }]
}
```

**Use repeat blocks for intervals:**
- Cleaner structure
- Easier to adjust (change repeat count vs editing 8 individual steps)
- Visual preview shows pattern clearly

---

## Summary

✅ **Everything is supported!**  
Your schema and UI provide complete configuration for all workout types including outdoor bike workouts with repeat blocks.

If you're experiencing a specific issue, please describe:
1. What you're trying to configure
2. What error/problem you're seeing
3. Screenshots if helpful

The system is fully capable - there may be a UI bug or workflow issue we can fix!
