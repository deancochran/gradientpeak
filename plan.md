# Design Specification: The Reactive Recording Interface

**Project:** GradientPeak Mobile Application
**Module:** Activity Recording & Real-Time Dashboard
**Design Philosophy:** Context-Aware Reactivity & Single-Screen Immersion

## Introduction

This design specification defines the User Interface (UI) and User Experience (UX) for the GradientPeak recording screen. The interface adopts a **Single Vertical Stack Architecture** that is "reactive"—the UI automatically configures itself based on the user's immediate environment (Indoors vs. Outdoors), their intent (Structured Training vs. Free Riding), and their equipment (Bluetooth Sensors vs. GPS). The goal is to provide a single, engaging screen that provides the right information at the right time, anchored by a persistent, swipeable command center.

---

## 1. The Visual Hierarchy: The Three-Tier Dynamic Stack

The main recording view is constructed as a vertical stack divided into three logical zones. These zones are fluid; they mount, unmount, and resize based on the active configuration.

**Critical Principle:** Components only render when their required data is present. Empty or placeholder screens are avoided; instead, zones intelligently hide themselves or substitute alternative visualizations.

### Zone A: The Context Layer (Top Tier) — **CONDITIONAL**

The top section of the screen is reserved for spatial and environmental context. This zone follows strict conditional rendering rules:

#### Rendering Decision Logic:

**Note:** Outdoor activities always have GPS enabled. Indoor activities never use GPS, but can display virtual route following.

1. **Outdoor + Has Route**
   - ✅ **Render:** GPS Map with route overlay (blue polyline) and breadcrumb trail (red polyline)
   - Displays: User position marker, route progress percentage, grade overlay

2. **Outdoor + No Route**
   - ✅ **Render:** GPS Map with breadcrumb trail only (no route overlay)
   - Displays: User position marker, live heading, grade overlay

3. **Indoor + Has Route**
   - ✅ **Render:** GPS Map with route polyline (virtual activity)
   - Displays: Route path as polyline, virtual progress indicator that advances along route
   - Progress calculated from: Distance/speed data to show virtual position on route
   - Grade from route elevation updates FTMS machine resistance (unless manually overridden)
   - User can visually track progress along the route path during indoor activity

4. **Indoor + No Route + Has Power Sensor**
   - ✅ **Render:** Power Graph (full screen in zone)
   - Displays: Real-time power curve (last 60s), 3s/10s/30s average lines, current FTP zones

5. **Indoor + No Route + No Power Sensor + Has Heart Rate Sensor**
   - ✅ **Render:** Heart Rate Graph
   - Displays: Real-time HR curve, current HR zone, threshold markers

6. **Indoor + No Route + No Sensors**
   - ⚠️ **Render:** Compact empty state message
   - Message: "Connect sensors or load a route to visualize your workout"
   - This zone takes minimal space (~15% of screen), allowing Zone C to expand

**Summary:** Zone A only fully mounts when it has meaningful data to display. The priority order is: Map (outdoor/indoor with route) > Power Graph > Heart Rate Graph > Minimal Empty State.

### Zone B: The Guidance Layer (Middle Tier) — **STRICTLY CONDITIONAL**

This is the heart of the "Interval" functionality. This component is **only rendered when a workout plan is active**.

#### Rendering Decision Logic:

1. **Has Workout Plan (ActivityPlan)**
   - ✅ **Render:** Full Interval Card
   - Components:
     - **Donut Visualization:** Shows current step progress (circular progress ring)
     - **Current Step Display:** Target intensity (e.g., "200W" or "85% FTP"), duration remaining
     - **Next Step Preview:** Text showing "Up Next: 2min @ 150W"
     - **Workout Graph:** Horizontal bar visualization of entire workout with current step highlighted

2. **No Workout Plan**
   - ❌ **DO NOT RENDER** — Zone B completely unmounts
   - Behavior: Zone A and Zone C expand to fill the available space
   - This prevents visual clutter for free-form workouts

**Critical Rule:** Zone B has no fallback state. It either renders fully or not at all. This binary behavior ensures the interface stays clean for unstructured activities.

