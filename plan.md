# Design Specification: The Reactive Recording Interface

**Project:** ChainLinkSRM Mobile Application
**Module:** Activity Recording & Real-Time Dashboard
**Design Philosophy:** Context-Aware Reactivity & Single-Screen Immersion

## Introduction: The Shift from Navigation to Context

Traditional fitness tracking applications often suffer from "carousel fatigue," forcing users to swipe horizontally through multiple pages to access a map, then a music player, then data metrics. This creates friction during high-intensity effort. The new User Interface (UI) and User Experience (UX) design for the ChainLinkSRM recording screen eliminates this pagination entirely.

Instead, we are adopting a **Single Vertical Stack Architecture**. This interface is "reactive," meaning the UI is not a static template but a living layout that automatically configures itself based on the user’s immediate environment (Indoors vs. Outdoors), their intent (Structured Training vs. Free Riding), and their equipment (Bluetooth Sensors vs. GPS). The goal is to provide a single, engaging screen that provides the right information at the right time, anchored by a persistent, swipeable command center.

---

## 1. The Visual Hierarchy: The Three-Tier Dynamic Stack

The main recording view is constructed as a vertical stack divided into three logical zones. These zones are fluid; they mount, unmount, and resize based on the active configuration.

**Critical Principle:** Components only render when their required data is present. Empty or placeholder screens are avoided; instead, zones intelligently hide themselves or substitute alternative visualizations.

### Zone A: The Context Layer (Top Tier) — **CONDITIONAL**

The top section of the screen is reserved for spatial and environmental context. This zone follows strict conditional rendering rules:

#### Rendering Decision Logic:

1. **Outdoor + GPS Available + Has Route**
   - ✅ **Render:** GPS Map with route overlay (blue polyline) and breadcrumb trail (red polyline)
   - Displays: User position marker, route progress percentage, grade overlay

2. **Outdoor + GPS Available + No Route**
   - ✅ **Render:** GPS Map with breadcrumb trail only (no route overlay)
   - Displays: User position marker, live heading, grade overlay

3. **Outdoor + GPS Unavailable + Has Route**
   - ✅ **Render:** "Acquiring GPS" overlay on map with route preview
   - User sees planned route while waiting for GPS lock

4. **Outdoor + GPS Unavailable + No Route**
   - ✅ **Render:** "Acquiring GPS" message on default map location
   - Falls back to default coordinates until GPS acquired

5. **Indoor + Has Route + No Power Sensor**
   - ✅ **Render:** Elevation Profile of route
   - Displays: Route elevation chart with virtual progress indicator
   - User sees where they are on the route's elevation profile

6. **Indoor + Has Route + Has Power Sensor**
   - ✅ **Render:** Power Graph with route context
   - Displays: Real-time power curve (last 60s) with route grade overlay
   - Allows user to see power output in context of route terrain

7. **Indoor + No Route + Has Power Sensor**
   - ✅ **Render:** Power Graph (full screen in zone)
   - Displays: Real-time power curve, 3s/10s/30s average lines, current FTP zones

8. **Indoor + No Route + No Power Sensor + Has Heart Rate Sensor**
   - ✅ **Render:** Heart Rate Graph
   - Displays: Real-time HR curve, current HR zone, threshold markers

9. **Indoor + No Route + No Sensors**
   - ⚠️ **Render:** Compact empty state message
   - Message: "Connect sensors or load a route to visualize your workout"
   - This zone takes minimal space (~15% of screen), allowing Zone C to expand

**Summary:** Zone A only fully mounts when it has meaningful data to display. The priority order is: Map (outdoor) > Route Elevation > Power Graph > Heart Rate Graph > Minimal Empty State.

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
| Outdoor + GPS + Route + Plan | GPS Map w/ Route | Plan Card | Lap Metrics |
| Outdoor + GPS + Route + No Plan | GPS Map w/ Route | ❌ Hidden | Session Metrics |
| Outdoor + GPS + No Route + Plan | GPS Map (trail only) | Plan Card | Lap Metrics |
| Outdoor + GPS + No Route + No Plan | GPS Map (trail only) | ❌ Hidden | Session Metrics |
| Outdoor + No GPS + Route + Plan | GPS Acquiring + Route Preview | Plan Card | Lap Metrics |
| Outdoor + No GPS + No Route + Plan | GPS Acquiring Message | Plan Card | Lap Metrics |
| Indoor + Route + Power + Plan | Power Graph w/ Route Elevation | Plan Card | Lap Metrics |
| Indoor + Route + Power + No Plan | Power Graph w/ Route Elevation | ❌ Hidden | Session Metrics |
| Indoor + Route + No Power + Plan | Elevation Profile | Plan Card | Lap Metrics |
| Indoor + Route + No Power + No Plan | Elevation Profile | ❌ Hidden | Session Metrics |
| Indoor + No Route + Power + Plan | Power Graph | Plan Card | Lap Metrics |
| Indoor + No Route + Power + No Plan | Power Graph | ❌ Hidden | Session Metrics |
| Indoor + No Route + No Power + Plan | Minimal Empty State | Plan Card | Lap Metrics |
| Indoor + No Route + No Power + No Plan | Minimal Empty State | ❌ Hidden | Session Metrics |

