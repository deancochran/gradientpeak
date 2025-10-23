# Recording Activity UI/UX Design Documentation

## Overview

This document outlines the structured, reactive UI/UX design for the GradientPeak mobile app's activity recording interface. The design emphasizes at-a-glance readability, sensor confirmation, and a clean organizational pattern for each card.

---

## Design Principles

1. **Reactive Display**: UI adapts based on activity type and plan selection
2. **Always Visible**: Cards display regardless of data availability (showing placeholders when needed)
3. **Hierarchical Layout**: Most important metrics are largest and positioned at the top
4. **Sensor Confirmation**: Visual feedback that sensors are ready before recording starts
5. **Consistent Structure**: Each card follows a predictable pattern for easy scanning

---

## Card Visibility Logic

### Rules

| Card | Display Condition | Always Visible |
|------|------------------|----------------|
| **Dashboard** | All times | ✅ |
| **Power** | All times | ✅ |
| **Heart Rate** | All times | ✅ |
| **Analysis** | All times | ✅ |
| **Elevation** | All times | ✅ |
| **Map** | Outdoor activities only | ✅ (when applicable) |
| **Plan** | When template/plan selected | ✅ (when applicable) |

### Implementation

```typescript
// Cards display reactively based on activity type and plan selection
const cards = useMemo((): CarouselCard[] => {
  const cardList: CarouselCard[] = ["dashboard"];

  // Always show core metric cards
  cardList.push("power");
  cardList.push("heartrate");
  cardList.push("analysis");
  cardList.push("elevation");

  // Map card - outdoor activities only
  if (isOutdoorActivity(activityType)) {
    cardList.push("map");
  }

  // Plan card - when template or user plan is selected
  if (activityPlan) {
    cardList.push("plan");
  }

  return cardList;
}, [activityType, activityPlan]);
```

---

## Card Structures

### 1. Dashboard Card

**Purpose**: Primary at-a-glance view of all key metrics during recording.

**Layout Structure**:
```
┌─────────────────────────────────┐
│         [Clock Icon]            │
│          DURATION               │
│         00:00:00                │  ← Large, dominant display
│                                 │
├─────────────────────────────────┤
│                                 │
│  [⚡]      [❤️]      [📊]      │  ← Top row: 3 metrics
│  Power   Heart    Cadence       │
│  n/a W   n/a bpm  n/a rpm      │
│                                 │
│  [🏃]      [📍]                 │  ← Bottom row: 2 metrics
│  Speed   Distance               │
│  n/a     n/a                    │
│                                 │
└─────────────────────────────────┘
```

**Key Metrics**:
1. **Elapsed Time** (top, largest) - Most critical metric
2. **Power (W)** - Current power output
3. **Heart Rate (bpm)** - Real-time heart rate
4. **Cadence (rpm)** - Pedaling/stride cadence
5. **Speed (km/h)** - Current speed
6. **Distance (km)** - Total distance covered

**States**:
- **Prepared** (`pending`/`ready`): Shows "n/a" placeholders, confirms sensors ready
- **Recording**: Shows live values or "n/a" when data unavailable
- **Paused**: Shows last recorded values

---

### 2. Power Card

**Purpose**: Detailed power metrics and zone distribution.

**Layout Structure**:
```
┌─────────────────────────────────┐
│ ⚡ Power            [LIVE/READY]│
├─────────────────────────────────┤
│                                 │
│            250                  │  ← Large current power
│            watts                │
│                                 │
├─────────────────────────────────┤
│   Avg    Max     NP             │  ← 3-metric grid
│   180    320     195            │
│                                 │
├─────────────────────────────────┤
│   Total Work: 1,234 kJ          │
│                                 │
│   Zone Distribution             │  ← Power zones chart
│   [████████░░░░░░░░░░]          │
│   Z1  Z2  Z3  Z4  Z5  Z6  Z7   │
│                                 │
└─────────────────────────────────┘
```

**Metrics**:
1. **Current Power** (top, largest) - Live watts
2. **Average Power** - Activity average
3. **Max Power** - Peak power reached
4. **Normalized Power (NP)** - Physiologically adjusted power
5. **Total Work** - Cumulative kilojoules
6. **Zone Distribution** - Time in each power zone