### Zone C: The Data Layer (Bottom Tier) — **ALWAYS VISIBLE**

The bottom section, sitting just above the footer, is the metric dashboard. This zone **always renders** regardless of configuration, as it displays real-time session data.

#### Rendering Behavior:

- **Always Mounted:** This zone never unmounts
- **Dynamic Content:** The metrics displayed adapt based on:
  - Zone B State (Plan active vs. no plan)
  - Available Sensors (power, HR, cadence, speed)
  - Activity Type (run, bike, swim)

#### Metric Display Rules:

1. **When Zone B is Active (Plan Exists):**
   - Display: Lap/Step-focused metrics
   - Metrics: Lap Duration, Lap Distance, Current Power (3s avg), Current HR, Lap Pace
   - Targeted metrics highlight in zone colors (green = in range, red = out of range)

2. **When Zone B is Hidden (No Plan):**
   - Display: Session-total metrics
   - Metrics: Total Duration, Total Distance, Avg Power, Avg HR, Avg Pace, Calories

3. **Metric Availability:**
   - If a sensor is not connected, show "--" placeholder
   - If activity type doesn't support metric (e.g., Power for running), hide that metric card entirely

**Adaptive Grid:** The metrics grid uses a 2-column flexbox layout that automatically reflows based on the number of available metrics (6-9 metrics typical).

---

## 1.5 Conditional Rendering Matrix (Implementation Reference)

This table provides a complete decision matrix for implementers:

| Configuration | Zone A | Zone B | Zone C |
|--------------|--------|--------|--------|
| Outdoor + Route + Plan | GPS Map w/ Route | Plan Card | Lap Metrics |
| Outdoor + Route + No Plan | GPS Map w/ Route | ❌ Hidden | Session Metrics |
| Outdoor + No Route + Plan | GPS Map (trail only) | Plan Card | Lap Metrics |
| Outdoor + No Route + No Plan | GPS Map (trail only) | ❌ Hidden | Session Metrics |
| Indoor + Route + Plan | Map w/ Route (virtual) | Plan Card | Lap Metrics |
| Indoor + Route + No Plan | Map w/ Route (virtual) | ❌ Hidden | Session Metrics |
| Indoor + No Route + Power + Plan | Power Graph | Plan Card | Lap Metrics |
| Indoor + No Route + Power + No Plan | Power Graph | ❌ Hidden | Session Metrics |
| Indoor + No Route + HR + Plan | Heart Rate Graph | Plan Card | Lap Metrics |
| Indoor + No Route + HR + No Plan | Heart Rate Graph | ❌ Hidden | Session Metrics |
| Indoor + No Route + No Sensors + Plan | Minimal Empty State | Plan Card | Lap Metrics |
| Indoor + No Route + No Sensors + No Plan | Minimal Empty State | ❌ Hidden | Session Metrics |

**Key Observations:**
- Zone B rendering is **only** dependent on whether a plan exists (binary decision)
- Zone A rendering follows a priority waterfall (Map with route > Power Graph > HR Graph > Empty)
- Zone C is **always** visible but changes content based on Zone B state
- Outdoor activities always have GPS enabled; indoor activities can show virtual route following
- The interface gracefully handles any combination of missing data

---

## 2. Interaction Model: Focus Mode & Minimize

Mobile screens offer limited real estate. To solve this, we introduce an "Expand to Focus" interaction model that allows the user to prioritize specific data without leaving the screen.

* **The Expansion:** If the user taps the **Map (Zone A)** or the **Interval Card (Zone B)**, that specific component smoothly animates to fill the majority of the screen.
* **The Constraint:** Crucially, this expansion **never covers the Control Footer**. The expanded view stops exactly at the top edge of the footer. This ensures that safety-critical controls (Pause/Lap) are never hidden behind a UI layer.
* **The Return:** When in "Focus Mode," a small, semi-transparent **Minimize Button** appears in the corner of the component. Tapping this (or the component itself) reverses the animation, shrinking the component back to its original slot in the three-tier stack.

---

## 3. The Anchor: The Swipeable Control Footer & Activity Selection

