# Enhanced Plan Card Components

A comprehensive workout plan visualization and management system for the GradientPeak mobile app.

## Overview

The Enhanced Plan Card provides a rich, interactive experience for viewing and following structured workout plans. It features visual workout profiles, real-time target guidance, progress tracking, and intelligent mode switching between preview and active workout views.

## Components

### Core Components

#### `EnhancedPlanCard`
The main component that orchestrates the entire plan experience.

**Features:**
- **Preview Mode**: Shows workout overview before starting
- **Active Mode**: Real-time guidance during workout execution
- **Automatic Mode Switching**: Transitions from preview to active when recording starts
- **Target vs Current Metrics**: Real-time comparison with visual indicators

**Props:**
```typescript
interface EnhancedPlanCardProps {
  planProgress?: PlannedActivityProgress;
  activityPlan?: RecordingServiceActivityPlan;
  state?: string; // recording state
  onNextStep?: () => void;
  isAdvancing?: boolean;
  service?: ActivityRecorderService;
  style?: { width: number };
  className?: string;
}
```

#### `WorkoutGraph`
Visual representation of the entire workout showing intensity profile over time.

**Features:**
- Color-coded intensity zones (Z1-Z5)
- Step duration proportional width
- Current step highlighting
- Interactive step selection
- Responsive design for different screen sizes

#### `WorkoutMetricsGrid`
Key workout statistics extracted from the plan structure.

**Displays:**
- Total duration
- Number of steps and intervals
- Average power target
- Estimated TSS and calories

### Visualization Components

#### `WorkoutProgressGraph`
Mini progress indicator showing completed/current/upcoming steps.

#### `TargetMetricsGrid`
Real-time target vs current metrics comparison with visual indicators.

**Features:**
- Color-coded zone adherence (green = in zone, yellow = close, red = off target)
- Target zone visualization
- Adherence percentage calculation
- Guidance text for corrections

#### `StepBreakdown`
Detailed view of workout steps with targets and descriptions.

#### `UpcomingStepsPreview`
Horizontal scrollable preview of next 3-4 intervals.

## Architecture

### Data Flow

```
ActivityPlanStructure (Zod Schema)
    ↓
flattenPlanSteps() → FlattenedStep[]
    ↓
extractWorkoutProfile() → WorkoutProfilePoint[]
    ↓
Visualization Components
```

### Service Integration

The components integrate with the ActivityRecorderService through:
- **Plan Manager**: Step advancement and progress tracking
- **Event System**: Real-time metric updates
- **Service Lifecycle**: Fresh instance management

### Mode Management

#### Preview Mode (Before Recording)
- Workout graph showing entire session
- Key metrics summary (duration, intervals, targets)
- Step breakdown preview
- Ready-to-start indicator

#### Active Mode (During Recording)
- Current step details with targets
- Real-time progress tracking (overall + step)
- Target vs current metrics with guidance
- Upcoming steps preview
- Next step advancement controls

## Key Features

### 🎯 Target Guidance System

Real-time comparison of current metrics vs workout targets:
- **Visual Indicators**: Color-coded zones and progress bars
- **Adherence Tracking**: Percentage-based target adherence
- **Guidance Text**: Specific instructions for corrections
- **Zone Visualization**: Target ranges with current value overlay

### 📊 Comprehensive Progress Tracking

**Big Picture:**
- Overall workout completion percentage
- Visual progress through workout graph
- Steps completed vs total steps

**Fine-Grained:**
- Current step progress (time-based or manual)
- Intensity zone adherence
- Real-time target achievement

### 🔄 Fixed Navigation Issues

**Problem Solved:** Next Step button accumulating clicks
**Solution:** 
- Debounced advancement with 500ms cooldown
- State management to prevent concurrent advances
- Visual feedback during advancement
- Event-driven progress updates

### 🎨 Rich Workout Visualization

**Workout Graph Features:**
- Intensity profile showing power/HR targets over time
- Color-coded zones (recovery, aerobic, threshold, VO2, neuromuscular)
- Proportional step widths based on duration
- Current position indicator
- Interactive step details

## Usage Examples

### Basic Implementation

```tsx
import { EnhancedPlanCard } from '@/components/plan';

<EnhancedPlanCard
  planProgress={planProgress}
  activityPlan={activityPlan}
  state={recordingState}
  onNextStep={handleNextStep}
  isAdvancing={isAdvancing}
  service={activityRecorderService}
/>
```

### Custom Workout Graph

```tsx
import { WorkoutGraph } from '@/components/plan';

<WorkoutGraph
  structure={activityPlan.structure}
  currentStep={currentStepIndex}
  onStepPress={(stepIndex) => navigateToStep(stepIndex)}
/>
```

### Target Metrics Display

```tsx
import { TargetMetricsGrid } from '@/components/plan';

<TargetMetricsGrid
  targets={currentStepTargets}
  currentMetrics={{
    heartRate: currentHR,
    power: currentPower,
    cadence: currentCadence
  }}
/>
```

## Utility Functions

### Plan Processing

- `flattenPlanSteps()`: Convert nested structure to sequential array
- `extractWorkoutProfile()`: Create visualization data points
- `calculateWorkoutStats()`: Compute comprehensive statistics

### Target Analysis

- `isValueInTargetRange()`: Check if current value meets target
- `calculateAdherence()`: Compute percentage adherence to target
- `getTargetGuidanceText()`: Generate user guidance text

### Formatting

- `formatDuration()`: Human-readable time formatting
- `formatTargetRange()`: Display target ranges with units
- `formatMetricValue()`: Consistent metric formatting

## Performance Optimizations

1. **Memoized Components**: All components use `React.memo` with proper display names
2. **Selective Re-renders**: Event-based metric updates only trigger affected components
3. **Efficient Data Processing**: Pre-computed workout profiles and statistics
4. **Debounced Interactions**: Prevents rapid button clicks and state changes

## Integration Points

### With Service Instance Management

The Enhanced Plan Card integrates seamlessly with the new service lifecycle:
- Receives fresh service instances for each recording session
- Handles service state transitions gracefully
- Cleans up event listeners properly

### With ActivityPlanStructure Schema

Leverages the rich Zod schema structure:
- **Steps**: Individual workout segments with targets
- **Repetitions**: Nested intervals with repeat counts
- **Targets**: Intensity zones (%FTP, %MaxHR, watts, etc.)
- **Duration**: Time, distance, or rep-based segments

## Testing

The components include comprehensive test coverage:
- Unit tests for utility functions
- Integration tests for component interactions
- Mock service implementations for testing
- Error handling and edge case coverage

## Future Enhancements

### Planned Features
- Audio cues for target zone changes
- Haptic feedback for zone adherence
- Custom workout plan creation
- Advanced analytics and insights
- Workout plan sharing and community features

### Performance Improvements
- WebWorker integration for heavy computations
- Virtual scrolling for long workout plans
- Offline plan caching and sync
- Advanced visualization options (3D graphs, heatmaps)