**Key Observations:**
- Zone B rendering is **only** dependent on whether a plan exists (binary decision)
- Zone A rendering follows a priority waterfall (GPS Map > Elevation > Power > HR > Empty)
- Zone C is **always** visible but changes content based on Zone B state
- The interface gracefully handles any combination of missing data

---

## 2. Interaction Model: Focus Mode & Minimize

Mobile screens offer limited real estate. To solve this, we introduce an "Expand to Focus" interaction model that allows the user to prioritize specific data without leaving the screen.

* **The Expansion:** If the user taps the **Map (Zone A)** or the **Interval Card (Zone B)**, that specific component smoothly animates to fill the majority of the screen.
* **The Constraint:** Crucially, this expansion **never covers the Control Footer**. The expanded view stops exactly at the top edge of the footer. This ensures that safety-critical controls (Pause/Lap) are never hidden behind a UI layer.
* **The Return:** When in "Focus Mode," a small, semi-transparent **Minimize Button** appears in the corner of the component. Tapping this (or the component itself) reverses the animation, shrinking the component back to its original slot in the three-tier stack.

---

## 3. The Anchor: The Swipeable Control Footer

The footer is the most persistent element of the application. It acts as a split-level bottom sheet that manages both the recording state and the configuration settings. This component uses `@gorhom/bottom-sheet` or a similar library to provide smooth, native-feeling swipe interactions.

### State 1: Collapsed (The Dashboard View)

In its default state, the footer sits at the bottom of the screen with a fixed height of **120-140px** (~15-18% of typical phone screens).

#### Layout:
* **Drag Handle:** Centered pill indicator (40px wide, 4px tall) at top of sheet
* **Primary Controls Row:**
  - **Activity Type Icon** (left, 56px): Shows current activity icon (run/bike/swim), opens activity selector modal
  - **Start/Pause/Resume Button** (center, flex-grow): Large tap target (minimum 56px height), prominent primary color
  - **Lap Button** (right, 56px): Only visible when recording is active
  - **Sensors Button** (right, 56px): Bluetooth icon, badge shows connected sensor count

#### Behavior:
* **Before Recording Starts:** Shows Activity Type Icon + Start Button + Sensors Button
* **While Recording:** Shows Lap Button + Pause Button + Sensors Button (Activity Type Icon hidden to prevent accidental changes)
* **While Paused:** Shows Resume Button + Finish Button + Sensors Button

### State 2: Expanded (The Configuration View)

When the user swipes up on the footer, the sheet smoothly animates to **50-60% of screen height**. The sheet has defined snap points at [Collapsed, Expanded].

#### Layout:
* **Pinned Controls (Top):** The Start/Pause/Lap/Sensors buttons remain visible and pinned to the top of the expanded sheet
* **Scrollable Configuration Menu (Below):**

**Configuration Options (List Items):**

1. **Route Management**
   - Icon: Map
   - Label: "Attach/Change Route"
   - Chevron: Right arrow
   - OnPress: Opens route picker modal (shows list of saved GPX routes)
   - **Conditional Visibility:** Always available
   - Current Route Display: Shows route name if attached, "No route selected" if none

2. **Plan Management**
   - Icon: Calendar/Target
   - Label: "Attach/Edit Plan"
   - Chevron: Right arrow
   - OnPress: Opens workout plan picker modal
   - **Conditional Visibility:** Always available
   - Current Plan Display: Shows plan name if attached, "Free-form workout" if none
   - **Quick Action:** If plan is active, shows "Skip Step" button inline