The footer is the most persistent element of the application. It acts as a split-level bottom sheet that manages both the recording state and the configuration settings. This component uses `@gorhom/bottom-sheet` or a similar library to provide smooth, native-feeling swipe interactions.

### Activity Category & Location Selection

Before the footer, there is an **Activity Category/Location Selection Button** positioned above the footer. This button:

* **Placement:** Fixed position above the collapsed footer
* **Visibility:** Only visible **before recording starts**. Once recording begins, this button disappears entirely
* **Coverage:** When the footer is expanded (dragged up), the expanded sheet covers this button. When collapsed, the button reappears
* **Function:** Opens a modal that allows the user to:
  - Select activity category (Run, Bike, Swim, etc.)
  - Select location (Indoor/Outdoor)
  - These selections must be made before starting the recording

### State 1: Collapsed (The Dashboard View)

In its default state, the footer sits at the bottom of the screen with a fixed height of **120-140px** (~15-18% of typical phone screens).

#### Layout:
* **Drag Handle:** Centered pill indicator (40px wide, 4px tall) at top of sheet
* **Primary Controls Row:** Recording controls that change based on recording state

#### Behavior:
* **Before Recording Starts (Not Recording):**
  - Shows: **Start Button** only (centered, full width)

* **While Recording:**
  - Shows: **Pause Button** (left/center) + **Lap Button** (right)
  - Activity Category/Location button is hidden

* **While Paused:**
  - Shows: **Resume Button** (left/center) + **Finish Button** (right)

### State 2: Expanded (The Configuration View)

When the user swipes up on the footer, the sheet smoothly animates to **50-60% of screen height**. The sheet has defined snap points at [Collapsed, Expanded].

#### Layout:
* **Pinned Controls (Top):** The recording control buttons (Start/Pause/Resume/Lap/Finish) remain visible and pinned to the top of the expanded sheet
* **Scrollable Configuration Menu (Below):**

**Configuration Options (List Items):**

1. **Route Management**
   - Icon: Map
   - Label: "Route"
   - Chevron: Right arrow
   - OnPress: Opens route picker modal (shows list of saved GPX routes)
   - **Conditional Visibility:** Always available
   - Current Route Display: Shows route name if attached, "No route selected" if none
   - **Functionality:** Allows user to:
     - Add a route to an activity that doesn't have one
     - Switch to a different route
     - Remove the active route
   - **Note:** Creating or editing routes is NOT part of this functionality

2. **Plan Management**
   - Icon: Calendar/Target
   - Label: "Plan"
   - Chevron: Right arrow
   - OnPress: Opens workout plan picker modal
   - **Conditional Visibility:** Always available
   - Current Plan Display: Shows plan name if attached, "Free-form workout" if none
   - **Functionality:** Allows user to:
     - Add a plan to an activity that doesn't have one
     - Switch to a different plan
     - Remove the active plan
   - **Quick Action:** If plan is active, shows "Skip Step" button inline
   - **Note:** Creating or editing plans is NOT part of this functionality

3. **Sensor Management**
   - Icon: Bluetooth
   - Label: "Sensors"
   - Chevron: Right arrow
   - OnPress: Navigates to /record/sensors screen
   - **Badge:** Shows count of connected/total sensors (e.g., "3/5")
   - **Inline Status:** Shows brief status: "All connected" (green), "1 disconnected" (yellow), "None connected" (gray)

4. **Smart Trainer Control** *(When FTMS Trainer Connected)*
   - Icon: Zap
   - Label: "Smart Trainer"
   - **Conditional Visibility:** Only shows when one or more FTMS trainers are connected
   - OnPress: Opens **FTMS Control Modal**
   - **Modal Structure:**
     - Horizontal scrollable tab list showing all connected FTMS machines
     - Defaults to first available machine
     - Each tab displays:
       - Machine name/identifier
       - Current mode (ERG / SIM / Resistance)
       - Current target value
     - **Controls per machine:**
       - Mode selector: ERG / SIM / Resistance (segmented control)
       - Target adjustment: +/- buttons with current value input
       - Auto/Manual toggle (when plan is active)
       - Live resistance/power readout