**Prepared State**:
- Shows "---" for current power
- Shows "--" for avg/max/NP
- Displays "Power Metrics Ready" message with checkmark

---

### 3. Heart Rate Card

**Purpose**: Comprehensive heart rate monitoring and zone analysis.

**Layout Structure**:
```
┌─────────────────────────────────┐
│ ❤️ Heart Rate       [LIVE/READY]│
├─────────────────────────────────┤
│                                 │
│            145                  │  ← Large current HR
│            bpm                  │
│      Zone 3 - Tempo             │
│                                 │
├─────────────────────────────────┤
│   Avg    Max     %              │  ← 3-metric grid
│   138    162     85%            │
│                                 │
├─────────────────────────────────┤
│   Zone Distribution             │  ← HR zones chart
│   Z1 [██░░░░░░░░░░] 5m          │
│   Z2 [████████░░░░] 12m         │
│   Z3 [████████████] 18m         │
│   Z4 [████░░░░░░░░] 3m          │
│   Z5 [░░░░░░░░░░░░] 0m          │
│                                 │
└─────────────────────────────────┘
```

**Metrics**:
1. **Current Heart Rate** (top, largest) - Live bpm with current zone
2. **Average HR** - Activity average
3. **Max HR** - Peak heart rate
4. **Threshold %** - Percentage of max HR
5. **Zone Distribution** - Time in each HR zone with progress bars
6. **Effort Level** - Qualitative description

**Prepared State**:
- Shows "---" for current HR
- Shows "--" for avg/max/%
- Displays "Heart Rate Monitoring Ready" message

---

### 4. Analysis Card

**Purpose**: Advanced performance metrics and training stress.

**Layout Structure**:
```
┌─────────────────────────────────┐
│ 📊 Analysis      [LIVE CALC]    │
├─────────────────────────────────┤
│                                 │
│            85                   │  ← Large TSS
│    Training Stress Score        │
│         ● Moderate              │
│                                 │
├─────────────────────────────────┤
│  Intensity     Variability      │  ← 2-metric grid
│  Factor (IF)   Index (VI)       │
│    0.85          1.03           │
│                                 │
├─────────────────────────────────┤
│  Duration: 01:23:45             │
│  Distance: 42.5 km              │
│                                 │
│  Plan Adherence: 92%            │
│  [████████████████░░]           │
│                                 │
└─────────────────────────────────┘
```

**Metrics**:
1. **Training Stress Score (TSS)** (top, largest) - Overall activity difficulty
2. **Intensity Factor (IF)** - Relative to FTP
3. **Variability Index (VI)** - Power consistency
4. **Efficiency Factor** - Watts per bpm
5. **Duration & Distance** - Activity progress
6. **Plan Adherence** - If following a plan

**Prepared State**:
- Shows "---" for TSS
- Shows "--" for IF/VI
- Displays "Analysis Engine Ready" message

---

### 5. Elevation Card

**Purpose**: Elevation tracking and gradient analysis.

**Layout Structure**:
```
┌─────────────────────────────────┐
│ ⛰️ Elevation           [GPS]     │
├─────────────────────────────────┤
│                                 │
│           342m                  │  ← Large current elevation
│      current elevation          │
│                                 │
├─────────────────────────────────┤
│  ↗️ Ascent  ↘️ Descent  Grade   │  ← 3-metric grid
│    245m      187m     +3.2%    │
│                                 │
├─────────────────────────────────┤
│  Current Grade: +5.2%           │
│  Moderate climb                 │
│  [████████░░░░░░░░░░]          │
│                                 │
│  Elevation Profile              │  ← Elevation chart
│  [Visual chart here]            │
│                                 │
└─────────────────────────────────┘
```

**Metrics**:
1. **Current Elevation** (top, largest) - Live altitude
2. **Total Ascent** - Cumulative climbing
3. **Total Descent** - Cumulative descending
4. **Average Grade** - Overall gradient
5. **Current Grade** - Real-time gradient with description
6. **Elevation Profile** - Visual chart of route elevation
7. **VAM** - Vertical ascent meters per hour (when climbing)

