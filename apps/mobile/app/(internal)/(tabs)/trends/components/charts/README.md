# Visual Charts Implementation for Trends Page

This directory contains the visual chart components that transform the text-based trends data into engaging visual analytics using charts and graphs.

## Overview

The charts were implemented as part of **Phase 2: Add Visual Charts** to enhance the GradientPeak mobile app's trends page with visual data representation.

## Chart Components

### 1. TrainingLoadChart.tsx
**Purpose**: Visualizes training load metrics (CTL, ATL, TSB) over time

**Features**:
- Line chart showing CTL (Chronic Training Load), ATL (Acute Training Load), and TSB (Training Stress Balance)
- Color-coded lines: Blue (CTL/Fitness), Yellow (ATL/Fatigue), Green/Red (TSB/Form)
- Shows last 30 days of data for optimal readability
- Current values display at bottom
- Legend with metric explanations

**Usage**: Used in the Overview tab to show training load progression over the selected time range.

### 2. WeeklyProgressChart.tsx
**Purpose**: Visualizes weekly TSS completion rates as a bar chart

**Features**:
- Bar chart showing completed TSS per week
- Color-coded bars based on completion status: Green (Good), Yellow (Warning), Red (Poor)
- Shows last 8 weeks for better readability
- Weekly completion rate indicators
- Summary statistics (average completion, best week, total TSS)

**Usage**: Used in the Weekly tab to show training plan adherence over recent weeks.

### 3. IntensityDistributionChart.tsx
**Purpose**: Visualizes training intensity distribution as a custom donut chart

**Features**:
- Custom SVG donut chart showing 7-zone intensity distribution
- Color-coded zones based on Intensity Factor (IF) ranges
- Interactive zone buttons with TSS breakdown
- Dominant zone display in chart center
- Training pattern insights and recommendations

**Usage**: Used in the Intensity tab to show training zone distribution and patterns.

## Implementation Details

### Technology Stack
- **React Native Chart Kit**: Used for line and bar charts (TrainingLoadChart, WeeklyProgressChart)
- **React Native SVG**: Used for custom donut chart implementation (IntensityDistributionChart)
- **TypeScript**: Full type safety with exported interfaces
- **NativeWind**: Tailwind CSS styling

### Data Integration
Charts integrate with existing tRPC queries:
- `getActualCurve`: Training load data for line chart
- `getWeeklySummary`: Weekly completion data for bar chart  
- `getIntensityDistribution`: Zone distribution data for donut chart

### Design Principles
- **Responsive**: Charts adapt to screen width
- **Accessible**: Clear legends, labels, and color coding
- **Performance**: Efficient rendering with data limiting (last N entries)
- **Consistent**: Unified styling with app design system
- **Interactive**: Clickable elements where appropriate

## File Structure

```
charts/
├── index.ts                           # Export all chart components and types
├── TrainingLoadChart.tsx              # Line chart for CTL/ATL/TSB over time
├── WeeklyProgressChart.tsx            # Bar chart for weekly TSS completion
├── IntensityDistributionChart.tsx     # Donut chart for intensity zones
└── README.md                          # This documentation
```

## Usage Example

```tsx
import {
  TrainingLoadChart,
  WeeklyProgressChart,
  IntensityDistributionChart,
  type TrainingLoadData
} from './trends/components/charts';

// Training Load Chart
<TrainingLoadChart
  data={actualCurve.dataPoints.map((point): TrainingLoadData => ({
    date: point.date,
    ctl: point.ctl || 0,
    atl: point.atl || 0,
    tsb: point.tsb || 0,
  }))}
  height={250}
/>

// Weekly Progress Chart
<WeeklyProgressChart
  data={weeklySummary}
  height={280}
/>

// Intensity Distribution Chart
<IntensityDistributionChart
  data={distributionPercent}
  totalTSS={totalTSS}
  onZonePress={(zoneKey) => {
    // Handle zone tap - navigate to filtered activities
    console.log("Pressed zone:", zoneKey);
  }}
  height={320}
/>
```

## Future Enhancements

1. **Interactive Drill-down**: Tap on chart elements to filter activities by date/zone
2. **Animation**: Add smooth transitions and loading states
3. **Comparison Views**: Compare periods (e.g., this month vs last month)
4. **Export**: Share charts as images or data
5. **Customization**: User preferences for chart types and time ranges

## Benefits

✅ **Enhanced User Experience**: Visual data is more engaging than text-based cards
✅ **Better Insights**: Trends and patterns are easier to identify visually  
✅ **Professional Look**: Charts give the app a more polished, fitness-focused appearance
✅ **Data Density**: More information displayed in less space
✅ **Actionable**: Visual cues help users understand their training patterns

The visual charts successfully transform the trends page from a text-heavy interface into an engaging, analytics-driven experience that helps users better understand their training progress and make informed decisions about their fitness journey.