#### Behavior:
* **Swipe Down:** Returns to collapsed state
* **Tap Outside Sheet:** Does nothing (sheet requires explicit swipe or button press to dismiss, preventing accidental closes during workout)
* **Navigation:** Tapping configuration items opens modals/sheets **on top** of the recording screen, never navigating away (except for Sensor Management, which navigates to /record/sensors)
* **Control Persistence:** Recording controls always remain accessible at the top of the sheet
* **Activity Category/Location Button:** When footer is expanded, it covers the Activity Category/Location Selection button

### State Management Considerations:

* **Sheet State:** Managed by `BottomSheetModal` from `@gorhom/bottom-sheet` (preferred) or React Native Reanimated
* **Configuration Changes:** All changes made in the footer immediately trigger re-renders of Zone A/B/C
* **Real-time Updates:** Sensor connection status, trainer status, and plan progress update in real-time even when sheet is expanded
* **Activity Selection:** Activity category and location must be selected before recording starts. Once recording begins, these cannot be changed

**Critical Constraint:** This "Sheet" architecture means the user never navigates *away* from the recording screen (except for sensor management). They simply peek at settings, make an adjustment, and swipe the sheet back down. All modals and pickers are presented **on top** of the recording screen, maintaining context.

---

## 4. Implementation Constraints & Technical Feasibility

This section outlines the technical requirements and constraints to ensure the design is implementable and maintainable.

### 4.1 Data Requirements & Service Contracts

The ActivityRecorderService must expose the following reactive properties:

```typescript
// Activity Configuration (set before recording starts)
- activityCategory: 'run' | 'bike' | 'swim' | 'other'
- activityLocation: 'indoor' | 'outdoor'
  // Note: outdoor = GPS enabled, indoor = GPS disabled

// Zone A Decision Inputs
- currentPosition: { lat, lng, altitude, heading } | null (outdoor only)
- currentRoute: Route | null
- hasRoute: boolean
- virtualProgress: { distance: number, position: LatLng } | null (indoor + route)
- connectedSensors: Sensor[]
- hasPowerSensor: boolean
- hasHeartRateSensor: boolean

// Zone B Decision Inputs
- plan: ActivityPlan | null
- hasPlan: boolean
- currentStep: IntervalStep | null
- stepProgress: number (0-100)
- nextStep: IntervalStep | null

// Zone C Decision Inputs
- sessionStats: { duration, distance, calories, avgPower, avgHR }
- currentReadings: { power, heartRate, cadence, speed }
- recordingState: 'pending' | 'recording' | 'paused' | 'finished'

// FTMS Control
- ftmsDevices: FTMSDevice[]
- activeFTMSDevice: FTMSDevice | null
```

### 4.2 Component Architecture

```
RecordingScreen (index.tsx)
├── ZoneA (ContextLayer.tsx) - Conditional wrapper
│   ├── MapCard (outdoor, or indoor + route for virtual following)
│   ├── PowerGraphCard (indoor + power sensor, no route)
│   ├── HeartRateGraphCard (indoor + HR sensor, no route/power)
│   └── EmptyStateMessage (fallback)
├── ZoneB (PlanCard.tsx) - Conditionally mounted
│   ├── DonutVisualization
│   ├── WorkoutGraph
│   ├── CurrentStepDisplay
│   └── NextStepPreview
├── ZoneC (MetricsGrid.tsx) - Always mounted
│   └── MetricCard[] (dynamically filtered)
├── ActivitySelectionButton - Positioned above footer
│   └── Visible only before recording starts
└── SwipeableFooter (BottomSheet)
    ├── CollapsedControls (recording state dependent)
    └── ExpandedConfiguration
        ├── RouteManagement
        ├── PlanManagement
        ├── SensorManagement
        └── FTMSControl (conditional)
```

### 4.3 Performance Considerations

**Zone Mounting/Unmounting:**
- Zone transitions must use React's `key` prop to force remounting when switching between different Zone A components
- Use `React.memo` on all zone components to prevent unnecessary re-renders
- Zone B should use `AnimatePresence` (framer-motion) or similar to smoothly mount/unmount

**Map Performance:**
- Only render MapView when Zone A decides to show map
- Use `removeClippedSubviews={true}` on map component
- Throttle GPS updates to maximum 1 update per second for UI rendering