**Prepared State**:
- Shows "---" for current elevation
- Shows "--" for ascent/descent
- Displays "Elevation Tracking Ready" message

---

### 6. Map Card

**Purpose**: Visual GPS route tracking (outdoor activities only).

**Display Condition**: Only shown for outdoor activities:
- `outdoor_run`
- `outdoor_bike`
- `outdoor_walk`

**Layout Structure**:
```
┌─────────────────────────────────┐
│        [Map View Here]          │
│                                 │
│    Live GPS route display       │
│    with current position        │
│                                 │
│  📍 Location:                   │
│  37.7749° N, 122.4194° W        │
│  Altitude: 15m                  │
│                                 │
└─────────────────────────────────┘
```

**Features**:
- Real-time GPS tracking
- Route visualization
- Current location marker
- Altitude display
- Map interaction (zoom, pan)

---

### 7. Plan Card

**Purpose**: Structured activity guidance and progress tracking.

**Display Condition**: Only shown when:
- User selects a template activity plan, OR
- User selects a scheduled activity plan

**Layout Structure**:
```
┌─────────────────────────────────┐
│ 📋 Activity Plan                 │
│ "Tempo Intervals"               │
├─────────────────────────────────┤
│  Current Step: 3 of 5           │
│  ████████████░░░░░░             │
│                                 │
│  💪 Hard Effort                 │
│  Target: 250-280W               │
│  Duration: 5:00                 │
│  Time Remaining: 2:34           │
│                                 │
├─────────────────────────────────┤
│  Next: Recovery (2 min)         │
│  [Next Step →]                  │
│                                 │
└─────────────────────────────────┘
```

**Features**:
- Current step details
- Target metrics (power, HR, pace)
- Progress through plan
- Time remaining in current step
- Preview of next step
- Manual step advancement

---

## Unified State Behavior (Prepared State Removed)

### Purpose
Before recording starts, all cards show a "prepared state" that:
1. **Confirms sensors are connected and ready**
2. **Shows placeholder values** (n/a or ---)
3. **Provides visual feedback** (checkmarks, "READY" badges)
4. **Reassures the user** that data will appear when recording starts

### Visual Indicators
- ✅ Green checkmark with "READY" text
- Placeholder values in muted colors (30% opacity)
- Informative messages: "Waiting to start", "Sensors prepared"
- Icon-based status indicators

### Example Flow

**Before Recording**:
```
Power Card:
  ---    (large, muted)
  watts
  Waiting to start

  Avg: --  Max: --  NP: --

  ✅ Power Metrics Ready
```

**During Recording**:
```
Power Card:
  250    (large, bright yellow)
  watts
  🟢 LIVE

  Avg: 180  Max: 320  NP: 195

  [Zone distribution chart]
```

---

## Responsive Grid Patterns

### Dashboard Card Grid
```
┌─────────────────────────────────┐
│     TIME (5xl, centered)        │  Full width
├─────────────────────────────────┤
│   Metric1  Metric2  Metric3     │  3 columns
│   Metric4  Metric5              │  2 columns
└─────────────────────────────────┘
```

### Specialized Card Grid
```
┌─────────────────────────────────┐
│   PRIMARY METRIC (4xl)          │  Full width, dominant
├─────────────────────────────────┤
│   Stat1    Stat2    Stat3       │  3 columns (or 2)
├─────────────────────────────────┤
│   Additional Content            │  Charts, details
└─────────────────────────────────┘
```

---

## Color Scheme

### Metric Colors
- **Power**: Yellow (`text-yellow-500`)
- **Heart Rate**: Red (`text-red-500`)
- **Speed**: Green (`text-green-500`)
- **Distance**: Purple (`text-purple-500`)
- **Cadence**: Blue (`text-blue-500`)
- **Elevation**: Green (`text-green-600`)
- **Analysis**: Blue (`text-blue-500`)

### State Colors
- **Live/Active**: Green (`bg-green-500`)
- **Prepared/Ready**: Green with checkmark (`text-green-500`)
- **Paused**: Yellow (`bg-yellow-500`)
- **Error/Missing**: Red (`text-red-500`)
- **Placeholder**: Muted (`text-muted-foreground/50`)

---