3. **Sensor Management**
   - Icon: Bluetooth
   - Label: "Sensors"
   - Chevron: Right arrow
   - OnPress: Navigates to /record/sensors screen
   - **Badge:** Shows count of connected/total sensors (e.g., "3/5")
   - **Inline Status:** Shows brief status: "All connected" (green), "1 disconnected" (yellow), "None connected" (gray)

4. **Smart Trainer Control** *(Indoor Mode Only)*
   - Icon: Zap
   - Label: "Smart Trainer"
   - **Conditional Visibility:** Only shows when controllable trainer is connected
   - **Inline Controls:**
     - Mode selector: ERG / SIM / Resistance (segmented control)
     - Target adjustment: +/- buttons with current value
     - Auto/Manual toggle (when plan is active)
   - **Expanded View:** If user needs fine-tuned control, tapping opens dedicated trainer control modal

5. **Location Toggle** *(Plan Active Only)*
   - Icon: MapPin
   - Label: "Indoor/Outdoor Mode"
   - **Conditional Visibility:** Only shows when workout plan is attached (allows switching between indoor/outdoor without changing activity type)
   - Toggle Switch: Indoor ↔ Outdoor
   - **Purpose:** Allows user to take a planned workout (e.g., "Threshold Intervals") and do it either on a trainer (indoor) or outside (outdoor)

#### Behavior:
* **Swipe Down:** Returns to collapsed state
* **Tap Outside Sheet:** Does nothing (sheet requires explicit swipe or button press to dismiss, preventing accidental closes during workout)
* **Navigation:** Tapping configuration items opens modals/sheets **on top** of the recording screen, never navigating away
* **Control Persistence:** Recording controls always remain accessible at the top of the sheet

### State Management Considerations:

* **Sheet State:** Managed by `BottomSheetModal` from `@gorhom/bottom-sheet` (preferred) or React Native Reanimated
* **Configuration Changes:** All changes made in the footer immediately trigger re-renders of Zone A/B/C
* **Real-time Updates:** Sensor connection status, trainer status, and plan progress update in real-time even when sheet is expanded

**Critical Constraint:** This "Sheet" architecture means the user never navigates *away* from the recording screen. They simply peek at settings, make an adjustment, and swipe the sheet back down. All modals and pickers are presented **on top** of the recording screen, maintaining context.

---

## 4. Implementation Constraints & Technical Feasibility

This section outlines the technical requirements and constraints to ensure the design is implementable and maintainable.

### 4.1 Data Requirements & Service Contracts

The ActivityRecorderService must expose the following reactive properties:

```typescript
// Zone A Decision Inputs
- activityLocation: 'indoor' | 'outdoor'
- hasGPS: boolean
- currentPosition: { lat, lng, altitude, heading } | null
- currentRoute: Route | null
- hasRoute: boolean
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
```

### 4.2 Component Architecture