**Metrics Updates:**
- Sensor readings update at high frequency (multiple times per second)
- Use `useMemo` to compute derived metrics
- Batch UI updates to 60fps max (16.6ms intervals)

### 4.4 Edge Case Handling

**Scenario: GPS signal lost mid-workout (outdoor mode)**
- Solution: Keep showing map with last known position + "GPS Signal Lost" banner
- Zone A continues to display map, but position marker stops updating
- Breadcrumb trail remains visible showing historical path

**Scenario: User attaches route mid-workout (indoor activity)**
- Solution: Zone A switches to map view with route polyline
- Virtual position indicator appears and begins tracking from current distance/speed
- Route grade begins updating FTMS machine (if connected and in auto mode)
- Smooth animated transition (300ms ease-out)

**Scenario: User attaches plan mid-workout**
- Solution: Zone B smoothly animates into view (slide down from top of Zone C)
- Zone A and Zone C resize with animated transition (300ms ease-out)
- Current metrics transition from "Session" to "Lap" mode

**Scenario: User detaches/completes plan mid-workout**
- Solution: Zone B smoothly animates out (slide up, fade out)
- Zone A and Zone C expand with animated transition
- Metrics transition from "Lap" to "Session" mode

**Scenario: Sensor disconnects during workout**
- Solution:
  - If in Zone A (Power Graph or HR Graph), do NOT unmount the graph
  - Show "Sensor Disconnected" overlay on graph
  - Keep historical data visible
  - When sensor reconnects, overlay fades out

**Scenario: FTMS trainer disconnects during indoor workout**
- Solution:
  - Show "Trainer Disconnected" notification
  - If route is active, virtual position continues updating from speed/cadence sensors (if available)
  - User can continue workout without trainer control
  - When trainer reconnects, show notification and resume control

### 4.5 Layout Calculations

**Vertical Space Distribution (when all zones visible):**
- Status Bar: 44px (iOS), 24px (Android)
- Zone A: 35% of available height
- Zone B: 25% of available height (only when mounted)
- Zone C: 25% of available height (expands to 50% when Zone B hidden)
- Activity Selection Button: 56-64px (only visible before recording starts)
- Footer (Collapsed): 120-140px fixed
- Safe Area Bottom: 20-34px (device dependent)

**Focus Mode Calculations:**
- Expanded Zone: 100% of available height minus (Status Bar + Activity Selection Button [if visible] + Footer Collapsed + Safe Area)
- Non-expanded zones: Hidden (height: 0, opacity: 0)
- Transition: 400ms spring animation (damping: 0.8, stiffness: 100)

**Footer Expanded Calculations:**
- Expanded Footer: 50-60% of screen height
- When expanded, footer covers Activity Selection Button (if present)
- Zones A, B, C remain visible above the expanded footer

### 4.6 Accessibility Requirements

- All buttons must have minimum 44x44pt tap targets
- Color-coded zones (target range indicators) must also have text/icon indicators
- VoiceOver/TalkBack must announce zone transitions ("Plan view opened", "Map view opened")
- Footer sheet must be keyboard accessible for users with motor disabilities

---

## 5. Updated User Journey Examples

The result of this design is a fluid, reactive experience that adapts to context.

### Journey 1: Outdoor Unstructured Run
**Configuration:** Outdoor + No Route + No Plan

1. User opens recording screen → Sees **Activity Category/Location Selection Button** above footer
2. User taps button → Modal opens, selects "Run" and "Outdoor" → Modal closes
3. Screen shows: **GPS Map (Zone A)** + **Session Metrics (Zone C)** + **Activity Selection Button** + **Start Button** in footer
4. User taps "Start" → Activity Selection Button disappears, recording begins
5. Map shows live GPS position and breadcrumb trail
6. User swipes up footer → Sees configuration options (Route, Plan, Sensors), decides not to attach anything
7. User swipes down footer → Continues running, focusing on map and metrics
8. Throughout workout: **Zone B never appears** (clean, uncluttered interface)

### Journey 2: Indoor Structured Trainer Workout
**Configuration:** Indoor + No Route + Power Sensor + Plan

