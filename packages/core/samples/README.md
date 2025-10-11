# GradientPeak Activity Plan Samples

This directory contains comprehensive sample workout plans for all supported activity types in the GradientPeak platform. These samples serve as templates for users and provide realistic examples for testing and development.

## Overview

The samples provide structured workout plans across 7 different activity types, with at least 5 different workouts per activity type, totaling **36 unique workout plans**.

## Activity Types & Workouts

### 🚴 Indoor Bike Trainer (6 workouts)
- **Sweet Spot Intervals** - 60min focusing on sweet spot power development
- **VO2 Max Development** - 75min with challenging VO2 max intervals
- **Active Recovery Ride** - 45min easy recovery ride
- **Sprint Power Development** - 35min neuromuscular power focus
- **Threshold Heart Rate Intervals** - 45min threshold HR training
- **Comprehensive Test** - 1min test workout for schema validation

### 🏃 Indoor Treadmill (5 workouts)
- **Threshold Run Development 1** - 50min threshold heart rate intervals
- **Threshold Run Development 2** - 60min progressive threshold session
- **Speed Intervals** - 40min high-intensity VO2 max development
- **Easy Recovery Run** - 30min low-intensity recovery
- **Hill Intervals** - 45min incline-based strength and power

### 🏃‍♂️ Outdoor Run (5 workouts)
- **Easy Aerobic Run** - 45min comfortable aerobic base building
- **Tempo Run** - 60min sustained tempo effort
- **5K Pace Intervals** - 55min high-intensity intervals at race pace
- **Long Steady Run** - 90min extended aerobic endurance
- **Fartlek Training** - 50min unstructured speed play

### 🚵 Outdoor Bike (5 workouts)
- **Easy Endurance Ride** - 60min comfortable aerobic ride
- **Sweet Spot Intervals** - 75min outdoor sweet spot power
- **Tempo Intervals** - 80min sustained tempo efforts
- **Climbing Intervals** - 70min high-intensity climbing work
- **Group Ride Simulation** - 90min variable intensity group dynamics

### 💪 Indoor Strength (5 workouts)
- **Upper Body Strength** - 45min comprehensive upper body training
- **Lower Body Strength** - 50min lower body strength and power
- **Full Body Circuit** - 40min high-intensity circuit training
- **Core and Stability** - 30min focused core strength
- **Functional Movement** - 35min movement patterns for daily life

### 🏊 Indoor Swim (5 workouts)
- **Easy Swim** - 45min comfortable continuous swim
- **Sprint Intervals** - 50min high-intensity sprint development
- **Threshold Set** - 60min sustained threshold efforts
- **Technique Focus** - 40min technical stroke mechanics
- **Endurance Set** - 75min long aerobic base building

### 🎯 Other Activities (5 workouts)
- **Yoga Flow** - 60min flexibility and mindfulness practice
- **Rock Climbing Session** - 90min climbing with warm-up and cool-down
- **Hiking Adventure** - 120min moderate-intensity hiking
- **CrossFit WOD** - 45min high-intensity workout of the day
- **Recovery Walk** - 45min gentle walking for active recovery

## Usage

### Import All Samples
```typescript
import { SAMPLE_ACTIVITIES } from "@gradientpeak/core/samples";
// Returns array with all 36 workout plans
```

### Import Specific Activity Type
```typescript
import { 
  SAMPLE_OUTDOOR_RUN_ACTIVITIES,
  SAMPLE_INDOOR_TRAINER_ACTIVITIES,
  // ... etc
} from "@gradientpeak/core/samples";
```

### Get Activities by Type
```typescript
import { getSampleActivitiesByType } from "@gradientpeak/core/samples";

const runWorkouts = getSampleActivitiesByType('outdoor_run');
const bikeWorkouts = getSampleActivitiesByType('indoor_bike_trainer');
```

### Access Type-Indexed Collection
```typescript
import { SAMPLE_ACTIVITIES_BY_TYPE } from "@gradientpeak/core/samples";

// Access workouts by activity type
const strengthWorkouts = SAMPLE_ACTIVITIES_BY_TYPE.indoor_strength;
const swimWorkouts = SAMPLE_ACTIVITIES_BY_TYPE.indoor_swim;
```

## Workout Structure

Each workout plan follows the `RecordingServiceActivityPlan` schema:

```typescript
interface RecordingServiceActivityPlan {
  version: string;
  name: string;
  description: string;
  activity_type: PublicActivityType;
  estimated_tss?: number;
  estimated_duration?: number; // in seconds
  structure: {
    steps: Array<WorkoutStep | RepetitionBlock>;
  };
}
```

### Step Types

1. **Simple Steps** - Single duration with targets and notes
2. **Repetition Blocks** - Repeated sets of steps for intervals
3. **Nested Structures** - Complex workouts with multiple phases

### Target Types

Workouts include various target intensities:
- `%FTP` - Percentage of Functional Threshold Power (cycling)
- `%ThresholdHR` - Percentage of Threshold Heart Rate (running/general)
- Power zones and heart rate zones

## Development

When adding new sample workouts:

1. Create workout constants following naming convention: `WORKOUT_NAME_TYPE`
2. Export individual workouts for direct access
3. Add to the appropriate `SAMPLE_<ACTIVITY>_ACTIVITIES` array
4. Ensure each activity type has at least 5 varied workouts
5. Include realistic TSS and duration estimates
6. Provide clear descriptions and notes for guidance

## Testing

These samples are used throughout the application for:
- UI component development and testing
- Activity recording simulation
- Compliance scoring validation
- Navigation flow testing
- API integration testing

## Notes

- All durations are specified in seconds
- Intensity targets are percentages (0-100+)
- Each workout includes detailed notes for user guidance
- Workouts range from recovery (TSS ~20) to high intensity (TSS ~95)
- Duration ranges from 30 minutes to 2 hours