## Typography Hierarchy

1. **Primary Value**: `text-5xl font-bold` - Most important metric
2. **Secondary Values**: `text-2xl font-bold` - Supporting metrics
3. **Tertiary Values**: `text-xl font-semibold` - Detail metrics
4. **Labels**: `text-xs text-muted-foreground uppercase tracking-wide`
5. **Descriptions**: `text-sm text-muted-foreground`

---

## Interaction Patterns

### Card Navigation
- Horizontal swipe to navigate between cards
- Tap card labels to jump directly
- Visual indicators show current card
- Smooth, paginated scrolling

### State Transitions
```
pending → ready → recording → paused → recording → finished
   ↓        ↓         ↓          ↓         ↓          ↓
Prepared  Ready    Active     Paused    Active    Complete
```

### Footer Controls
- **Pending**: [Start Activity] button (large, primary)
- **Recording**: [Pause Activity] + [Next Step] (if plan)
- **Paused**: [Resume] + [Finish] buttons
- **Finished**: Completion message with auto-redirect

---

## Accessibility Considerations

1. **High Contrast**: Values use bold weights and vivid colors
2. **Large Touch Targets**: Buttons are min 44pt
3. **Clear Hierarchy**: Size and position indicate importance
4. **Status Indicators**: Multiple cues (color, icon, text)
5. **Readable Units**: Always show measurement units
6. **Consistent Layout**: Same structure across all cards

---

## Implementation Notes

### State Management Simplification

**Removed Prepared State Logic:**
- Eliminated separate `isPrepared` checks in all card components
- Cards no longer conditionally render different layouts based on recording state
- Single, unified render path for all states (pending, recording, paused)
- Placeholder values (0 or n/a) automatically shown when metrics are undefined
- Visual differentiation achieved through opacity and color variants

**Benefits:**
- Reduced code complexity and maintenance burden
- Faster rendering (no conditional branching)
- Consistent user experience across all states
- Easier to reason about component behavior

### Performance Optimizations
- `useMemo` for card list to prevent unnecessary re-renders
- `memo` for individual card components
- Direct metric hooks (`useMetric`) to avoid object recreation
- Efficient re-rendering only when specific metrics change

### State Management
- Event-based hooks from `ActivityRecorderService`
- Granular subscriptions to individual metrics
- Separation of prepared vs active states
- Clean state transitions without flicker

### Code Organization
```
/app/record/
  index.tsx              ← Main modal with card carousel
  activity.tsx           ← Activity selection modal
  permissions.tsx        ← Permissions management
  sensors.tsx           ← Sensor connection UI

/components/dashboard/
  PowerCard.tsx         ← Power metrics card
  HeartRateCard.tsx     ← HR metrics card
  AnalysisCard.tsx      ← Analysis metrics card
  ElevationCard.tsx     ← Elevation metrics card

/components/plan/
  EnhancedPlanCard.tsx  ← Plan progress card
```

---

## Future Enhancements

1. **Customizable Card Order**: User preference for card sequence
2. **Metric Widgets**: Drag-and-drop metric arrangement
3. **Graph Overlays**: Real-time charts on cards
4. **Voice Feedback**: Audio cues for metrics and transitions
5. **Haptic Feedback**: Vibrations for zone changes or milestones
6. **Dark/Light Modes**: Theme-aware color schemes
7. **Split-Screen**: Multiple cards visible simultaneously on tablets

---

## Testing Checklist

- [ ] All cards display in prepared state before recording
- [ ] Cards show "n/a" placeholders when data unavailable
- [ ] Map card only appears for outdoor activities
- [ ] Plan card only appears when plan is selected
- [ ] Cards update in real-time during recording
- [ ] Smooth transitions between recording states
- [ ] Carousel navigation works correctly
- [ ] Card labels accurately reflect current position
- [ ] Footer buttons change appropriately per state
- [ ] Sensor connection status displays correctly

---

## Version History

- **v1.0** (Current): Initial structured UI implementation
  - Reactive card visibility
  - Hierarchical metric layouts
  - Prepared state indicators
  - Consistent design patterns across all cards

---

*Last Updated: 2024*
*Maintained by: GradientPeak Development Team*
