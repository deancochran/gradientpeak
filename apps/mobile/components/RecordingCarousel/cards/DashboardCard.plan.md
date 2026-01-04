# Dashboard Card Implementation Plan

## Core Principles

1. **Unified Metric System**: No distinction between "primary" and "secondary" metrics. All metrics (power, HR, cadence, speed, distance, grade, calories, etc.) use the same component and styling system.

2. **Flexible Grid Layout**: Metrics use flexbox with 2-3 per row depending on screen width. Rows that overflow are completely hidden (no wrapping).

3. **Separation of Concerns**: Positioning/layout logic is separate from visual styling (text size, padding, margins).

4. **Content Fills Available Space**: The dashboard stretches to use every available pixel within the card.

## Layout Structure (Top to Bottom)

### 1. Adaptive Header Zone
**Conditional based on workout type - this is the ONLY conditional section:**

#### For Free-form Workouts:
- Large session timer showing elapsed time

#### For Structured Plans:
- Horizontal interval forecast bar showing all intervals:
  - Current interval highlighted
  - Segment height = intensity
  - Segment width = duration (proportional)
  - Time remaining displayed above/beside graph
- Interval progress section directly below forecast:
  - Countdown timer (time remaining in current interval)
  - Progress bar (visual completion percentage)

**Layout**: Full width, height determined by content

---

### 2. Flexible Metrics Grid
**Always visible for both workout types**

**Metric Component** (unified for all metrics):
- Icon
- Label
- Current value (large)
- Unit
- Optional: Target value (shown inline when metric is targeted)
- Optional: Border highlight (when metric is actively targeted)
- Optional: Status indicator (within/above/below target)

**Available Metrics**:
- Power (watts)
- Heart Rate (bpm)
- Cadence (rpm)
- Speed (km/h or mph)
- Distance (km or mi)
- Elevation/Grade (m or %)
- Calories (cal)
- Time elapsed (for structured workouts - session timer as regular metric)

**Grid Behavior**:
- Flexbox with wrap
- 2-3 metrics per row (responsive based on screenWidth)
- Each metric takes equal width in its row
- Consistent gap between metrics
- If a row would overflow beyond visible area, it's hidden entirely (overflow: hidden on parent)

**Target Indication** (for structured plans):
- When a metric (e.g., power) is targeted in current interval:
  - Border appears around that metric card
  - Target value shows below current value
  - Status color indicates if within/above/below range
- When metric is not targeted:
  - No border
  - No target text
  - Just current value display

**Layout**: 
- Parent container: `flex-1` to fill remaining space after adaptive header
- Flexbox row with wrap
- Overflow hidden

---

## Component Structure

```typescript
<DashboardCard>
  {/* 1. Adaptive Header - The ONLY conditional section */}
  {plan.hasPlan ? (
    <StructuredWorkoutHeader>
      <ActivityGraphView />  {/* Interval forecast */}
      <IntervalProgressSection>
        <CountdownTimer />
        <ProgressBar />
      </IntervalProgressSection>
    </StructuredWorkoutHeader>
  ) : (
    <FreeFormHeader>
      <SessionTimerLarge />  {/* Large elapsed time */}
    </FreeFormHeader>
  )}

  {/* 2. Flexible Metrics Grid - ALWAYS visible */}
  <MetricsGrid>
    <MetricCard metric="power" />
    <MetricCard metric="heartRate" />
    <MetricCard metric="cadence" />
    <MetricCard metric="speed" />
    <MetricCard metric="distance" />
    <MetricCard metric="calories" />
    {/* More metrics as needed, overflow hidden */}
  </MetricsGrid>
</DashboardCard>
```

## Metric Card Props

```typescript
interface MetricCardProps {
  metric: 'power' | 'heartRate' | 'cadence' | 'speed' | 'distance' | 'elevation' | 'calories' | 'time';
  currentValue?: number;
  target?: {
    value: number;
    unit: string;
    range?: [number, number];
  };
  isTargeted: boolean;  // Shows border + target text
  status?: 'within' | 'above' | 'below';  // For color indicators
}
```

## Responsive Grid Logic

```typescript
const metricsPerRow = screenWidth < 400 ? 2 : 3;
const metricWidth = `${100 / metricsPerRow}%`;

// Each metric card gets equal width
// Parent has overflow: hidden
// Rows beyond visible area are automatically hidden
```

## Styling Separation

**Components specify**:
- Flexbox properties (flex, flex-row, flex-wrap, items-center, justify-between, etc.)
- Layout constraints (flex-1, w-full, etc.)
- Gaps (gap-2, gap-3, gap-4)
- Overflow behavior (overflow-hidden)

**Styling constants handle**:
- Text sizes (text-xs, text-2xl, text-5xl)
- Padding (p-2, p-4, px-3)
- Margins (mb-2, mt-4)
- Colors (text-muted-foreground, bg-muted/20)
- Borders (border, border-2, rounded-lg)

**Implementation approach**:
- Use layout-focused classNames in component JSX
- Pull visual styling from constants file
- Apply visual styles via `className={STYLES.metricValue}` pattern

## Key Design Decisions

1. **Single Adaptive Header** - All workout-type-specific UI (forecast, progress, timer) lives in the header zone
2. **No primary/secondary distinction** - All metrics are equal, positioned by flex order
3. **Overflow handling** - Grid hides overflow rows instead of scrolling or wrapping poorly
4. **Responsive metrics per row** - Adapts to screen width (2-3 per row)
5. **Unified metric component** - One component handles all metric types
6. **Fill available space** - Grid takes `flex-1` to fill remaining space after adaptive header
7. **Separation of concerns** - Layout logic in components, visual styling in constants

---

## Open Questions for Implementation

1. **Metric Order**: What order should metrics appear? (e.g., power → HR → cadence → speed → distance → calories)

2. **Metric Selection**: Should users be able to customize which metrics show, or always show a fixed set?

3. **Screen Width Breakpoint**: At what screen width should we switch from 3 metrics/row to 2 metrics/row? (Currently suggesting 400px)

4. **Session Timer in Structured Plans**: For structured workouts, should session elapsed time:
   - Be hidden entirely (only show interval countdown in header)?
   - Appear as a regular metric card in the grid?
   - Both visible (interval countdown in header + elapsed time as metric)?

5. **Activity Graph Height**: Should the interval forecast bar have a fixed height or be proportional to available space?

6. **Overflow Behavior Confirmation**: Rows beyond the visible area should be completely hidden (no scrolling, no "show more" button) - correct?

7. **Visual Styling File**: Should dashboard-specific styles be added to existing `constants.ts` or create a new file?

8. **Metric Icons**: Should all metrics have icons, or just targeted ones?

9. **Target Display**: When multiple targets exist (e.g., power + HR), both metrics show borders and targets - correct?

10. **Progress Bar Style**: Should it be a thin line or a thicker bar with percentage text?