1. User opens recording screen → Selects "Bike" and "Indoor" from Activity Selection Button modal
2. User swipes up footer → Taps "Plan" → Selects "VO2 Max Intervals" → Swipes footer down
3. Screen shows: **Power Graph (Zone A)** + **Plan Card (Zone B)** + **Lap Metrics (Zone C)** + **Activity Selection Button** + **Start Button**
4. Zone B shows: "5min Warmup @ 120W, Next: 3min @ 250W"
5. User taps "Start" → Activity Selection Button disappears, plan begins
6. FTMS trainer (if connected) automatically sets to 120W (ERG mode)
7. As warmup completes → Zone B animates to show next interval, trainer adjusts to 250W
8. User wants to see power in detail → Taps Zone A (Power Graph) → Expands to full screen
9. User taps minimize → Returns to three-zone view
10. User swipes up footer → Taps "Smart Trainer" → Opens FTMS modal
11. User switches to Manual mode and adjusts resistance → Closes modal

### Journey 3: Outdoor Workout with Planned Route
**Configuration:** Outdoor + Route + No Plan

1. User opens recording screen → Selects "Bike" and "Outdoor" from Activity Selection Button modal
2. User swipes up footer → Taps "Route" → Selects "Mountain Loop" GPX route → Swipes footer down
3. Screen shows: **GPS Map with Route Overlay (Zone A)** + **Session Metrics (Zone C)** + **Activity Selection Button** + **Start Button**
4. Map displays blue route polyline overlaid on map
5. User taps "Start" → Activity Selection Button disappears, recording begins
6. Map shows blue route line, user's red breadcrumb trail, and position marker
7. Halfway through route → User taps map → Expands to full screen for better navigation
8. User approaches steep hill → Grade overlay shows "8.5%" in real-time
9. Throughout workout: **Zone B never appears** (user is following route, not interval plan)

### Journey 4: Mid-Workout Configuration Change
**Configuration:** Starts as Indoor + No Route + No Plan → Adds Plan Mid-Workout

1. User selects "Bike" and "Indoor" → Taps "Start" → Activity Selection Button disappears
2. User starts free-form indoor bike with power meter → Sees **Power Graph (Zone A)** + **Session Metrics (Zone C)**
3. 10 minutes in, user decides to do intervals → Swipes up footer
4. User taps "Plan" → Selects "VO2 Max Intervals" → Modal closes
5. **Zone B smoothly animates into view** (300ms transition)
6. Power Graph remains in Zone A, Zone C metrics switch from "Session" to "Lap" mode
7. Plan begins immediately from current time, user continues workout with structure
8. FTMS trainer (if connected) switches to ERG mode and begins following plan targets

### Journey 5: Indoor Virtual Route Riding
**Configuration:** Indoor + Route + Power Sensor + Plan

1. User selects "Bike" and "Indoor" from Activity Selection Button modal
2. User swipes up footer → Taps "Route" → Selects "Alpe d'Huez" GPX route
3. User taps "Plan" → Selects "Steady State Climb" interval plan → Swipes footer down
4. Screen shows: **Map with Route Polyline (Zone A)** + **Plan Card (Zone B)** + **Lap Metrics (Zone C)** + **Activity Selection Button** + **Start Button**
5. Zone A displays the route path as a polyline on map (virtual activity visualization)
6. Zone B shows interval targets: "10min @ 85% FTP, Next: 5min @ 200W"
7. User taps "Start" → Activity Selection Button disappears, recording begins
8. As user rides and accumulates distance/speed → Virtual position indicator moves along route polyline
9. Route grade updates FTMS trainer resistance automatically (ERG mode follows plan + grade adjustments)
10. User can see exactly where they are on the virtual route throughout the workout
11. Zone C shows: Power, HR, Cadence, Speed, Duration (lap-focused metrics)

**Common Thread:** In every journey, the recording controls (Pause/Lap/Resume/Finish) remain accessible at the exact same location. Users never navigate away from the recording screen (except to manage sensors). The interface adapts to their equipment and intent, showing only relevant information.

This is a UI that adapts to the athlete, rather than forcing the athlete to adapt to the UI.