```
RecordingScreen (index.tsx)
├── ZoneA (ContextLayer.tsx) - Conditional wrapper
│   ├── MapCard (outdoor)
│   ├── ElevationCard (indoor + route)
│   ├── PowerGraphCard (indoor + power sensor)
│   ├── HeartRateGraphCard (indoor + HR sensor)
│   └── EmptyStateMessage (fallback)
├── ZoneB (PlanCard.tsx) - Conditionally mounted
│   ├── DonutVisualization
│   ├── WorkoutGraph
│   ├── CurrentStepDisplay
│   └── NextStepPreview
├── ZoneC (MetricsGrid.tsx) - Always mounted
│   └── MetricCard[] (dynamically filtered)
└── SwipeableFooter (BottomSheet)
    ├── CollapsedControls
    └── ExpandedConfiguration
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

**Scenario: User starts outdoor workout, then goes inside**
- Solution: Do NOT automatically switch to indoor mode
- Rationale: GPS still works for short periods indoors; auto-switching would be jarring
- User Control: User can manually toggle indoor/outdoor from expanded footer

**Scenario: GPS signal lost mid-workout (outdoor mode)**
- Solution: Keep showing map with last known position + "GPS Signal Lost" banner
- Zone A continues to display map, but position marker stops updating
- Breadcrumb trail remains visible showing historical path

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
  - If in Zone A (Power Graph), do NOT unmount the graph
  - Show "Sensor Disconnected" overlay on graph
  - Keep historical data visible
  - When sensor reconnects, overlay fades out

### 4.5 Layout Calculations

**Vertical Space Distribution (when all zones visible):**
- Status Bar: 44px (iOS), 24px (Android)
- Zone A: 35% of available height
- Zone B: 25% of available height (only when mounted)
- Zone C: 25% of available height (expands to 50% when Zone B hidden)
- Footer (Collapsed): 120-140px fixed
- Safe Area Bottom: 20-34px (device dependent)

**Focus Mode Calculations:**
- Expanded Zone: 100% of available height minus (Status Bar + Footer Collapsed + Safe Area)
- Non-expanded zones: Hidden (height: 0, opacity: 0)
- Transition: 400ms spring animation (damping: 0.8, stiffness: 100)

### 4.6 Accessibility Requirements

- All buttons must have minimum 44x44pt tap targets
- Color-coded zones (target range indicators) must also have text/icon indicators
- VoiceOver/TalkBack must announce zone transitions ("Plan view opened", "Map view opened")
- Footer sheet must be keyboard accessible for users with motor disabilities

---

## 5. Updated User Journey Examples

The result of this design is a fluid, reactive experience that adapts to context.

### Journey 1: Outdoor Unstructured Run
**Configuration:** Outdoor + GPS + No Route + No Plan

1. User opens recording screen → Sees **GPS Map (Zone A)** + **Session Metrics (Zone C)**
2. User taps "Start" → Recording begins, map shows live position and breadcrumb trail
3. User swipes up footer → Sees configuration options, decides not to attach plan
4. User swipes down footer → Continues running, focusing on map and metrics
5. Throughout workout: **Zone B never appears** (clean, uncluttered interface)

### Journey 2: Indoor Structured Trainer Workout
**Configuration:** Indoor + No Route + Power Sensor + Plan

1. User opens recording screen with pre-selected plan → Sees **Power Graph (Zone A)** + **Plan Card (Zone B)** + **Lap Metrics (Zone C)**
2. Zone B shows: "5min Warmup @ 120W, Next: 3min @ 250W"
3. User taps "Start" → Plan begins, trainer automatically sets to 120W (ERG mode)
4. As warmup completes → Zone B animates to show next interval, trainer adjusts to 250W
5. User wants to see power in detail → Taps Zone A (Power Graph) → Expands to full screen
6. User taps minimize → Returns to three-zone view
7. User swipes up footer → Adjusts trainer resistance manually (switches to Manual mode)

### Journey 3: Outdoor Workout with Planned Route
**Configuration:** Outdoor + GPS + Route + No Plan

1. User opens recording screen with pre-loaded GPX route → Sees **GPS Map with Route Overlay (Zone A)** + **Session Metrics (Zone C)**
2. User starts recording → Map shows blue route line, user's red breadcrumb trail, and position marker
3. Halfway through route → User taps map → Expands to full screen for better navigation
4. User approaches steep hill → Grade overlay shows "8.5%" in real-time
5. Throughout workout: **Zone B never appears** (user is following route, not interval plan)

### Journey 4: Mid-Workout Configuration Change
**Configuration:** Starts as Indoor + No Route + No Plan → Adds Plan Mid-Workout

1. User starts free-form indoor bike → Sees **Minimal Empty State (Zone A)** + **Session Metrics (Zone C)**
2. 10 minutes in, user decides to do intervals → Swipes up footer
3. User taps "Attach Plan" → Selects "VO2 Max Intervals"
4. **Zone B smoothly animates into view** (300ms transition)
5. Power Graph appears in Zone A (replaces empty state)
6. Zone C metrics switch from "Session" to "Lap" mode
7. Plan begins immediately from current time, user continues workout with structure

### Journey 5: Mixed Data Scenario
**Configuration:** Indoor + Route + No Power Sensor + Plan

1. User loads virtual route (e.g., "Alpe d'Huez") and interval plan
2. Sees **Elevation Profile (Zone A)** + **Plan Card (Zone B)** + **Lap Metrics (Zone C)**
3. Zone A shows elevation chart with current position marker
4. Zone B shows interval targets: "10min @ 85% FTP"
5. Zone C shows: HR, Cadence, Speed, Duration (no Power, since no sensor)
6. As user progresses → Virtual position marker moves up elevation profile in sync with distance

**Common Thread:** In every journey, the **Pause Button** remains accessible at the exact same location. Users never navigate away from the recording screen. The interface adapts to their equipment and intent, showing only relevant information.

This is a UI that adapts to the athlete, rather than forcing the athlete to adapt to the UI.
