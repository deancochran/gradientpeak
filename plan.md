# Design Specification: The Reactive Recording Interface

**Project:** GradientPeak Mobile Application
**Module:** Activity Recording & Real-Time Dashboard
**Design Philosophy:** Context-Aware Reactivity & Single-Screen Immersion

## Introduction

This design specification defines the User Interface (UI) and User Experience (UX) for the GradientPeak recording screen. The interface adopts a **Single Vertical Stack Architecture** that is "reactive"—the UI automatically configures itself based on the user's immediate environment (Indoors vs. Outdoors), their intent (Structured Training, Attached GPX Routes, 'Free Riding' Quick Start), and their equipment (Bluetooth Sensors and FTMS). The goal is to provide a single, engaging screen that provides the right information at the right time, anchored by a persistent, swipeable command center.

## Migration from Current Implementation

**Current State:** The recording screen (`apps/mobile/app/(internal)/record/index.tsx`) uses a **horizontal carousel architecture** with three card types: Dashboard, Map, and Trainer Control. Users swipe horizontally to switch between views.

**Proposed Change:** This design replaces the carousel with a **vertical three-zone stack** where all relevant information is visible simultaneously, removing the need for horizontal swiping.

**Components to Preserve:**
- `ActivityRecorderService` - Core service layer remains unchanged
- `FTMSController` - Trainer control logic fully reusable
- Event-based hooks (`useRecordingState`, `useSensors`, `usePlan`, etc.) - All reactive hooks remain
- `ActivitySelectionModal` - Reuse for activity category/location selection
- Existing manager classes (`LocationManager`, `SensorsManager`, `LiveMetricsManager`) - No changes needed

**Components to Refactor:**
- `RecordingCarousel` → New vertical layout with conditional zones
- Card components → Extract logic into zone components with different layouts
- Footer button layout → Implement `@gorhom/bottom-sheet` with swipeable expansion

**New Dependencies Required:**
- `@gorhom/bottom-sheet` (v4+) - Swipeable footer implementation
- No other new libraries needed (react-native-reanimated already present)

---

## MVP Scope & Requirements

This section defines the specific requirements and scope limitations for the upcoming MVP release.

### 1. FTMS Logic: Machine-Specific Configurations

The Adjust tab must define specific configurations for each FTMS machine type to ensure proper resistance and control mapping.

#### Supported Machine Types:
- **Rowers:** Damper/resistance level mapping, stroke rate targets
- **Bikes (Trainers):** ERG mode power control, SIM mode grade simulation, resistance levels
- **Treadmills:** Speed control, incline/grade control
- **Ellipticals:** Resistance level control, cadence targets

#### Adjust Tab Configuration Requirements:
Each machine type must have:
- **Control Mode Selection:** Auto (follows plan) vs Manual override
- **Resistance Mapping:** Define how plan targets translate to machine resistance
- **Quick Adjustment Controls:** +/- buttons for manual fine-tuning
- **Machine-Specific Parameters:**
  - Rowers: Damper setting (1-10), drag factor display
  - Bikes: FTP-based power zones, weight for gradient simulation
  - Treadmills: Max speed limits, incline range
  - Ellipticals: Resistance range, stride rate targets

**Implementation Note:** The FTMS Control Screen must dynamically adapt its UI based on the connected machine type, showing only relevant controls for that device category.

### 2. Documentation: Focus Modes & Record Page Behavior

#### Focus Modes (Map, Plan, Metrics)
The recording interface supports three distinct Focus Modes that allow users to expand specific zones for detailed viewing:

**Map Focus Mode:**
- Expands Zone A (Context Layer) to full screen minus footer
- Available when: GPS map (outdoor) or virtual route map (indoor) is active
- Gesture: Tap on map to expand, tap Minimize button or tap map again to collapse
- Use case: Detailed route navigation, checking upcoming terrain

**Plan Focus Mode:**
- Expands Zone B (Guidance Layer) to emphasize workout structure
- Available when: Activity plan is attached
- Gesture: Tap on plan card to expand, tap Minimize button to collapse
- Use case: Reviewing upcoming intervals, checking workout structure

**Metrics Focus Mode:**
- Expands Zone C (Data Layer) to show all available metrics in grid layout
- Always available (Zone C always renders)
- Gesture: Tap on metrics area to expand, tap Minimize button to collapse
- Use case: Detailed analysis of all sensor data simultaneously

**Focus Mode Rules:**
- Only ONE zone can be in Focus Mode at a time
- Focus Mode and expanded footer are mutually exclusive (cannot both be active)
- When a zone is in Focus Mode, footer automatically collapses
- When footer is expanded, all zones return to normal size
- Minimize button appears in top-right corner of focused zone

#### Record Page Behavior: Dynamic Attach/Detach

Users can dynamically attach or detach plans and routes during an active recording. The UI must react immediately to these changes:

**Attaching a Plan Mid-Workout:**
1. User swipes up footer → taps "Plan" configuration item
2. Plan picker modal opens (shows list of available workout plans)
3. User selects a plan → modal dismisses
4. Zone B **smoothly animates into view** (300ms slide-in from bottom)
5. Plan immediately begins from first interval
6. Metrics in Zone C reorder to prioritize plan target metrics

**Detaching a Plan Mid-Workout:**
1. User swipes up footer → taps "Plan" → selects "Remove Plan"
2. Zone B **smoothly animates out of view** (300ms slide-out to bottom)
3. Zone A and Zone C expand to fill available space
4. Metrics remain visible but plan-specific ordering is removed
5. Recording continues as free-form workout

**Attaching a Route Mid-Workout:**
- Outdoor activity: Route overlay appears on existing GPS map
- Indoor activity: Map with virtual route polyline mounts in Zone A
- Route progress calculation begins from current distance/time
- If FTMS connected (indoor): Grade updates begin controlling resistance

**Detaching a Route Mid-Workout:**
- Outdoor activity: Route overlay disappears, breadcrumb trail remains
- Indoor activity: Map unmounts if no other reason to show it
- FTMS control reverts to plan targets only (no grade adjustment)

**Critical Rules:**
- Recording NEVER pauses during attach/detach operations
- All sensor data continues collecting seamlessly
- Changes take effect immediately (no confirmation dialogs needed)
- Activity type (category/location) CANNOT be changed once recording starts

### 3. UI Standardization

#### Modals as Sheets with Standard Navigation
All configuration interfaces must follow consistent sheet-based patterns:

**Sheet Structure:**
- All modals render as bottom sheets (using `@gorhom/bottom-sheet`)
- **Standard Back Button:** Every sheet includes a "Back" button in top-left corner
- Back button style: `< Back` text with chevron icon
- Tapping Back button dismisses sheet and returns to previous view
- No "X" close buttons or alternative dismiss patterns

**Sheet Types:**
- **Route Picker Sheet:** List of saved GPX routes with search/filter
- **Plan Picker Sheet:** List of workout plans with preview
- **Activity Selection Sheet:** Category and location picker (pre-start only)

**Full Navigation Screens (Not Sheets):**
- **Sensors Screen:** Full navigation screen at `/record/sensors` with back gesture enabled
- **FTMS Control Screen:** Full navigation screen (like Sensors) at `/record/ftms` with back gesture enabled

#### Gesture Standardization
Consistent gesture behavior across all sheets and screens:

**Left-to-Right Swipe (Back Gesture):**
- ✅ **ENABLED** on Sensors screen (`/record/sensors`)
- ❌ **DISABLED** on main recording screen (`/record/index`)
- Rationale: Prevents accidental back swipes during active workout
- Implementation: Use `gestureEnabled={false}` on recording screen navigator

**Swipe-Down Gesture:**
- ❌ **DISABLED** on all sheets and recording screen
- Prevents accidental dismissals during workout
- Users must explicitly tap "Back" button to dismiss sheets
- Implementation: Set `enablePanDownToClose={false}` on all bottom sheets

**Full Navigation Screen Exceptions:**
The Sensors page (`/record/sensors`) and FTMS Control screen (`/record/ftms`) are full navigation screens (not sheets) and follow standard navigation patterns:
- Left-to-right swipe gesture: ✅ ENABLED
- Back button in header: ✅ Visible
- Returns to recording screen on back
- Recording continues seamlessly in background
- These are the ONLY screens in the recording flow that use navigation instead of sheets

#### Footer Label Simplification
The footer configuration items must use simplified, generic labels:

**Current (Verbose):**
```
Route: "Mountain Loop" (14.2 mi)
Plan: "VO2 Max Intervals" (45 min)
```

**MVP (Simplified):**
```
Edit Route
Edit Plan
```

**Rules:**
- Hide specific route/plan names in footer
- Show only generic action labels: "Edit Route" / "Edit Plan"
- If no route attached: "Add Route"
- If no plan attached: "Add Plan"
- Specific names/details shown only inside the picker sheets
- Rationale: Reduces visual clutter, keeps footer concise

### 4. Scope Reductions (Removed from MVP)

The following features are explicitly OUT OF SCOPE for the MVP release and should be removed or disabled:

#### ❌ Notification Banners
- Remove all system notification banners (GPS lost, sensor disconnected, etc.)
- Exception: Android foreground service notification (required for background recording)
- Use subtle in-UI indicators instead of intrusive banners
- Example: Show "GPS Searching..." text overlay on map instead of banner

#### ❌ System Overlays
- Remove modal overlays for system events
- Remove "Sensor Disconnected" overlay cards
- Remove "GPS Signal Lost" persistent banners
- Use icon badges or text labels for status instead

#### ❌ HR/Power Graphs (Zone A)
- Remove Heart Rate graph visualization from Zone A
- Remove Power graph visualization from Zone A
- Zone A is ONLY for GPS map or route visualization
- HR and Power metrics remain in Zone C as numeric values

**Impact:** When user has plan but no route:
- Old behavior: Zone A shows HR or Power graph
- New behavior: Zone A does NOT render (Zone B and C expand to fill space)

#### ❌ Voice Feedback
- Remove all audio cues for interval transitions
- Remove text-to-speech announcements
- Remove audio alerts for sensor disconnections
- Silent operation only (visual feedback only)

#### ❌ Haptic Feedback
- Remove haptic feedback for button presses
- Remove haptic patterns for interval transitions
- Remove vibration alerts for sensor events
- No haptic feedback in MVP release

**Code Cleanup Required:**
- Remove or comment out haptic feedback calls (`Haptics.impactAsync()`)
- Remove voice/audio manager integration
- Remove notification banner components
- Simplify Zone A rendering logic (map-only, no graphs)

### MVP Summary

**IN SCOPE:**
- ✅ FTMS machine-specific configurations (Rowers, Bikes, Treadmills, Ellipticals)
- ✅ Focus Modes (Map, Plan, Metrics) with clear documentation
- ✅ Dynamic plan/route attach/detach during recording
- ✅ Standardized sheet UI with Back buttons
- ✅ Gesture consistency (left-to-right on Sensors only, no swipe-down)
- ✅ Simplified footer labels (hide specific names)

**OUT OF SCOPE:**
- ❌ Notification banners (except Android foreground service)
- ❌ System overlays for events
- ❌ HR/Power graphs in Zone A
- ❌ Voice feedback and audio cues
- ❌ Haptic feedback for all interactions

---

## 1. The Visual Hierarchy: The Three-Tier Dynamic Stack

The main recording view is constructed as a vertical stack divided into three logical zones. These zones are fluid; they mount, unmount, and resize based on the active configuration.

**Critical Principle:** Components only render when their required data is present. Empty or placeholder screens are avoided; instead, zones intelligently hide themselves or substitute alternative visualizations.

> Note: that users can optionally configure an activity recording prior to the start of the recording. i.e. a user can start with a Quick Start activity, or they can select a planned activity or actiivyt plan or route to preconfigure a recording. Once initialized the recording screen should update, and if the user makes last minute adujstments on the recroding screen they should be allowed to to this, and the screenshould reactiviely update

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

4. **Indoor + No Route**
   - ❌ **DO NOT RENDER** — Zone A completely unmounts
   - Behavior: Zone B and Zone C expand to fill the available space
   - Rationale: Without GPS or route data, there is no spatial context to display

**MVP Scope Change:**
- ❌ **REMOVED:** HR/Power graph visualizations in Zone A
- Previous design showed Heart Rate or Power graphs when no route was present
- MVP version: Zone A is **map-only** (GPS or virtual route visualization)
- HR and Power remain available as numeric metrics in Zone C

**Summary:** Zone A only renders when displaying GPS map (outdoor) or virtual route map (indoor). All other scenarios result in Zone A unmounting completely. 

### Zone B: The Guidance Layer (Middle Tier) — **CONDITIONAL**

This is the heart of the "Interval" functionality. This component is **only rendered when a workout plan is active**.

#### Rendering Decision Logic:

1. **Has Workout Plan (ActivityPlan)**
   - ✅ **Render:** Full Interval Card. This has a activity plan title, a title left counter, a activity intensity chart that updates as the user progresses, text for the current simplified and formated string, a prgress bar fo rht ecompletion of the current step and next step text

2. **No Workout Plan**
   - ❌ **DO NOT RENDER** — Zone B completely unmounts
   - Behavior: Zone A and Zone C expand to fill the available space
   - This prevents visual clutter for free-form workouts

**Critical Rule:** Zone B has no fallback state. It either renders fully or not at all. This binary behavior ensures the interface stays clean for unstructured activities.

### Zone C: The Data Layer — **ALWAYS VISIBLE**

The bottom section, sitting just above the footer, is the metric dashboard. This zone **always renders** regardless of configuration, as it displays real-time session data.

#### Rendering Behavior:

- **Always Mounted:** This zone never unmounts
- **Dynamic Content:** The metrics displayed adapt based on:
  - Zone B State (active plan targets)

#### Metric Display Rules:

- always display time, lap time, speed, distance, heartrate, power, cadence, grade, calories
- the listing shuold dynamically adujst and reorder based on which metrics are active plan targets (the listing of active plan targets should reactively update to the active interval and user progress)

**Metric Availability:**
   - If a sensor data or no device data can be found, show "--" placeholder

**Adaptive Grid:** The metrics grid uses a 2-column flexbox layout that automatically reflows based on the number of available metrics (6-9 metrics typical).

---

## 1.5 Conditional Rendering Matrix (Implementation Reference)

This table provides a complete decision matrix for implementers:

| Configuration | Zone A | Zone B | Zone C |
|--------------|--------|--------|--------|
| Outdoor + Route + Plan | GPS Map w/ Route | Plan Card | Metrics |
| Outdoor + Route + No Plan | GPS Map w/ Route | ❌ Hidden | Metrics |
| Outdoor + No Route + Plan | GPS Map (trail only) | Plan Card | Metrics |
| Outdoor + No Route + No Plan | GPS Map (trail only) | ❌ Hidden | Metrics |
| Indoor + Route + Plan | Map w/ Route (virtual) | Plan Card | Metrics |
| Indoor + Route + No Plan | Map w/ Route (virtual) | ❌ Hidden | Metrics |
| Indoor + No Route + Plan | ❌ Hidden | Plan Card | Metrics |
| Indoor + No Route + No Plan | ❌ Hidden | ❌ Hidden | Metrics |

**Key Observations:**
- Zone B rendering is **only** dependent on whether a plan exists (binary decision)
- Zone C is **always** visible but changes content based on the current targets if provided by zone B
- Outdoor activities always have GPS enabled; indoor activities can show virtual route following
- The interface gracefully handles any combination of missing data

---

## 2. Interaction Model: Focus Mode & Minimize

Mobile screens offer limited real estate. To solve this, we introduce an "Expand to Focus" interaction model that allows the user to prioritize specific data without leaving the screen.

* **The Expansion:** If the user taps the **Map (Zone A)** or the **Interval Card (Zone B)**, that specific component smoothly animates to fill the majority of the screen.
* **The Constraint:** Crucially, this expansion **never covers the Control Footer** because the footer overlays the recording content. This ensures that safety-critical controls (Pause/Lap) are never hidden behind a UI layer.
* **The Return:** When in "Focus Mode," a small, semi-transparent **Minimize Button** appears in the corner of the component. Tapping this (or the component itself) reverses the animation, shrinking the component back to its original slot in the three-tier stack.

### Focus Mode + Footer Interaction Rules

These two expansion states are **mutually exclusive** to prevent spatial conflicts:

**Scenario: Zone is in Focus Mode, User Swipes Up Footer**
- Focused zone automatically minimizes with 300ms spring animation
- Footer expands simultaneously after zone minimization completes
- Sequential timing prevents visual collision

**Scenario: Footer is Expanded, User Taps a Zone**
- Footer automatically collapses to default state
- Zone expands to focus mode after footer collapse
- Animation sequence: footer collapses (200ms) → zone expands (300ms)

**Scenario: Zone is in Focus Mode, User Taps Footer Drag Handle**
- Zone minimizes first (300ms)
- Footer then expands (follows bottom sheet gesture)
- User intent: accessing configuration takes priority over focus

**Critical Rule:** Only ONE element can be "expanded" at a time:
- Either: A zone is in focus mode (footer collapsed)
- Or: Footer is expanded (all zones at normal/collapsed size)
- Never: Zone focused AND footer expanded (would create spatial conflict)

**Implementation Note:** Use a shared state variable `expandedElement: 'none' | 'zone-a' | 'zone-b' | 'footer'` to enforce mutual exclusivity.

---

## 3. The Anchor: The Swipeable Control Footer & Activity Selection

The footer is the most persistent element of the application. It acts as a split-level bottom sheet that manages both the recording state and the configuration settings. This component uses `@gorhom/bottom-sheet` or a similar library to provide smooth, native-feeling swipe interactions.


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
* **Activity Selection Detail**: A button indicating the activity category and location specified by the user (available for adjustment prior to start)
* **Scrollable Configuration Menu (Below):**

### Activity Category & Location Selection

There is an **Activity Category/Location Selection Button**:

* **Visibility:** Only clickable **before recording starts**. Once recording begins, this button is disabled, whilst displaying the decsion
* **Function:** Opens a modal that allows the user to:
  - Select activity category (Run, Bike, Swim, etc.)
  - Select location (Indoor/Outdoor)
  - The seelciton is always defaulted to running outdoors, but can be adujsted prior to start. This reactively updates the configuration of the recording page

**Configuration Options (List Items):**

1. **Route Management**
   - Icon: Map
   - **Label (MVP Simplified):**
     - If route attached: "Edit Route"
     - If no route: "Add Route"
   - Chevron: Right arrow
   - OnPress: Opens route picker sheet (shows list of saved GPX routes)
   - **Conditional Visibility:** Always available
   - **MVP:** Hide specific route name in footer (shown only inside picker sheet)
   - **Functionality:** Allows user to:
     - Add a route to an activity that doesn't have one
     - Switch to a different route
     - Remove the active route
   - **Note:** Creating or editing routes is NOT part of this functionality

2. **Plan Management**
   - Icon: Calendar/Target
   - **Label (MVP Simplified):**
     - If plan attached: "Edit Plan"
     - If no plan: "Add Plan"
   - Chevron: Right arrow
   - OnPress: Opens workout plan picker sheet
   - **Conditional Visibility:** Always available
   - **MVP:** Hide specific plan name in footer (shown only inside picker sheet)
   - **Functionality:** Allows user to:
     - Add a plan to an activity that doesn't have one
     - Switch to a different plan
     - Remove the active plan
   - **Quick Action:** If plan is active, shows "Skip Step" button inline
   - **Note:** Creating or editing plans is NOT part of this functionality
   - **Category Matching Requirement:** The selected activity plan must always match the active/chosen activity category. The system must prevent users from selecting or updating to an activity plan that belongs to a different category than the current activity. For example, if the user is recording a Run activity, only running plans should be available in the plan picker. If the user is recording a Bike activity, only cycling plans should be shown. This validation must be enforced both at plan selection time and when switching plans mid-workout.

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
   - OnPress: Navigates to **FTMS Control Screen** (full page, like `/record/sensors`)
   - **Screen Structure:**
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

## 3.1. Recording Continuity During Modal Overlays

**Fundamental Principle:** Recording processes NEVER pause when configuration modals or the expanded footer are open. All sensor data collection, GPS tracking, plan progression, and FTMS control continue operating seamlessly in the background.

### Background Process Guarantees

**Always Active During Modals:**
- ✅ Sensor data collection continues at full rate (multiple readings per second)
- ✅ GPS position updates continue (outdoor activities only)
- ✅ Plan step progression continues (time-based advancement)
- ✅ FTMS resistance updates continue (if in auto mode)
- ✅ Metric calculations continue in real-time (zone tracking, session stats)
- ✅ StreamBuffer continues writing data to disk (60-second intervals)
- ✅ Lap timers continue incrementing

**UI Update Behavior:**
- Zone C metrics grid: Updates in real-time behind modal (visible through modal transparency if applicable)
- Zone B plan card: Step transitions occur on schedule even when modal is open
- Zone A map/graph: Position updates accumulate (visible after modal dismissal)
- Footer controls: Remain accessible and functional at top of expanded sheet

### User Feedback During Modals (MVP Updated)

**Interval Transition Notifications:**
❌ **REMOVED FROM MVP** - Toast notifications and banners are out of scope
~~- If plan step changes while modal is open: Show system toast notification~~
~~- Toast appears on top of modal with interval name and target~~
~~- Example: "Next: 3min @ 250W" appears as dismissible banner~~
- **MVP Alternative:** User sees interval change visually in Zone B (no notification)

**Sensor Disconnection Alerts:**
❌ **REMOVED FROM MVP** - System notification banners are out of scope
~~- If sensor disconnects while modal is open: Show system notification~~
~~- Does NOT auto-dismiss the modal (user maintains context)~~
~~- Notification includes "Reconnect" action button~~
- **MVP Alternative:** Status icon badge in footer shows sensor count (e.g., "2/5")
- Sensor status visible when footer is expanded

**GPS Signal Loss (Outdoor Activities):**
❌ **REMOVED FROM MVP** - Persistent warning banners are out of scope
~~- If GPS is lost while modal is open: Show persistent warning banner~~
~~- Banner appears at top of screen, above modal~~
~~- Does NOT block modal interaction~~
- **MVP Alternative:** Text overlay on map shows "GPS Searching..." status
- No intrusive banner overlay

### Safety Controls

**Critical Recording Controls:**
- Pause/Resume/Finish buttons remain accessible at top of expanded footer sheet
- Lap button remains accessible (if recording state is active)
- Users can pause recording from ANY modal or configuration screen
- Emergency controls are NEVER obscured by UI elements

**Modal Dismissal (MVP Updated):**
- ❌ **Swipe-down gesture DISABLED** (prevents accidental dismissals during workout)
- ✅ **Back button required:** All sheets include a "< Back" button in top-left corner
- ✅ **Tapping outside sheet bounds** dismisses sheet (returns to recording view)
- ✅ **Android back button** dismisses topmost sheet without affecting recording
- No confirmation needed for sheet dismissal (changes are applied immediately)
- Implementation: Set `enablePanDownToClose={false}` on all `@gorhom/bottom-sheet` instances

### Implementation Requirements

**EventEmitter Subscriptions:**
- UI components subscribe to service events even when not visible
- Events continue firing regardless of modal state
- React hooks (`useRecordingState`, `usePlan`, etc.) remain active
- State updates queue and batch render after modal dismissal if needed

**Background Task Handling (iOS/Android):**
- iOS: Request background location updates during outdoor recording
- Android: Foreground service notification shows recording status
- Both: Recording continues even when app is backgrounded
- Wake lock: Prevent device sleep during active recording

---

## 3.2. Modal & Footer Z-Index Hierarchy

**Visual Stacking Order (bottom to top):**

```
Z-Index Layer Stack:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ 1. Background (z-index: 0)                          │
│    - App background color                           │
│    - Safe area insets                               │
├─────────────────────────────────────────────────────┤
│ 2. Recording Zones (z-index: 1-3)                   │
│    - Zone A (Context Layer): z-index 1              │
│    - Zone B (Guidance Layer): z-index 2             │
│    - Zone C (Data Layer): z-index 3                 │
├─────────────────────────────────────────────────────┤
│ 3. Activity Selection Button (z-index: 5)           │
│    - Only visible before recording starts           │
│    - Positioned above Zone C, below footer          │
├─────────────────────────────────────────────────────┤
│ 4. Bottom Sheet Footer (z-index: 10/20)             │
│    - Collapsed state: z-index 10                    │
│    - Expanded state: z-index 20                     │
│    - Overlays zones and activity button             │
├─────────────────────────────────────────────────────┤
│ 5. Configuration Modals (z-index: 30)               │
│    - Route picker modal                             │
│    - Plan picker modal                              │
│    - FTMS control screen                             │
│    - Activity selection modal (before start)        │
├─────────────────────────────────────────────────────┤
│ 6. System Overlays (z-index: 40-50)                 │
│    - Interval transition toasts: z-index 40         │
│    - Sensor disconnection alerts: z-index 45        │
│    - GPS signal warnings: z-index 45                │
│    - Permission request dialogs: z-index 50         │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Interaction Rules

**Opening a Modal When Footer is Expanded:**
- Modal renders on top of expanded footer (z-index 30 > 20)
- Footer remains in expanded state beneath modal
- User can dismiss modal to return to expanded footer view
- No automatic footer collapse when modal opens

**Opening a Modal When Footer is Collapsed:**
- Modal renders on top of collapsed footer (z-index 30 > 10)
- Footer remains accessible via drag handle (partially visible)
- User can swipe up footer WHILE modal is open (footer overlays modal)
- This allows quick access to recording controls without dismissing modal

**Footer Drag Handle Behavior:**
- Always visible and interactive at all z-index levels
- Swiping footer up while modal is open: footer slides up, modal stays in place
- Result: Footer controls become visible above modal for quick access

**Modal Stacking (Nested Modals):**
- Only ONE modal visible at a time (no stacking)
- Opening a new modal replaces the current modal with transition
- Exception: System alerts/toasts appear on top of everything

**Android Back Button Priority:**
1. If modal is open → Dismiss modal
2. If footer is expanded → Collapse footer
3. If zone is in focus mode → Minimize zone
4. Otherwise → Show "Are you sure you want to exit recording?" dialog

---

## 3.3. Activity Selection Button Positioning

The Activity Category/Location Selection Button requires careful placement to avoid layout conflicts with the footer expansion.

### Recommended Approach: Integrated into Footer

**Placement:** The Activity Selection Button becomes the **first configuration item** in the expanded footer menu (above Route, Plan, Sensors).

**Layout Structure:**
```
Expanded Footer (swipe up):
┌─────────────────────────────────────────────────┐
│ [Drag Handle]                                   │
├─────────────────────────────────────────────────┤
│ [Start/Pause/Resume/Finish] [Lap/Next Step]    │ ← Pinned controls
├─────────────────────────────────────────────────┤
│ 📋 Activity Type: Running (Outdoor)    [>]     │ ← Activity selection
│    Tap to change activity or location          │
├─────────────────────────────────────────────────┤
│ 🗺️  Route: Mountain Loop               [>]     │
│ 📅 Plan: VO2 Max Intervals              [>]     │
│ 📡 Sensors: 3 connected                 [>]     │
│ ⚡ Smart Trainer: ERG Mode - 250W       [>]     │
└─────────────────────────────────────────────────┘
```

**Visibility & Behavior:**
- **Before Recording Starts:** Button is enabled and tappable
  - Shows current selection: "Running (Outdoor)" or "Cycling (Indoor)"
  - Tapping opens ActivitySelectionModal
  - Changes immediately update Zone A/B/C rendering

- **During Recording (Active/Paused/Finished):** Button is disabled but visible
  - Shows locked selection with lock icon
  - Text appears dimmed/grayed out
  - Tapping does nothing (activity type locked after start)
  - Tooltip: "Activity type cannot be changed during recording"

**Advantages of This Approach:**
- ✅ No z-index conflicts with footer expansion
- ✅ Consistent with other configuration options (Route, Plan, Sensors)
- ✅ Always accessible via footer swipe (no hidden buttons)
- ✅ Clear visual hierarchy (configuration grouped together)
- ✅ Responsive layout (no fixed positioning calculations)

**Alternative Approach (Not Recommended):** Fixed position above footer could work but creates layout complexity when footer expands and requires manual spacing calculations. The integrated approach is cleaner.

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
- Solution: Keep showing map with last known position + "GPS Searching..." text overlay
- Zone A continues to display map, but position marker stops updating
- Breadcrumb trail remains visible showing historical path
- **MVP:** No banner overlay—use subtle text label on map instead

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
- **MVP:** Zone A no longer shows Power/HR graphs (map-only)
- Solution for metrics in Zone C:
  - Metric value shows last known reading with faded appearance
  - Small icon indicator next to metric (not a full overlay)
  - When sensor reconnects, metric returns to normal appearance
  - No system notification banner

**Scenario: FTMS trainer disconnects during indoor workout**
- **MVP:** No notification banner shown
- Solution:
  - FTMS control button in footer shows "Disconnected" badge
  - If route is active, virtual position continues updating from speed/cadence sensors (if available)
  - User can continue workout without trainer control
  - When trainer reconnects, badge updates to show connected status
  - No pop-up notifications

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

**Basic Requirements:**
- All buttons must have minimum 48x48dp tap targets (larger than standard 44pt)
- Color-coded zones (target range indicators) must also have text/icon indicators
- VoiceOver/TalkBack must announce zone transitions ("Plan view opened", "Map view opened")
- Footer sheet must be keyboard accessible for users with motor disabilities

**Workout-Specific Accessibility:**

**VoiceOver/TalkBack Announcements:**
- Zone transitions: "Map view expanded" / "Plan view minimized"
- Interval changes: "New interval: 3 minutes at 250 watts"
- Lap markers: "Lap 2 completed, 5 kilometers, 15 minutes"
- Sensor events: "Heart rate sensor connected" / "Power meter disconnected"
- Critical alerts: "GPS signal lost" / "GPS signal restored"

**Announcement Frequency Control:**
- Reduce announcement frequency during active recording to avoid overwhelming users
- Do NOT announce every metric update (e.g., every power reading)
- Priority announcements only: interval changes, lap markers, sensor status changes
- User preference: "Audio Cues" toggle in app settings for key events

**Touch Targets During Motion:**
- All buttons: minimum 48x48dp (larger than standard 44pt for easier tapping while moving)
- Footer drag handle: 80px wide × 24px tall (easier to grab while exercising)
- Recording controls: 60x60dp with 16px minimum spacing between buttons
- Zone tap areas: Entire zone surface is tappable (not just small button)

**High Contrast Mode:**
- All zones must have accessible contrast ratios (WCAG AA: 4.5:1 minimum)
- Target zones in plan card: Use both color AND pattern indicators (stripes/dots)
- Map markers: High contrast borders (white + black outline)
- Metrics text: Minimum 16sp font size with bold weight for primary values

**Voice Control Support (iOS/Android):**
❌ **REMOVED FROM MVP** - Voice control and audio cues are out of scope
~~- "Start recording" - Activates Start button~~
~~- "Pause recording" / "Resume recording" - Toggles pause state~~
~~- "New lap" / "Mark lap" - Triggers lap button~~
~~- "Show map" / "Show plan" - Expands respective zone to focus mode~~
~~- "Open settings" / "Show settings" - Expands footer to configuration view~~
~~- "Close" / "Minimize" - Collapses expanded elements~~

**Haptic Feedback:**
❌ **REMOVED FROM MVP** - Haptic feedback is out of scope for MVP release
~~- Start/Pause/Finish buttons: Medium impact haptic~~
~~- Lap button: Light impact haptic~~
~~- Interval transitions: Success haptic pattern (da-dum)~~
~~- Sensor disconnection: Warning haptic pattern (vibrate twice)~~
~~- Zone expansion: Light haptic feedback on tap~~

---

## 4.7 Routing Architecture & Navigation Structure

The recording screen is part of a stack-based navigation system that maintains recording state across screens while allowing essential navigation for sensor management.

### Navigation Hierarchy

**Route Structure:**
```
/(internal)
  └── /record (Stack Navigator)
      ├── index.tsx          - Main recording screen (this design)
      ├── sensors.tsx        - BLE device scanning and management
      ├── permissions.tsx    - Permission request flow
      └── submit.tsx         - Activity finalization after recording
```

**ActivityRecorderProvider Scope:**
- The `_layout.tsx` wraps the entire `/record` stack with `ActivityRecorderProvider`
- This maintains the single `ActivityRecorderService` instance across all navigation
- Service persists during navigation to `/record/sensors` and back
- Recording continues seamlessly during screen transitions

### Sensor Management Navigation Exception

**Why Sensors Requires Navigation (Not Modal):**
- BLE device scanning requires persistent connection state
- Users may spend 30-60 seconds scanning for devices
- Scrollable list of devices can be lengthy (10+ items)
- Pairing process requires uninterrupted focus
- Android BLE permissions require dedicated screen flow

**Navigation Behavior:**
```
Record Screen (index.tsx)
    ↓ [User taps Sensors button in footer]
Navigation: router.push('/record/sensors')
    ↓
Sensors Screen (sensors.tsx)
    ↓ [User pairs devices, taps back]
Navigation: router.back()
    ↓
Record Screen (index.tsx)
```

**Recording Continuity During Navigation:**
- ActivityRecorderService remains active (same instance via provider)
- If recording is active: GPS tracking and sensor data collection continue
- StreamBuffer continues writing data to disk
- Plan progression continues (time-based advancement)
- User returns to exact same UI state (zones remain configured)

**Gesture Navigation (MVP Requirements):**
- **Sensors screen (`/record/sensors`):**
  - ✅ Left-to-right swipe gesture: **ENABLED**
  - ✅ Back button in header: Visible
  - Allows intuitive swipe-back to recording screen

- **Record screen (`/record/index`):**
  - ❌ Left-to-right swipe gesture: **DISABLED**
  - Prevents accidental back swipes during active workout
  - Implementation: `gestureEnabled={false}` on navigator

- **Submit screen (`/record/submit`):**
  - ❌ Gesture navigation: **DISABLED**
  - Prevents accidental data loss during submission

### Modal-Based Configuration (Preferred Pattern)

All other configuration uses modals to avoid navigation:
- **Route Picker:** Modal overlay (no navigation)
- **Plan Picker:** Modal overlay (no navigation)
- **Activity Selection:** Modal overlay (ActivitySelectionModal - existing component)
- **FTMS Control:** Full navigation screen at `/record/ftms` (follows sensors page pattern)

**Rationale:** Modals maintain visual context and eliminate navigation transitions, providing faster access and clearer user intent.

### State Passing & Deep Linking

**Activity Selection State:**
- Uses `ActivitySelectionStore` (Zustand singleton) for consume-once pattern
- Record screen launcher sets activity data, then navigates to `/record`
- Record screen consumes state on mount and clears store
- No URL parameters needed (cleaner URLs, no state leakage)

**Future Consideration - Deep Linking:**
If deep linking to recording screen is needed:
```
/record?planned_activity_id=123
/record?activity_type=run&location=outdoor
```
Parse URL params on mount to pre-configure recording state.

### Back Navigation Handling

**Android Back Button Priority (Ordered):**
1. If modal is open → Dismiss modal (e.g., route picker)
2. If footer is expanded → Collapse footer to default state
3. If zone is in focus mode → Minimize zone to normal size
4. If on sensors/permissions screen → Navigate back to record screen
5. If recording is active → Show "Exit Recording?" confirmation dialog
6. If recording not started → Navigate back to previous screen (exit /record)

**iOS Gesture Navigation:**
- Disabled on record screen (prevents accidental back swipe during workout)
- Enabled on sensors screen (allows intuitive swipe-back gesture)

### App State Preservation

**Backgrounding (User switches apps):**
- iOS: Request background location permission (outdoor activities)
- Android: Show foreground service notification ("GradientPeak - Recording Active")
- Recording continues: GPS, sensors, plan progression all active
- UI state frozen (no unnecessary renders to save battery)

**Foreground Return:**
- Rehydrate UI state from ActivityRecorderService
- Resume real-time metric updates
- If significant time passed: Show "Welcome back" with elapsed time
- All accumulated data is preserved (no gaps)

**App Termination (Force Quit or Crash):**
- StreamBuffer persists data to disk every 60 seconds
- On next app launch: Check for orphaned recording session
- Prompt user: "Resume Unfinished Recording?" with options:
  - "Resume" → Restore last known state, mark data gap
  - "Discard" → Clear persisted state, start fresh

---

## 4.8 State Management Architecture

### Current Implementation (Preserved)

**Layer 1: Service Layer (ActivityRecorderService)**
- Singleton instance per profile, managed by `ActivityRecorderProvider` (React Context)
- Location: `apps/mobile/lib/services/ActivityRecorder/index.ts`
- Extends EventEmitter for real-time updates
- Manages internal state via private variables and event emissions

**Internal Managers:**
```typescript
ActivityRecorderService {
  liveMetricsManager: LiveMetricsManager
  locationManager: LocationManager
  sensorsManager: SensorsManager
  notificationsManager: NotificationsManager
  ftmsController: FTMSController (via sensorsManager)
}
```

**Service Events (Reactive Data Flow):**
```typescript
ServiceEvents {
  'stateChanged': (state: RecordingState) => void
  'recordingComplete': () => void
  'activitySelected': (data) => void
  'sensorsChanged': (sensors) => void
  'stepChanged': (info: StepChangeInfo) => void
  'timeUpdated': (time: number) => void
  'readingsUpdated': (readings: CurrentReadings) => void
  'error': (message: string) => void
}
```

**Layer 2: Reactive Hooks (UI Subscriptions)**
- Location: `apps/mobile/lib/hooks/useActivityRecorder*.ts`
- Hooks subscribe to service events and return reactive state
- Components re-render automatically when events fire

```typescript
// Primary Hooks
useActivityRecorder(profile): ActivityRecorderService | null
useRecordingState(service): RecordingState  // 'pending' | 'ready' | 'recording' | 'paused' | 'finished'
useSensors(service): ConnectedSensor[]
usePlan(service): { hasPlan, currentStep, stepProgress, nextStep }
useCurrentReadings(service): { power, heartRate, cadence, speed }
useSessionStats(service): { duration, distance, calories, avgPower, avgHR }
useActivityStatus(service): ActivityStatusData
useElapsedTime(service): number
useMovingTime(service): number

// Action Hook
useRecorderActions(service): {
  start, pause, resume, finish,
  addLap, skipStep, updateActivity
}
```

**Layer 3: Zustand Stores (Persistent State)**
- Location: `apps/mobile/lib/stores/`
- Used for cross-session persistence and global app state

```typescript
// Auth & Profile (persistent)
useAuthStore: { profile, session, signIn, signOut }

// Theme (persistent)
useThemeStore: { isDarkMode, accentColor }

// Activity Plan Creation (persistent)
useActivityPlanCreationStore: { currentPlan, steps, saveProgress }

// Activity Selection (consume-once pattern)
ActivitySelectionStore: {
  setActivity(data),
  getActivity(), // Returns data and clears store
}
```

**Layer 4: Component Local State (UI-Only)**
- Modal visibility flags (e.g., `const [isModalVisible, setIsModalVisible] = useState(false)`)
- Footer expansion state (managed by @gorhom/bottom-sheet)
- Zone focus mode state (e.g., `const [focusedZone, setFocusedZone] = useState<'none' | 'zone-a' | 'zone-b'>('none')`)
- Transient UI state (animations, loading indicators)

### New State Requirements for Redesign

**Zone Expansion Mutual Exclusivity:**
```typescript
type ExpandedElement = 'none' | 'zone-a' | 'zone-b' | 'footer'

// Component state
const [expandedElement, setExpandedElement] = useState<ExpandedElement>('none')

// Helper functions
const expandZone = (zone: 'zone-a' | 'zone-b') => {
  if (expandedElement === 'footer') {
    // Collapse footer first, then expand zone
    setExpandedElement('none')
    setTimeout(() => setExpandedElement(zone), 200) // After footer collapse animation
  } else {
    setExpandedElement(zone)
  }
}

const expandFooter = () => {
  if (expandedElement === 'zone-a' || expandedElement === 'zone-b') {
    // Minimize zone first, then expand footer
    setExpandedElement('none')
    setTimeout(() => setExpandedElement('footer'), 300) // After zone minimize animation
  } else {
    setExpandedElement('footer')
  }
}
```

**Activity Configuration State (Before Recording):**
```typescript
// Stored in component state until recording starts
interface PreRecordingConfig {
  activityCategory: 'run' | 'bike' | 'swim' | 'other'
  activityLocation: 'indoor' | 'outdoor'
  selectedRoute: Route | null
  selectedPlan: ActivityPlan | null
}

// On "Start" button press: Pass config to ActivityRecorderService
service.start(config)
```

### State Persistence Strategy

**Critical State (Persisted to AsyncStorage Every 5 Seconds During Recording):**
```typescript
interface PersistedRecordingState {
  recordingId: string  // Unique identifier for this session
  startTime: Date
  accumulatedDistance: number
  accumulatedDuration: number  // Excludes paused time
  totalPausedDuration: number
  currentStepIndex: number  // If plan is active
  breadcrumbBuffer: GPSPoint[]  // Last 60 seconds of GPS data
  sensorReadingsBuffer: SensorReading[]  // Last 60 seconds
}
```

**Recovery on App Restart:**
1. Check AsyncStorage for `lastRecordingState` key
2. If found and timestamp is recent (< 24 hours old):
   - Prompt user: "Resume Unfinished Recording?"
   - If "Resume": Restore state to ActivityRecorderService, mark data gap in session
   - If "Discard": Clear persisted state
3. If not found or too old: Start fresh

**StreamBuffer File Persistence:**
- Location: `apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts`
- Writes sensor data to disk every 60 seconds (already implemented)
- On app restart: Read from last known file position to recover data
- Cleanup: Delete files older than 7 days

---

## 4.9 Animation & Gesture Library Specification

### Animation Stack

**Primary Library:** `react-native-reanimated` (v3+)
- Already installed and used in existing components
- Provides worklet-based animations (runs on UI thread)
- No additional installation needed

**Bottom Sheet Library:** `@gorhom/bottom-sheet` (v4+)
- **NEW DEPENDENCY** - Must be installed for swipeable footer
- Install: `npm install @gorhom/bottom-sheet@latest`
- Peer dependency: `react-native-gesture-handler` (already installed)
- Provides native-feeling swipe interactions with snap points

**Gesture Library:** `react-native-gesture-handler` (v2+)
- Already installed and configured
- Used by @gorhom/bottom-sheet for swipe gestures
- Also used for zone tap detection

**Map Animation:** `react-native-maps` (existing)
- Already used in current MapCard implementation
- `animateToRegion()` for smooth camera pans (reuse existing code)

### Animation Specifications

**Zone Focus/Minimize (Expand/Collapse):**
```typescript
// Using react-native-reanimated
const animateZoneExpansion = (toFocusMode: boolean) => {
  'worklet'
  return {
    height: withSpring(
      toFocusMode ? FULL_HEIGHT : NORMAL_HEIGHT,
      { damping: 0.8, stiffness: 100 }
    ),
    opacity: withTiming(toFocusMode ? 1 : 1, { duration: 300 })
  }
}
```
- Animation type: Spring physics
- Duration: ~400ms (spring settling time)
- Damping: 0.8 (slight overshoot for natural feel)
- Stiffness: 100 (moderate bounce)

**Zone Mount/Unmount (Conditional Rendering):**
```typescript
// Zone B appears/disappears when plan is attached/detached
const animateZoneMount = (isMounting: boolean) => {
  'worklet'
  return {
    height: withTiming(isMounting ? ZONE_B_HEIGHT : 0, {
      duration: 300,
      easing: Easing.out(Easing.ease)
    }),
    opacity: withTiming(isMounting ? 1 : 0, {
      duration: 300,
      easing: Easing.out(Easing.ease)
    })
  }
}
```
- Animation type: Timed easing
- Duration: 300ms
- Easing: Ease-out (fast start, slow end)
- Affects: Zone B only (Zone A and C resize to compensate)

**Footer Snap Animation:**
```typescript
// Handled by @gorhom/bottom-sheet
<BottomSheet
  snapPoints={[120, '60%']}  // Collapsed: 120px, Expanded: 60% of screen
  animateOnMount={true}
  animationConfigs={{
    damping: 80,
    stiffness: 500,
    mass: 0.3,
    overshootClamping: false,
    restDisplacementThreshold: 0.1,
    restSpeedThreshold: 0.1,
  }}
/>
```
- Animation: Native spring physics from @gorhom/bottom-sheet
- User-controlled via swipe gesture
- Velocity-based snap point selection (fast swipe = jumps to next point)

**Metric Updates (Zone C):**
```typescript
// NO ANIMATION for metric values - instant update
// Rationale: Users need precise real-time data without motion blur
<Text>{power} W</Text>  // Direct update, no withTiming()
```
- Metric values: No animation (instant update)
- Rationale: Motion blur makes numbers hard to read during workout
- Exception: Progress bars use smooth animation

**Map Position Updates (Zone A):**
```typescript
// Using react-native-maps (existing implementation)
mapRef.current?.animateToRegion({
  latitude: newPosition.lat,
  longitude: newPosition.lng,
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
}, 500)  // 500ms smooth pan
```
- Duration: 500ms
- Easing: Ease-in-out (built into react-native-maps)
- Throttled: Maximum 1 update per second (GPS updates)

### Gesture Specifications

**Zone Tap to Expand/Minimize:**
```typescript
// Using react-native-gesture-handler
<TapGestureHandler onHandlerStateChange={handleZoneTap}>
  <Animated.View>
    {/* Zone A or Zone B content */}
  </Animated.View>
</TapGestureHandler>
```
- Gesture type: Single tap (not double-tap)
- Tap area: Entire zone surface (not just small icon)
- Conflict resolution: Map panning does NOT trigger zone focus (requires explicit tap on non-interactive area)

**Footer Swipe Gesture:**
- Handled automatically by @gorhom/bottom-sheet
- Vertical pan gesture with velocity detection
- Snap points: [120px (collapsed), 60% (expanded)]
- Velocity threshold: 50px/s (determines snap target)
- Overscroll: Rubber-band effect at snap points

**Modal Dismiss Gesture (MVP Updated):**
```typescript
// Bottom sheet with disabled swipe-down
<BottomSheetModal
  ref={bottomSheetRef}
  snapPoints={snapPoints}
  enablePanDownToClose={false}  // MVP: DISABLED
  onDismiss={handleDismiss}
>
  {/* Sheet header with Back button */}
  <SheetHeader>
    <BackButton onPress={handleDismiss}>< Back</BackButton>
  </SheetHeader>
  {/* Sheet content */}
</BottomSheetModal>
```
- ❌ **Swipe-down gesture: DISABLED** (prevents accidental dismissals)
- ✅ **Back button required:** "< Back" button in top-left corner
- ✅ **Tap outside bounds:** Dismisses sheet
- ✅ **Android back button:** Dismisses sheet

**Map Pan Gesture (Does Not Trigger Focus):**
- Map panning is handled by react-native-maps internal gestures
- Does NOT trigger zone expansion (separate from tap gesture)
- User can pan map without entering focus mode
- Only explicit tap on map triggers focus mode

### Animation Performance Targets

**Frame Rate Requirements:**
- Main thread: 60fps constant during all animations (16.6ms per frame)
- UI thread (reanimated worklets): 60fps for zone transitions
- Acceptable degradation: 30fps minimum during zone mount/unmount (33ms per frame)

**Implementation Notes:**
- Use `useSharedValue()` for animated values (runs on UI thread)
- Use `useAnimatedStyle()` for animated styles (avoids bridge crossing)
- Avoid animating too many properties simultaneously (max 3 per element)
- Use `removeClippedSubviews` on zones to improve performance

---

## 4.10 Indoor Virtual Route Progress Calculation

When an indoor activity has a route attached (virtual riding/running), the app must calculate the user's virtual position along the route based on speed and distance data.

### Speed Data Source Priority

The system attempts to obtain speed data in the following order (first available wins):

**Priority 1: FTMS Trainer Speed Sensor** (highest accuracy)
```typescript
const trainerSpeed = sensorsManager.getControllableTrainer()?.currentSpeed
if (trainerSpeed !== undefined) {
  useSpeed = trainerSpeed  // m/s
}
```
- Most accurate for indoor cycling with smart trainers
- Reports actual wheel/flywheel speed
- Updates at ~1Hz (once per second)

**Priority 2: Bluetooth Speed Sensor** (high accuracy)
```typescript
const speedSensor = sensorsManager.getSensorByType('speed')
if (speedSensor?.connected && speedSensor.lastReading) {
  useSpeed = speedSensor.lastReading.speed  // m/s
}
```
- Dedicated speed sensor (wheel sensor or foot pod)
- Reports real device movement
- Updates at ~1Hz

**Priority 3: Calculated from Power + Virtual Weight** (moderate accuracy)
```typescript
const power = sensorsManager.getSensorByType('power')?.lastReading?.power  // watts
const grade = currentRoute.getGradeAtDistance(accumulatedDistance)  // %
const virtualWeight = profile.weight + profile.bikeWeight  // kg

// Physics-based calculation
const velocity = calculateVelocityFromPower(power, grade, virtualWeight)
```
- Uses physics model: power = force × velocity
- Requires accurate FTP and weight in profile
- Accuracy: ±5% for steady-state efforts

**Priority 4: Manual Speed Input** (fallback)
```typescript
const manualSpeed = userInputSpeed || 5.0  // m/s (default: 18 km/h / 11 mph)
```
- User sets approximate speed via slider in footer
- Only used if no sensors available
- Updates virtual progress at constant rate

### Distance Accumulation Algorithm

**Integration Over Time:**
```typescript
let accumulatedDistance = 0  // meters

// Called every second (1Hz update rate)
const updateVirtualProgress = (deltaTime: number) => {
  const currentSpeed = getSpeed()  // m/s from priority system above

  // Apply 3-second rolling average to smooth jerky progress
  speedBuffer.push(currentSpeed)
  if (speedBuffer.length > 3) speedBuffer.shift()
  const smoothedSpeed = speedBuffer.reduce((a, b) => a + b, 0) / speedBuffer.length

  // Integrate: distance = speed × time
  const distanceIncrement = smoothedSpeed * deltaTime  // meters
  accumulatedDistance += distanceIncrement

  // Update virtual position on route
  updateVirtualPosition(accumulatedDistance)
}

// Triggered by interval timer
setInterval(() => updateVirtualProgress(1.0), 1000)  // 1 second interval
```

**Smoothing Rationale:**
- Raw speed data can fluctuate rapidly (especially from power calculations)
- 3-second rolling average prevents jerky marker movement
- Balances responsiveness with visual smoothness

### Virtual Position Calculation

**Mapping Distance to Route Polyline:**
```typescript
const updateVirtualPosition = (distance: number) => {
  // Route is stored as array of LatLng points with cumulative distance
  const routePoints = currentRoute.points  // Array<{ lat, lng, cumulativeDistance }>

  // Find two points that bracket the current distance
  const pointBefore = routePoints.findLast(p => p.cumulativeDistance <= distance)
  const pointAfter = routePoints.find(p => p.cumulativeDistance > distance)

  if (!pointBefore || !pointAfter) {
    // User has exceeded route distance or not started yet
    virtualPosition = pointBefore || routePoints[0]
    return
  }

  // Linear interpolation between points
  const segmentDistance = pointAfter.cumulativeDistance - pointBefore.cumulativeDistance
  const progressInSegment = (distance - pointBefore.cumulativeDistance) / segmentDistance

  virtualPosition = {
    lat: pointBefore.lat + (pointAfter.lat - pointBefore.lat) * progressInSegment,
    lng: pointBefore.lng + (pointAfter.lng - pointBefore.lng) * progressInSegment
  }

  // Update map marker position
  updateMapMarker(virtualPosition)
}
```

**Grade Calculation at Virtual Position:**
```typescript
const getGradeAtPosition = (distance: number): number => {
  const pointBefore = routePoints.findLast(p => p.cumulativeDistance <= distance)
  const pointAfter = routePoints.find(p => p.cumulativeDistance > distance)

  if (!pointBefore || !pointAfter) return 0

  const elevationChange = pointAfter.elevation - pointBefore.elevation  // meters
  const horizontalDistance = pointAfter.cumulativeDistance - pointBefore.cumulativeDistance  // meters

  return (elevationChange / horizontalDistance) * 100  // percentage
}
```

**FTMS Resistance Update (If Auto Mode):**
```typescript
const updateTrainerResistance = () => {
  const grade = getGradeAtPosition(accumulatedDistance)

  if (ftmsController.mode === 'AUTO' && currentPlan) {
    // Combine plan target with grade adjustment
    const targetPower = currentPlan.currentStep.targetPower  // watts
    const gradeAdjustment = calculateGradeResistance(grade)  // additional watts
    ftmsController.setPower(targetPower + gradeAdjustment)
  } else if (ftmsController.mode === 'AUTO' && !currentPlan) {
    // No plan: use simulation mode with route grade
    ftmsController.setSimulation({ grade, windSpeed: 0, crr: 0.004 })
  }
}
```

### Edge Cases & Handling

**User Exceeds Route Distance:**
```typescript
if (accumulatedDistance > routePoints[routePoints.length - 1].cumulativeDistance) {
  // Position marker at route end
  virtualPosition = routePoints[routePoints.length - 1]

  // Show completion message
  showToast("Route completed! Distance continues to accumulate.")

  // Continue accumulating distance for session stats
  // (does not affect virtual position - stays at end)
}
```

**Speed Drops to Zero (User Stopped):**
```typescript
if (currentSpeed < 0.1) {  // Less than 0.1 m/s (~0.4 km/h)
  // Virtual position marker stops advancing (stays at current location)
  // No change to accumulatedDistance

  // If recording is not paused: Lap timer continues (user may be stopped at traffic light)
  // If user pauses: Recording stops, all timers freeze
}
```

**Sensor Disconnects Mid-Workout:**
```typescript
if (!getSpeed()) {
  // Speed source lost
  showAlert("Speed sensor disconnected. Virtual progress paused.")

  // Hold last known position
  // Do not advance virtualPosition
  // When sensor reconnects: Resume from last position

  // Option: Fall back to manual speed input
  // Prompt user: "Set approximate speed to continue virtual progress?"
}
```

**Update Frequency:**
- Virtual position recalculated every 1 second (1Hz)
- Map marker updated every 1 second (synced with calculation)
- Smoother than GPS updates (which can be 1-3 seconds)

---

## 4.11 FTMS Control Mode Logic & Plan Integration

FTMS (Fitness Machine Training Status) trainers support multiple control modes. The app must intelligently switch between modes and integrate with workout plans.

### Control Modes

**ERG Mode (Target Power Control):**
```typescript
enum ControlMode {
  ERG = 5  // Constant power target
}

ftmsController.setControlMode(ControlMode.ERG)
ftmsController.setPower(250)  // Target: 250 watts
```
- Trainer automatically adjusts resistance to maintain target power
- User can pedal at any cadence; trainer compensates
- **Use case:** Structured interval training with power targets

**SIM Mode (Simulation Mode):**
```typescript
enum ControlMode {
  SIM = 1  // Simulates outdoor conditions
}

ftmsController.setControlMode(ControlMode.SIM)
ftmsController.setSimulation({
  grade: 5.0,        // 5% incline
  windSpeed: 0,      // m/s
  crr: 0.004,        // Rolling resistance coefficient
  windResistance: 0.51  // kg/m (rider + bike frontal area)
})
```
- Trainer simulates real-world physics (grade, wind, rolling resistance)
- Power output varies based on user's effort
- **Use case:** Virtual route following with realistic resistance

**Resistance Mode (Manual Level Control):**
```typescript
enum ControlMode {
  RESISTANCE = 4
}

ftmsController.setControlMode(ControlMode.RESISTANCE)
ftmsController.setResistance(10)  // Level 1-20 (trainer-dependent)
```
- Fixed resistance level regardless of speed
- User controls power output via cadence/effort
- **Use case:** Free-form training without specific targets

### Auto Mode vs. Manual Mode

**Auto Mode (Plan Active):**
```typescript
// When workout plan is active and user hasn't overridden
if (plan.hasPlan && !manualOverride) {
  const targetPower = plan.currentStep.targetPower  // e.g., 250 watts

  // If indoor + route: Add grade-based adjustment
  if (activityLocation === 'indoor' && currentRoute) {
    const grade = getGradeAtPosition(accumulatedDistance)
    const gradeAdjustment = calculateGradeResistance(grade, profile.weight)
    ftmsController.setPower(targetPower + gradeAdjustment)
  } else {
    // No route: Pure ERG mode
    ftmsController.setPower(targetPower)
  }

  // Zone B shows: Plan targets (user should hit these)
  // Zone C shows: Actual power vs. target (comparison metrics)
}
```

**Behavior:**
- FTMS automatically sets to plan target watts (ERG mode)
- Interval transitions update trainer resistance immediately
- Zone B (Plan Card) shows current target and next step
- Zone C (Metrics) shows actual vs. target comparison with color coding (green = on target, red = off target)

**Manual Mode (Plan Active but Overridden):**
```typescript
// User toggled manual override in FTMS control screen
if (plan.hasPlan && manualOverride) {
  // User manually controls resistance
  // Trainer does NOT automatically adjust to plan targets

  // Plan step progression: CONTINUES based on time
  // (e.g., 5min intervals advance every 5 minutes regardless of power output)

  // Zone B shows: Plan targets (aspirational, but not enforced)
  // Zone C shows: Actual power (no target comparison, no color coding)
  // FTMS control button: Shows "Manual Override" badge (yellow indicator)
}
```

**Behavior:**
- User has full control of trainer resistance (via +/- buttons)
- Plan targets still visible in Zone B (for reference)
- Zone C shows actual power but grays out target comparison
- Plan step progression continues based on time (not adherence)
- UI indicator: "Manual Override" badge on FTMS control button in footer

**Returning to Auto Mode:**
```typescript
// User toggles back to auto mode mid-interval
if (manualOverride === false && plan.hasPlan) {
  const targetPower = plan.currentStep.targetPower

  // Smooth ramp to target (not instant)
  ftmsController.rampToPower(targetPower, 5000)  // 5-second ramp

  // Rationale: Instant resistance change can shock user, especially if
  // they're currently at very different power output
}
```

**No Plan + Manual Mode:**
```typescript
// Free-form riding without plan
if (!plan.hasPlan) {
  // User has full control (always manual)
  // No auto mode available (no targets to follow)

  // Zone B: Hidden (no plan to display)
  // Zone C: Shows actual power, distance, time (no targets)
  // FTMS control: Standard resistance/SIM/ERG controls
}
```

### FTMS Control Screen Interface (MVP Updated)

The FTMS Control Screen follows the same pattern as the Sensors page (`/record/sensors`) - it is a **full navigation screen** (not a vertically swipeable sheet). The screen must **dynamically adapt** its UI based on the connected machine type. Each machine category has specific controls and parameters.

**Navigation Pattern:**
- Accessed via navigation (router.push) rather than modal/sheet
- Full-screen view with standard back button in header
- Left-to-right swipe gesture enabled for intuitive navigation
- Recording process continues seamlessly in background (never paused)
- Returns to recording screen when user navigates back

#### Machine-Specific Configurations

**1. Bikes (Smart Trainers):**
```
┌───────────────────────────────────────────────────┐
│ < Back            Smart Trainer                   │
├───────────────────────────────────────────────────┤
│ [Trainer 1] [Trainer 2]  ← Horizontal tabs        │
├───────────────────────────────────────────────────┤
│ Mode: ⚫ ERG    ⚪ SIM    ⚪ Resistance             │
│                                                   │
│ Target Power: 250 W                               │
│ [−−−−−−−−−−−−−−●−−−−−−] ← Slider                  │
│ [-25W]  [-5W]  [+5W]  [+25W] ← Quick adjustments │
│                                                   │
│ 🔒 Auto Mode: ON                                  │
│    (Following workout plan)                       │
│ [Switch to Manual]                                │
│                                                   │
│ Weight for Grade Simulation: 75 kg                │
│ FTP: 280 W                                        │
│                                                   │
│ Current Output: 248 W                             │
│ Current Cadence: 87 rpm                           │
│ Resistance Level: 12/20                           │
└───────────────────────────────────────────────────┘
```

**Controls:**
- **Mode Selector:** ERG (power target) / SIM (grade simulation) / Resistance (manual level)
- **Target Power:** Adjustable via slider and +/- buttons
- **Weight Parameter:** Used for grade-to-power conversion in SIM mode
- **FTP Display:** Shows user's Functional Threshold Power for reference

**2. Rowers (Smart Rowing Machines):**
```
┌───────────────────────────────────────────────────┐
│ < Back            Rowing Machine                  │
├───────────────────────────────────────────────────┤
│ Damper Setting: 5                                 │
│ [1]  [2]  [3]  [4]  [5]  [6]  [7]  [8]  [9]  [10] │
│                                                   │
│ Resistance Level: Medium                          │
│ [−−−−−−●−−−−−−−−] ← Slider (1-10)                 │
│                                                   │
│ 🔒 Auto Mode: ON                                  │
│    (Following workout plan)                       │
│ [Switch to Manual]                                │
│                                                   │
│ Target Stroke Rate: 24 spm                        │
│                                                   │
│ Current Power: 185 W                              │
│ Current Stroke Rate: 23 spm                       │
│ Drag Factor: 115                                  │
└───────────────────────────────────────────────────┘
```

**Controls:**
- **Damper Setting:** 1-10 scale (adjusts air flow resistance)
- **Resistance Level:** Fine-tune overall difficulty
- **Target Stroke Rate:** Strokes per minute target (if plan specifies)
- **Drag Factor Display:** Shows actual resistance metric (read-only)

**3. Treadmills (Smart Treadmills):**
```
┌───────────────────────────────────────────────────┐
│ < Back            Treadmill                       │
├───────────────────────────────────────────────────┤
│ Speed Control                                     │
│ Target Speed: 10.5 km/h                           │
│ [−−−−−−−−●−−−−−−−] ← Slider                       │
│ [-1.0]  [-0.5]  [+0.5]  [+1.0] ← km/h adjustments│
│                                                   │
│ Incline Control                                   │
│ Target Incline: 3.5%                              │
│ [−−−−−●−−−−−−−−−] ← Slider                        │
│ [-2%]  [-0.5%]  [+0.5%]  [+2%] ← Quick adjust     │
│                                                   │
│ 🔒 Auto Mode: ON                                  │
│    (Following workout plan)                       │
│ [Switch to Manual]                                │
│                                                   │
│ Max Speed Limit: 16.0 km/h (Safety)               │
│ Incline Range: 0% - 15%                           │
│                                                   │
│ Current Speed: 10.3 km/h                          │
│ Current Incline: 3.5%                             │
└───────────────────────────────────────────────────┘
```

**Controls:**
- **Speed Control:** Target speed with safety limits
- **Incline Control:** Grade/incline percentage
- **Safety Limits:** Display max speed and incline range
- **Dual Sliders:** Separate controls for speed and grade

**4. Ellipticals (Smart Elliptical Trainers):**
```
┌───────────────────────────────────────────────────┐
│ < Back            Elliptical                      │
├───────────────────────────────────────────────────┤
│ Resistance Level: 12                              │
│ [−−−−−−−−●−−−−−−−] ← Slider (1-20)                │
│ [-5]  [-1]  [+1]  [+5] ← Quick adjustments        │
│                                                   │
│ 🔒 Auto Mode: ON                                  │
│    (Following workout plan)                       │
│ [Switch to Manual]                                │
│                                                   │
│ Target Cadence: 60 spm                            │
│ (Strides per minute)                              │
│                                                   │
│ Current Resistance: 12/20                         │
│ Current Cadence: 58 spm                           │
│ Current Power: 145 W                              │
└───────────────────────────────────────────────────┘
```

**Controls:**
- **Resistance Level:** 1-20 scale (machine-dependent range)
- **Target Cadence:** Strides per minute (if plan specifies)
- **Power Display:** Shows estimated power output (read-only)

#### Universal Screen Behavior

**When Plan is Active (All Machine Types):**
- Auto/Manual toggle is visible
- If Auto: Targets follow plan (controls disabled/grayed)
- If Manual: User has full control (all sliders active)
- Mode/controls adapt to plan target type

**When No Plan (All Machine Types):**
- No Auto/Manual toggle (always manual control)
- All controls are active
- User has full control over all parameters

**MVP Requirements (Sensors Page Pattern):**
- ✅ Full navigation screen with standard back button in header
- ✅ Left-to-right swipe gesture ENABLED for back navigation
- ❌ NOT a vertically swipeable sheet (uses standard navigation instead)
- ✅ Recording process continues uninterrupted in background
- ✅ Screen adapts dynamically based on machine type detected via FTMS service
- ✅ Follows same navigation pattern as `/record/sensors` screen

### Plan Target Conversion (FTP-Based)

**Converting Percentage-Based Targets to Watts:**
```typescript
const convertPlanTargetToWatts = (step: IntervalStep, profile: Profile): number => {
  if (step.targetType === 'power_absolute') {
    return step.targetPower  // Already in watts
  }

  if (step.targetType === 'power_percent_ftp') {
    const ftp = profile.ftp  // Functional Threshold Power (watts)
    if (!ftp) {
      showError("FTP not set in profile. Cannot calculate target power.")
      return 0
    }
    return ftp * (step.targetPercent / 100)
  }

  // For heart rate or cadence targets: No direct FTMS control
  // User controls effort to reach HR/cadence target
  return 0  // No FTMS power target
}
```

**Grade-Based Resistance Adjustment:**
```typescript
const calculateGradeResistance = (grade: number, weight: number): number => {
  // Physics: Additional power needed to climb grade
  // P_grade = m × g × v × sin(θ)
  // Simplified: ~10 watts per % grade per 70kg at 30 km/h

  const velocity = currentSpeed  // m/s
  const weightKg = weight || 70  // User weight + bike weight
  const gradeRadians = Math.atan(grade / 100)

  const additionalWatts = weightKg * 9.81 * velocity * Math.sin(gradeRadians)
  return Math.round(additionalWatts)
}
```

### Multi-Trainer Support

**Connecting Multiple FTMS Trainers:**
- Scenario: User has multiple trainers (e.g., bike trainer + rowing machine)
- FTMS control screen shows horizontal tabs for each trainer
- Each trainer can have independent mode and settings
- Only ONE trainer is typically active during a recording (based on activity type)

**Trainer Selection:**
```typescript
const getActiveTrainer = (): FTMSDevice | null => {
  const trainers = sensorsManager.getControllableTrainers()
  if (trainers.length === 0) return null

  // Return first trainer by default
  // User can switch via tabs in FTMS control screen
  return trainers[0]
}
```

---

## 4.12 Error Boundary Strategy & Fault Tolerance

To ensure recording continuity even when UI components crash, the app implements zone-level error boundaries.

### Error Boundary Architecture

**Zone-Level Error Boundaries:**
```typescript
<ErrorBoundary
  FallbackComponent={ZoneAFallback}
  onError={(error, stackTrace) => logError('Zone A', error, stackTrace)}
>
  <ZoneA />  {/* Context Layer: Map/Graph */}
</ErrorBoundary>

<ErrorBoundary
  FallbackComponent={ZoneBFallback}
  onError={(error, stackTrace) => logError('Zone B', error, stackTrace)}
>
  {plan.hasPlan && <ZoneB />}  {/* Guidance Layer: Plan Card */}
</ErrorBoundary>

<ErrorBoundary
  FallbackComponent={ZoneCFallback}
  onError={(error, stackTrace) => logError('Zone C', error, stackTrace)}
  isCritical={true}
>
  <ZoneC />  {/* Data Layer: Metrics Grid */}
</ErrorBoundary>
```

**Isolation Principle:**
- Each zone has independent error boundary
- If Zone A crashes → Zone B and Zone C continue functioning
- If Zone B crashes → Zone A and Zone C continue functioning
- If Zone C crashes → **Critical error** (metrics are essential)

### Fallback Components

**Non-Critical Zone Fallback (Zone A, Zone B):**
```tsx
const ZoneAFallback = ({ error, resetError }: FallbackProps) => (
  <View className="flex-1 bg-gray-100 items-center justify-center p-4">
    <Text className="text-gray-600 text-center mb-4">
      Unable to display map
    </Text>
    <Button onPress={resetError}>
      Retry
    </Button>
  </View>
)
```
- Shows friendly error message
- Provides "Retry" button to attempt remount
- Recording continues in background (service unaffected)
- Other zones remain fully functional

**Critical Zone Fallback (Zone C):**
```tsx
const ZoneCFallback = ({ error }: FallbackProps) => {
  // Zone C is critical - if it crashes, prompt user to save
  useEffect(() => {
    Alert.alert(
      'Critical Error',
      'Metrics display has crashed. Recording data is safe. Would you like to finish and save this recording?',
      [
        { text: 'Save & Exit', onPress: () => service.finish() },
        { text: 'Try to Continue', onPress: () => {
          // Attempt to continue without metrics display
          // User can still use pause/finish buttons in footer
        }}
      ]
    )
  }, [])

  return (
    <View className="flex-1 bg-red-50 items-center justify-center">
      <Text className="text-red-600">Metrics Unavailable</Text>
    </View>
  )
}
```
- Metrics grid is essential for workout feedback
- If it crashes: Prompt user with options
- Recording continues (but user experience is degraded)

### Service-Level Error Handling

**ActivityRecorderService Errors:**
```typescript
class ActivityRecorderService extends EventEmitter {
  private handleError(error: Error, context: string) {
    console.error(`[ActivityRecorder] ${context}:`, error)

    // Emit error event to UI
    this.emit('error', {
      message: error.message,
      context,
      recoverable: this.isRecoverableError(error)
    })

    // Critical errors: GPS failure, storage full, sensor manager crash
    if (!this.isRecoverableError(error)) {
      this.emit('criticalError', {
        message: 'Recording cannot continue. Please save and restart.',
        error
      })
    }
  }

  private isRecoverableError(error: Error): boolean {
    // GPS signal lost: Recoverable (wait for signal)
    if (error.message.includes('GPS')) return true

    // Sensor disconnected: Recoverable (user can reconnect)
    if (error.message.includes('sensor')) return true

    // Storage full: Not recoverable (must finish recording)
    if (error.message.includes('storage')) return false

    // Unknown errors: Assume not recoverable
    return false
  }
}
```

**UI Handling of Service Errors:**
```typescript
// In RecordScreen component
useEffect(() => {
  if (!service) return

  const handleError = (errorInfo: ErrorInfo) => {
    if (errorInfo.recoverable) {
      // Show non-blocking toast notification
      Toast.show({
        type: 'error',
        text1: 'Warning',
        text2: errorInfo.message,
        visibilityTime: 3000
      })
    } else {
      // Show blocking alert, prompt to save
      Alert.alert(
        'Critical Error',
        errorInfo.message,
        [
          { text: 'Save Recording', onPress: () => service.finish() }
        ]
      )
    }
  }

  service.on('error', handleError)
  return () => service.off('error', handleError)
}, [service])
```

### Common Error Scenarios

**GPS Permission Denied (Outdoor Activity):**
```typescript
// Before starting recording
if (activityLocation === 'outdoor') {
  const hasPermission = await checkGPSPermission()
  if (!hasPermission) {
    Alert.alert(
      'GPS Required',
      'Outdoor activities require location permission. Would you like to switch to indoor mode?',
      [
        { text: 'Open Settings', onPress: () => openAppSettings() },
        { text: 'Switch to Indoor', onPress: () => setActivityLocation('indoor') }
      ]
    )
    return  // Block recording start
  }
}
```

**Storage Full During Recording:**
```typescript
// In StreamBuffer write operation
try {
  await FileSystem.writeAsStringAsync(filePath, data)
} catch (error) {
  if (error.message.includes('ENOSPC')) {
    // Storage full
    service.handleError(new Error('Storage full'), 'StreamBuffer')

    // Prompt user to finish immediately
    Alert.alert(
      'Storage Full',
      'Unable to continue recording. Please finish and save now.',
      [{ text: 'Finish Recording', onPress: () => service.finish() }]
    )
  }
}
```

**BLE Adapter Disabled (Sensors Won't Connect):**
```typescript
// In SensorsManager
const checkBluetoothEnabled = async () => {
  const state = await BluetoothManager.getState()
  if (state !== 'on') {
    Alert.alert(
      'Bluetooth Disabled',
      'Enable Bluetooth to connect sensors.',
      [
        { text: 'Enable', onPress: () => BluetoothManager.enable() },
        { text: 'Continue Without Sensors', style: 'cancel' }
      ]
    )
  }
}
```

### Error Logging & Telemetry

**Local Error Logging:**
```typescript
const logError = (zone: string, error: Error, stackTrace: string) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    zone,
    message: error.message,
    stack: stackTrace,
    recordingId: service.recordingId,
    deviceInfo: {
      platform: Platform.OS,
      version: Platform.Version
    }
  }

  // Write to local file for later upload
  FileSystem.appendFile('error_log.json', JSON.stringify(errorLog) + '\n')

  // Also log to console for development
  console.error('[Error Boundary]', errorLog)
}
```

**Future: Remote Error Reporting**
- Consider integrating Sentry or similar (not in current scope)
- Upload error logs on WiFi connection (background sync)

---

## 4.13 Performance Targets & Monitoring

To ensure smooth recording experience, the app must meet strict performance targets.

### Frame Rate Targets

**Main Thread (UI Rendering):**
- **Target:** 60fps constant (16.6ms per frame)
- **Minimum:** 30fps during heavy operations (33ms per frame)
- **Measurement:** Use React DevTools Profiler or Flipper

**Specific Operations:**
- Zone transitions (focus/minimize): 60fps (smooth spring animation)
- Footer expansion/collapse: 60fps (native @gorhom/bottom-sheet animation)
- Map rendering: Max 100ms per frame (acceptable for complex polylines)
- Metric updates: Instant (< 16ms) for readable text

**Performance Budget Per Frame:**
```
Frame Budget (16.6ms total):
- React reconciliation: < 5ms
- Layout calculations: < 3ms
- Native rendering: < 6ms
- JS event handlers: < 2ms
- Buffer: 0.6ms
```

### Memory Targets

**Baseline Memory Usage (App Idle):**
- Target: < 100MB RAM
- Includes: React Native bridge, UI components, service layer

**During Active Recording:**
- Target: < 150MB RAM
- Includes: Baseline + GPS tracking + sensor connections + stream buffers

**Memory-Intensive Operations:**
- Map rendering: ~30MB (tiles, polylines, markers)
- GPS breadcrumb buffer: ~5MB (10,000 points × 0.5KB per point)
- Sensor stream buffer: ~10MB (60 seconds of high-frequency data)
- Chart rendering (Skia canvas): ~15MB

**Memory Management:**
- GPS breadcrumbs: Prune points older than 10,000 (keep recent path)
- Sensor buffers: Rolling 60-second window (discard older data)
- Map tiles: Use react-native-maps caching (handled by library)

**Memory Leak Prevention:**
```typescript
// Always clean up event listeners
useEffect(() => {
  service.on('readingsUpdated', handleReadings)
  return () => service.off('readingsUpdated', handleReadings)
}, [service])

// Unsubscribe from intervals
useEffect(() => {
  const interval = setInterval(updateTime, 1000)
  return () => clearInterval(interval)
}, [])
```

### Battery Consumption Targets

**GPS Recording (Outdoor Activities):**
- Target: < 5% battery drain per hour
- Factors: GPS accuracy mode, update frequency, screen brightness
- Optimization: Use "balanced" GPS mode (not "high accuracy") during recording

**Indoor Recording (No GPS):**
- Target: < 2% battery drain per hour
- Factors: BLE connections, screen on, FTMS communication
- Optimization: Reduce BLE scan frequency, use lower screen brightness

**Battery Optimization Strategies:**
```typescript
// GPS: Use balanced accuracy mode
LocationManager.setAccuracy('balanced')  // Not 'high'
LocationManager.setUpdateInterval(1000)  // 1 second (not 500ms)

// BLE: Reduce scan frequency when not actively pairing
if (recordingState === 'recording') {
  SensorsManager.setScanInterval(0)  // Stop scanning, only maintain connections
}

// Screen: Allow dimming during recording
ScreenManager.allowScreenDim(true)  // User can wake with tap
```

### Network Usage Targets

**During Recording:**
- Target: Near-zero network usage (all processing is local)
- Map tiles: Cached on device (no live tile downloads)
- No telemetry uploads during active recording (batch after finish)

**After Recording:**
- Activity upload: 1-5MB (compressed sensor data + GPS points)
- Defer non-critical uploads to WiFi connection

### Storage Usage Targets

**Per Recording Session:**
- GPS track: ~500KB - 2MB (10,000 points × 50-200 bytes)
- Sensor streams: ~5MB - 10MB (high-frequency power/HR/cadence data)
- Total: ~5MB - 12MB per hour of recording

**Storage Management:**
- Auto-delete recordings older than 30 days (if uploaded)
- Warn user if storage < 500MB available
- Compress sensor streams with pako (already implemented)

### Performance Monitoring

**React Native Performance Monitor:**
```typescript
// Enable in development
if (__DEV__) {
  import('react-native').then(({ PerformanceObserver }) => {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        console.log(`[Perf] ${entry.name}: ${entry.duration}ms`)
      })
    })
    observer.observe({ entryTypes: ['measure'] })
  })
}
```

**Custom Performance Markers:**
```typescript
// Measure zone transition performance
performance.mark('zone-expand-start')
// ... animation code ...
performance.mark('zone-expand-end')
performance.measure('zone-expand', 'zone-expand-start', 'zone-expand-end')
```

**Automated Performance Alerts:**
```typescript
const alertSlowOperation = (operationName: string, duration: number) => {
  if (duration > 100) {  // Slower than 100ms
    console.warn(`[Performance] ${operationName} took ${duration}ms (expected < 100ms)`)

    // Log to error tracking (future)
    // Sentry.captureMessage(`Slow operation: ${operationName}`)
  }
}
```

---

## 4.14 Testing Strategy & Validation Matrix

To ensure the reactive recording interface works correctly across all configurations, comprehensive testing is required.

### Conditional Rendering Tests (Section 1.5 Matrix)

**Test Each Configuration Combination:**
```typescript
describe('Zone Rendering Decision Matrix', () => {
  const testCases = [
    { outdoor: true, hasRoute: true, hasPlan: true, expectZoneA: 'map-with-route', expectZoneB: true },
    { outdoor: true, hasRoute: true, hasPlan: false, expectZoneA: 'map-with-route', expectZoneB: false },
    { outdoor: true, hasRoute: false, hasPlan: true, expectZoneA: 'map-trail-only', expectZoneB: true },
    { outdoor: true, hasRoute: false, hasPlan: false, expectZoneA: 'map-trail-only', expectZoneB: false },
    { outdoor: false, hasRoute: true, hasPlan: true, expectZoneA: 'map-virtual', expectZoneB: true },
    { outdoor: false, hasRoute: true, hasPlan: false, expectZoneA: 'map-virtual', expectZoneB: false },
    { outdoor: false, hasRoute: false, hasPlan: true, expectZoneA: 'hidden', expectZoneB: true },
    { outdoor: false, hasRoute: false, hasPlan: false, expectZoneA: 'hidden', expectZoneB: false },
  ]

  testCases.forEach(({ outdoor, hasRoute, hasPlan, expectZoneA, expectZoneB }) => {
    it(`renders correctly: ${outdoor ? 'outdoor' : 'indoor'}, ${hasRoute ? 'route' : 'no-route'}, ${hasPlan ? 'plan' : 'no-plan'}`, () => {
      const { getByTestId, queryByTestId } = render(
        <RecordScreen
          activityLocation={outdoor ? 'outdoor' : 'indoor'}
          route={hasRoute ? mockRoute : null}
          plan={hasPlan ? mockPlan : null}
        />
      )

      // Check Zone A
      if (expectZoneA === 'hidden') {
        expect(queryByTestId('zone-a')).toBeNull()
      } else {
        expect(getByTestId('zone-a')).toBeTruthy()
        expect(getByTestId(`zone-a-${expectZoneA}`)).toBeTruthy()
      }

      // Check Zone B
      if (expectZoneB) {
        expect(getByTestId('zone-b')).toBeTruthy()
      } else {
        expect(queryByTestId('zone-b')).toBeNull()
      }

      // Zone C always rendered
      expect(getByTestId('zone-c')).toBeTruthy()
    })
  })
})
```

### Zone Transition Tests (Dynamic Configuration Changes)

**Test: Attaching Plan Mid-Workout**
```typescript
it('animates Zone B into view when plan is attached mid-workout', async () => {
  const { getByTestId, queryByTestId } = render(<RecordScreen />)

  // Initially no plan
  expect(queryByTestId('zone-b')).toBeNull()
  expect(getByTestId('zone-c')).toHaveStyle({ height: '50%' })  // Zone C expanded

  // Attach plan
  act(() => {
    service.attachPlan(mockPlan)
  })

  // Wait for animation
  await waitFor(() => {
    expect(getByTestId('zone-b')).toBeTruthy()
    expect(getByTestId('zone-c')).toHaveStyle({ height: '25%' })  // Zone C shrunk
  }, { timeout: 500 })
})
```

**Test: Completing Plan Mid-Workout**
```typescript
it('removes Zone B and expands Zone C when plan is completed', async () => {
  const { getByTestId, queryByTestId } = render(
    <RecordScreen plan={mockPlan} />
  )

  // Initially plan is visible
  expect(getByTestId('zone-b')).toBeTruthy()

  // Complete all plan steps
  act(() => {
    service.completePlan()
  })

  // Wait for animation
  await waitFor(() => {
    expect(queryByTestId('zone-b')).toBeNull()
    expect(getByTestId('zone-c')).toHaveStyle({ height: '50%' })
  }, { timeout: 500 })
})
```

### Focus Mode Interaction Tests

**Test: Zone Expansion Collapses Footer**
```typescript
it('collapses expanded footer when zone is tapped', async () => {
  const { getByTestId } = render(<RecordScreen />)

  // Expand footer
  act(() => {
    expandFooter()
  })
  expect(footerState).toBe('expanded')

  // Tap Zone A
  fireEvent.press(getByTestId('zone-a'))

  // Wait for sequential animation
  await waitFor(() => {
    expect(footerState).toBe('collapsed')
    expect(expandedElement).toBe('zone-a')
  }, { timeout: 600 })  // 200ms footer collapse + 300ms zone expand + buffer
})
```

**Test: Footer Expansion Minimizes Focused Zone**
```typescript
it('minimizes focused zone when footer is expanded', async () => {
  const { getByTestId } = render(<RecordScreen />)

  // Focus Zone A
  act(() => {
    expandZone('zone-a')
  })
  expect(expandedElement).toBe('zone-a')

  // Swipe up footer
  act(() => {
    expandFooter()
  })

  // Wait for sequential animation
  await waitFor(() => {
    expect(expandedElement).toBe('footer')
  }, { timeout: 600 })
})
```

### Recording Continuity Tests (Modals)

**Test: Recording Continues When Modal Opens**
```typescript
it('continues recording GPS and sensor data when modal is open', async () => {
  const { getByTestId } = render(<RecordScreen />)

  // Start recording
  act(() => service.start())

  // Record initial values
  const initialDistance = service.stats.distance
  const initialGPSPoints = service.locationManager.breadcrumbs.length

  // Open route picker modal
  fireEvent.press(getByTestId('route-button'))
  expect(queryByTestId('route-picker-modal')).toBeTruthy()

  // Wait 5 seconds
  await wait(5000)

  // Verify data collection continued
  expect(service.stats.distance).toBeGreaterThan(initialDistance)
  expect(service.locationManager.breadcrumbs.length).toBeGreaterThan(initialGPSPoints)
})
```

**Test: Interval Transition Notification While Modal Open**
```typescript
it('shows toast notification for interval transition when modal is open', async () => {
  const { getByTestId, getByText } = render(
    <RecordScreen plan={mockPlan} />
  )

  // Start recording
  act(() => service.start())

  // Open plan picker modal
  fireEvent.press(getByTestId('plan-button'))

  // Fast-forward to interval transition
  act(() => {
    jest.advanceTimersByTime(mockPlan.steps[0].duration * 1000)
  })

  // Verify toast appears on top of modal
  await waitFor(() => {
    expect(getByText(/Next: 3min @ 250W/i)).toBeTruthy()
  })
})
```

### Integration Tests (End-to-End Workflows)

**Test: Complete Outdoor Structured Workout**
```typescript
it('completes full workout flow: outdoor + route + plan', async () => {
  const { getByTestId } = render(<RecordScreen />)

  // 1. Configure activity
  fireEvent.press(getByTestId('activity-button'))
  fireEvent.press(getByText('Run'))
  fireEvent.press(getByText('Outdoor'))

  // 2. Attach route
  fireEvent.press(getByTestId('route-button'))
  fireEvent.press(getByText('Mountain Loop'))

  // 3. Attach plan
  fireEvent.press(getByTestId('plan-button'))
  fireEvent.press(getByText('VO2 Max Intervals'))

  // 4. Start recording
  fireEvent.press(getByTestId('start-button'))

  // Verify zones rendered correctly
  expect(getByTestId('zone-a-map-with-route')).toBeTruthy()
  expect(getByTestId('zone-b')).toBeTruthy()
  expect(getByTestId('zone-c')).toBeTruthy()

  // 5. Simulate workout (fast-forward 30 minutes)
  act(() => {
    jest.advanceTimersByTime(30 * 60 * 1000)
  })

  // 6. Finish recording
  fireEvent.press(getByTestId('pause-button'))
  fireEvent.press(getByTestId('finish-button'))

  // Verify navigation to submit screen
  expect(router.pathname).toBe('/record/submit')
})
```

### Performance Tests

**Test: Frame Rate During Zone Transition**
```typescript
it('maintains 60fps during zone expansion animation', async () => {
  const { getByTestId } = render(<RecordScreen />)

  const frames: number[] = []
  let lastFrameTime = performance.now()

  // Monitor frame times
  const frameMonitor = setInterval(() => {
    const now = performance.now()
    frames.push(now - lastFrameTime)
    lastFrameTime = now
  }, 16)  // Check every frame (60fps = 16.6ms)

  // Trigger zone expansion
  fireEvent.press(getByTestId('zone-a'))

  // Wait for animation to complete
  await wait(400)
  clearInterval(frameMonitor)

  // Calculate average frame time
  const avgFrameTime = frames.reduce((a, b) => a + b, 0) / frames.length

  // Assert: Average frame time should be < 20ms (allowing some drops to 50fps)
  expect(avgFrameTime).toBeLessThan(20)

  // Assert: No frames slower than 33ms (minimum 30fps)
  const slowFrames = frames.filter(t => t > 33)
  expect(slowFrames.length).toBe(0)
})
```

**Test: Memory Usage During Long Recording**
```typescript
it('does not leak memory during 2-hour recording', async () => {
  const { getByTestId } = render(<RecordScreen />)

  // Start recording
  act(() => service.start())

  const initialMemory = performance.memory.usedJSHeapSize

  // Simulate 2-hour workout (fast-forward)
  for (let hour = 0; hour < 2; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      act(() => {
        jest.advanceTimersByTime(60 * 1000)  // 1 minute
        // Simulate sensor readings
        service.sensorsManager.emit('readingsUpdated', mockReadings)
      })
    }
  }

  const finalMemory = performance.memory.usedJSHeapSize
  const memoryGrowth = finalMemory - initialMemory

  // Assert: Memory growth should be < 50MB (reasonable for 2-hour buffer)
  expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024)
})
```

### Edge Case Tests

**Test: GPS Signal Lost and Recovered**
```typescript
it('handles GPS signal loss gracefully', async () => {
  const { getByTestId, getByText } = render(
    <RecordScreen activityLocation="outdoor" />
  )

  act(() => service.start())

  // Simulate GPS signal loss
  act(() => {
    service.locationManager.emit('gpsSignalLost')
  })

  // Verify warning banner appears
  expect(getByText(/GPS Signal Lost/i)).toBeTruthy()

  // Verify map still visible with last known position
  expect(getByTestId('zone-a-map')).toBeTruthy()

  // Simulate GPS signal recovery
  act(() => {
    service.locationManager.emit('gpsSignalRestored')
  })

  // Verify warning banner disappears
  await waitFor(() => {
    expect(queryByText(/GPS Signal Lost/i)).toBeNull()
  })
})
```

**Test: Sensor Disconnects During Workout**
```typescript
it('shows notification when sensor disconnects', async () => {
  const { getByText } = render(<RecordScreen />)

  act(() => service.start())

  // Simulate heart rate sensor disconnection
  act(() => {
    service.sensorsManager.emit('sensorDisconnected', { type: 'heartRate' })
  })

  // Verify notification appears
  await waitFor(() => {
    expect(getByText(/Heart rate sensor disconnected/i)).toBeTruthy()
  })

  // Verify metrics show "--" for missing sensor
  expect(getByTestId('metric-heartrate')).toHaveTextContent('--')
})
```

### Testing Tools & Setup

**Required Testing Libraries:**
- `@testing-library/react-native` - Component testing
- `@testing-library/jest-native` - Extended matchers
- `jest` - Test runner (already configured)
- `react-native-testing-library` - Navigation mocking

**Mock Setup:**
```typescript
// Mock ActivityRecorderService
jest.mock('@/lib/services/ActivityRecorder', () => ({
  ActivityRecorderService: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    finish: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  }))
}))

// Mock LocationManager
jest.mock('@/lib/services/ActivityRecorder/LocationManager', () => ({
  LocationManager: jest.fn().mockImplementation(() => ({
    breadcrumbs: [],
    getCurrentPosition: jest.fn().mockResolvedValue(mockPosition),
  }))
}))
```

---

## 5. Updated User Journey Examples

The result of this design is a fluid, reactive experience that adapts to context.

### Journey 1: Outdoor Unstructured Run
**Configuration:** Outdoor + No Route + No Plan

1. User opens recording screen → Sees collapsed footer with **Start Button**
2. User swipes up footer → Sees **Activity Type: Running (Outdoor)** as first config item (defaulted)
3. User reviews other options (Route: None, Plan: None, Sensors: Connected) → Swipes footer down
4. Screen shows: **GPS Map (Zone A)** + **Session Metrics (Zone C)**
5. User taps "Start" → Recording begins, Activity Type option becomes locked/disabled
6. Map shows live GPS position and breadcrumb trail
7. User swipes up footer mid-run → Sees configuration options but Activity Type is now grayed out (locked)
8. User decides not to attach route or plan → Swipes footer down, continues running
9. Throughout workout: **Zone B never appears** (clean, uncluttered interface)

### Journey 2: Indoor Structured Trainer Workout
**Configuration:** Indoor + No Route + Power Sensor + Plan

1. User opens recording screen → Swipes up footer
2. User taps "Activity Type" → Modal opens → Selects "Bike" and "Indoor" → Modal closes
3. User taps "Plan" → Selects "VO2 Max Intervals" → Returns to footer
4. User swipes footer down → Screen shows: **Power Graph (Zone A)** + **Plan Card (Zone B)** + **Lap Metrics (Zone C)**
5. Zone B shows: "5min Warmup @ 120W, Next: 3min @ 250W"
6. User taps "Start" in footer → Recording begins, Activity Type becomes locked
7. FTMS trainer (if connected) automatically sets to 120W (ERG mode)
8. As warmup completes → Zone B animates to show next interval, trainer adjusts to 250W
9. User wants to see power in detail → Taps Zone A (Power Graph) → Expands to full screen
10. User taps minimize button → Returns to three-zone view
11. User swipes up footer → Taps "Smart Trainer" → Opens FTMS screen
12. User switches to Manual mode and adjusts resistance → Closes modal → Workout continues with manual control

### Journey 3: Outdoor Workout with Planned Route
**Configuration:** Outdoor + Route + No Plan

1. User opens recording screen → Swipes up footer
2. User taps "Activity Type" → Selects "Bike" and "Outdoor" → Modal closes
3. User taps "Route" → Selects "Mountain Loop" GPX route → Returns to footer
4. User swipes footer down → Screen shows: **GPS Map with Route Overlay (Zone A)** + **Session Metrics (Zone C)**
5. Map displays blue route polyline overlaid on map
6. User taps "Start" in footer → Recording begins, Activity Type becomes locked
7. Map shows blue route line, user's red breadcrumb trail, and position marker
8. Halfway through route → User taps map → Expands to full screen for better navigation
9. User approaches steep hill → Grade overlay shows "8.5%" in real-time
10. User taps minimize → Returns to normal view
11. Throughout workout: **Zone B never appears** (user is following route, not interval plan)

### Journey 4: Mid-Workout Configuration Change
**Configuration:** Starts as Indoor + No Route + No Plan → Adds Plan Mid-Workout

1. User swipes up footer → Taps "Activity Type" → Selects "Bike" and "Indoor"
2. User swipes footer down → Taps "Start" → Recording begins (Activity Type now locked)
3. User starts free-form indoor bike with power meter → Sees **Power Graph (Zone A)** + **Session Metrics (Zone C)**
4. 10 minutes in, user decides to do intervals → Swipes up footer
5. User taps "Plan" → Selects "VO2 Max Intervals" → Modal closes, returns to footer view
6. User swipes footer down → **Zone B smoothly animates into view** (300ms transition)
7. Power Graph remains in Zone A, Zone C metrics switch from "Session" to "Lap" mode
8. Plan begins immediately from current time, user continues workout with structure
9. FTMS trainer (if connected) switches to ERG mode and begins following plan targets

### Journey 5: Indoor Virtual Route Riding
**Configuration:** Indoor + Route + Power Sensor + Plan

1. User swipes up footer → Taps "Activity Type" → Selects "Bike" and "Indoor"
2. User taps "Route" → Selects "Alpe d'Huez" GPX route → Returns to footer
3. User taps "Plan" → Selects "Steady State Climb" interval plan → Returns to footer
4. User swipes footer down → Screen shows: **Map with Route Polyline (Zone A)** + **Plan Card (Zone B)** + **Lap Metrics (Zone C)**
5. Zone A displays the route path as a polyline on map (virtual activity visualization)
6. Zone B shows interval targets: "10min @ 85% FTP, Next: 5min @ 200W"
7. User taps "Start" in footer → Recording begins, Activity Type becomes locked
8. As user rides and accumulates distance/speed → Virtual position indicator moves along route polyline
9. Route grade updates FTMS trainer resistance automatically (ERG mode follows plan + grade adjustments)
10. User can see exactly where they are on the virtual route throughout the workout
11. Mid-workout, user expands map to focus mode for better visualization → Taps minimize after checking progress
12. Zone C shows: Power, HR, Cadence, Speed, Duration (lap-focused metrics, dynamically reordered based on active plan targets)

**Common Thread:** In every journey, the recording controls (Pause/Lap/Resume/Finish) remain accessible at the exact same location. Users never navigate away from the recording screen (except to manage sensors). The interface adapts to their equipment and intent, showing only relevant information.

This is a UI that adapts to the athlete, rather than forcing the athlete to adapt to the UI.

---

## 6. Implementation Roadmap

This section provides a phased approach to implementing the reactive recording interface redesign, prioritizing core functionality and iterating toward the complete vision.

### Phase 0: Dependencies & Setup (1-2 days)

**Install Required Libraries:**
```bash
npm install @gorhom/bottom-sheet@latest
```

**Verify Existing Dependencies:**
- ✅ `react-native-reanimated` (already installed)
- ✅ `react-native-gesture-handler` (already installed)
- ✅ `react-native-maps` (already installed)
- ✅ ActivityRecorderService and all hooks (already implemented)

**Configure @gorhom/bottom-sheet:**
```typescript
// In app root (_layout.tsx or App.tsx)
import { GestureHandlerRootView } from 'react-native-gesture-handler'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Rest of app */}
    </GestureHandlerRootView>
  )
}
```

### Phase 1: Core Layout & Zone Structure (3-5 days)

**1.1: Create Zone Component Skeletons**
- Create `/components/RecordingZones/ZoneA.tsx` (empty placeholder)
- Create `/components/RecordingZones/ZoneB.tsx` (empty placeholder)
- Create `/components/RecordingZones/ZoneC.tsx` (empty placeholder)
- Create `/components/RecordingZones/types.ts` (shared types)

**1.2: Implement Conditional Rendering Logic**
```typescript
// In new record/index.tsx
const RecordScreen = () => {
  const service = useActivityRecorder(profile)
  const state = useRecordingState(service)
  const plan = usePlan(service)

  // Activity configuration (before recording starts)
  const [activityLocation, setActivityLocation] = useState<'indoor' | 'outdoor'>('outdoor')
  const [currentRoute, setCurrentRoute] = useState<Route | null>(null)

  // Zone rendering decisions
  const shouldRenderZoneA = activityLocation === 'outdoor' || currentRoute !== null
  const shouldRenderZoneB = plan.hasPlan

  return (
    <View className="flex-1">
      {/* Zone A - Conditional */}
      {shouldRenderZoneA && (
        <ErrorBoundary FallbackComponent={ZoneAFallback}>
          <ZoneA
            activityLocation={activityLocation}
            route={currentRoute}
          />
        </ErrorBoundary>
      )}

      {/* Zone B - Conditional */}
      {shouldRenderZoneB && (
        <ErrorBoundary FallbackComponent={ZoneBFallback}>
          <ZoneB plan={plan} />
        </ErrorBoundary>
      )}

      {/* Zone C - Always Rendered */}
      <ErrorBoundary FallbackComponent={ZoneCFallback} isCritical>
        <ZoneC />
      </ErrorBoundary>

      {/* Footer - Added in Phase 2 */}
    </View>
  )
}
```

**1.3: Implement Zone Sizing Logic**
```typescript
// Calculate zone heights based on what's visible
const calculateZoneHeights = (
  shouldRenderZoneA: boolean,
  shouldRenderZoneB: boolean,
  expandedElement: ExpandedElement
) => {
  if (expandedElement === 'zone-a') {
    return { zoneA: '100%', zoneB: 0, zoneC: 0 }
  }
  if (expandedElement === 'zone-b') {
    return { zoneA: 0, zoneB: '100%', zoneC: 0 }
  }

  // Normal sizing
  if (shouldRenderZoneA && shouldRenderZoneB) {
    return { zoneA: '35%', zoneB: '25%', zoneC: '25%' }
  }
  if (shouldRenderZoneA && !shouldRenderZoneB) {
    return { zoneA: '35%', zoneB: 0, zoneC: '50%' }
  }
  if (!shouldRenderZoneA && shouldRenderZoneB) {
    return { zoneA: 0, zoneB: '25%', zoneC: '50%' }
  }
  // Neither A nor B
  return { zoneA: 0, zoneB: 0, zoneC: '75%' }
}
```

**Deliverable:** Three-zone layout with conditional rendering working correctly for all 8 configuration combinations.

---

### Phase 2: Bottom Sheet Footer (3-4 days)

**2.1: Implement Basic Footer with @gorhom/bottom-sheet**
```typescript
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet'

const RecordScreen = () => {
  const bottomSheetRef = useRef<BottomSheet>(null)
  const snapPoints = useMemo(() => [120, '60%'], [])

  return (
    <View className="flex-1">
      {/* Zones... */}

      <BottomSheet
        ref={bottomSheetRef}
        index={0}  // Start collapsed
        snapPoints={snapPoints}
        enablePanDownToClose={false}  // Prevent accidental close
      >
        <BottomSheetView>
          {/* Footer content */}
        </BottomSheetView>
      </BottomSheet>
    </View>
  )
}
```

**2.2: Implement Recording Control Buttons**
- Start/Pause/Resume/Finish buttons with state-based visibility
- Lap button (when recording)
- Next Step button (when plan active and can advance)

**2.3: Implement Expanded Footer Configuration Menu**
- Activity Type selection (first item, disabled after start)
- Route management (always visible)
- Plan management (always visible)
- Sensors management (links to /record/sensors)
- FTMS control (conditional, when trainer connected)

**2.4: Integrate ActivitySelectionModal**
- Reuse existing `ActivitySelectionModal` component
- Open when user taps "Activity Type" in footer
- Update configuration state on selection

**Deliverable:** Swipeable footer with recording controls and configuration menu fully functional.

---

### Phase 3: Zone A Implementation (4-6 days)

**3.1: Refactor Existing MapCard**
- Extract map logic from `components/RecordingCarousel/MapCard.tsx`
- Remove carousel-specific code
- Adapt for vertical layout

**3.2: Implement GPS Map with Route (Outdoor)**
```typescript
// ZoneA.tsx
const ZoneA = ({ activityLocation, route }) => {
  if (activityLocation === 'outdoor') {
    return <GPSMapView route={route} />
  }

  if (activityLocation === 'indoor' && route) {
    return <VirtualRouteMapView route={route} />
  }

  // Indoor + no route: Zone A hidden at parent level
  return null
}
```

**3.3: Implement Virtual Route Following (Indoor + Route)**
- Display route polyline on map
- Calculate virtual position based on distance/speed
- Update position marker every 1 second
- Show grade at current position

**3.4: Implement Focus Mode for Zone A**
- Add tap gesture handler
- Animate zone expansion to full screen
- Show minimize button overlay
- Handle mutual exclusivity with footer

**Deliverable:** Zone A displays GPS map (outdoor) or virtual route map (indoor) with focus mode expansion.

---

### Phase 4: Zone B Implementation (3-4 days)

**4.1: Extract Plan Card Logic**
- Refactor `components/RecordingCarousel/DashboardCard.tsx` plan display
- Extract activity graph, current step display, next step preview
- Remove dashboard-specific metrics

**4.2: Implement Plan Card Component**
```typescript
// ZoneB.tsx
const ZoneB = ({ plan }) => {
  return (
    <View className="flex-1 p-4">
      <Text className="text-lg font-bold">{plan.name}</Text>
      <ActivityIntensityChart steps={plan.steps} currentStep={plan.currentStepIndex} />
      <CurrentStepDisplay step={plan.currentStep} progress={plan.stepProgress} />
      <NextStepPreview step={plan.nextStep} />
    </View>
  )
}
```

**4.3: Implement Zone Mount/Unmount Animation**
- Use `react-native-reanimated` for smooth height/opacity animation
- Trigger when plan is attached/detached mid-workout
- 300ms ease-out animation

**4.4: Implement Focus Mode for Zone B**
- Same pattern as Zone A
- Tap to expand, minimize button to collapse

**Deliverable:** Zone B displays workout plan with current/next step info, animates in/out when plan changes.

---

### Phase 5: Zone C Implementation (3-4 days)

**5.1: Extract Metrics Grid Logic**
- Refactor existing metrics display from `DashboardCard.tsx`
- Create flexible grid layout (2-column, auto-reflow)

**5.2: Implement Adaptive Metric Ordering**
```typescript
const getMetricOrder = (planTargets: PlanTargets | null) => {
  const baseMetrics = ['time', 'lapTime', 'speed', 'distance', 'heartRate', 'power', 'cadence', 'grade', 'calories']

  if (!planTargets) return baseMetrics

  // Reorder: Active plan targets first
  const targetMetrics = Object.keys(planTargets).filter(key => planTargets[key] !== null)
  const nonTargetMetrics = baseMetrics.filter(m => !targetMetrics.includes(m))

  return [...targetMetrics, ...nonTargetMetrics]
}
```

**5.3: Implement Metric Availability Logic**
- Show "--" when sensor/data not available
- Different behavior for indoor vs. outdoor
- Calculated metrics (e.g., speed from power)

**5.4: Implement Target Comparison (When Plan Active)**
- Show actual vs. target for power/HR
- Color coding (green = on target, red = off target)
- Target zones (e.g., "Zone 2" for heart rate)

**Deliverable:** Zone C displays all relevant metrics with adaptive ordering and target comparison.

---

### Phase 6: FTMS Control Screen (2-3 days)

**6.1: Create FTMS Control Screen Component**
- Full navigation screen at `/record/ftms` (not a modal)
- Follows same pattern as `/record/sensors` screen
- Horizontal tabs for multiple trainers (if applicable)
- Mode selector: ERG / SIM / Resistance
- Back button in header with left-to-right swipe gesture enabled

**6.2: Implement Control Logic**
- ERG mode: Power target slider with +/- buttons
- SIM mode: Grade/wind/resistance inputs
- Resistance mode: Level selector (1-20)
- Auto/Manual toggle (when plan active)

**6.3: Integrate with FTMSController**
- Use existing `FTMSController` class
- Call `setPower()`, `setSimulation()`, `setResistance()` based on mode
- Handle smooth ramp when returning to auto mode

**6.4: Real-Time Status Display**
- Show current power output, cadence, resistance level
- Update every second

**Deliverable:** FTMS control screen with full trainer control capability, following sensors page navigation pattern.

---

### Phase 7: Route & Plan Picker Modals (2-3 days)

**7.1: Create Route Picker Modal**
- Modal overlay with scrollable list of saved GPX routes
- Display route name, distance, elevation gain
- "Add Route" / "Change Route" / "Remove Route" actions
- Immediately update Zone A on selection

**7.2: Create Plan Picker Modal**
- Modal overlay with scrollable list of workout plans
- Display plan name, duration, total steps
- "Add Plan" / "Change Plan" / "Remove Plan" actions
- Immediately update Zone B on selection

**7.3: Handle Mid-Workout Changes**
- Allow route/plan attachment during recording
- Trigger zone mount animations
- Update FTMS trainer mode if applicable

**Deliverable:** Route and plan picker modals with mid-workout configuration changes.

---

### Phase 8: Recording Continuity & Background Handling (2-3 days)

**8.1: Verify Service Continues During Modals**
- Test that GPS tracking continues when modal is open
- Test that sensor readings continue
- Test that plan step progression continues

**8.2: Implement Interval Transition Notifications**
❌ **REMOVED FROM MVP** - Toast notifications are out of scope
- **MVP:** User sees interval changes directly in Zone B (no notification needed)

**8.3: Implement Sensor Disconnection Alerts (MVP MODIFIED)**
- ❌ **REMOVED:** System notification banners
- ✅ **MVP:** Update footer badge ("2/5 sensors")
- ✅ **MVP:** Show icon indicator next to affected metric in Zone C
- Metrics show last known value with faded appearance

**8.4: Implement GPS Signal Loss Warning (MVP MODIFIED)**
- ❌ **REMOVED:** Persistent banner overlays
- ✅ **MVP:** Show "GPS Searching..." text overlay directly on map
- Subtle in-UI indicator (no intrusive banner)
- Map continues showing last known position

**8.5: Background/Foreground Handling**
- Test that recording continues when app is backgrounded
- Verify foreground service notification (Android)
- Verify background location permission (iOS)

**Deliverable:** Recording processes continue seamlessly during all modal interactions and app backgrounding.

---

### Phase 9: Animations & Polish (2-3 days)

**9.1: Refine Zone Transition Animations**
- Zone focus/minimize: Spring animation 
- Zone mount/unmount: Fade + slide (ease-out)
- Ensure 60fps during animations

**9.2: Implement Focus Mode + Footer Mutual Exclusivity**
- Enforce sequential animations (collapse one before expanding other)
- Smooth transitions with proper timing

**9.3: Add Accessibility Improvements and Features**
- ❌ **REMOVED FROM MVP** - Haptic feedback is out of scope
- ❌ **REMOVED:** Voice control commands (custom voice features out of scope)

---

### Phase 10: Testing & Validation (3-5 days)

**10.2: Manual Integration Tests**
- Complete workout flows (outdoor structured, indoor virtual, etc.)
- Mid-workout configuration changes
- Modal interactions during recording

**10.3: Edge Case Tests**
- GPS signal loss and recovery
- Sensor disconnection during workout
- App backgrounding/foregrounding
- Storage full scenario
- BLE adapter disabled

**10.5: Manual QA Testing**
- Test on multiple device sizes (iPhone SE, iPhone 15 Pro Max, iPad)

**Deliverable:** Comprehensive test coverage with all tests passing.

---

### Phase 11: Migration & Cleanup (1-2 days)

**11.1: Remove Old Carousel Implementation**
- Delete `components/RecordingCarousel/` folder
- Remove carousel dependencies (if no longer used elsewhere)
- Clean up unused carousel types

**11.2: Update Related Screens**
- Ensure `/record/submit` receives correct data


**Deliverable:** Clean codebase with old carousel code removed and documentation updated.

---

## Implementation Timeline Estimate

**Total Estimated Time:** 30-40 development days (6-8 weeks for single developer)

**Breakdown:**
- Phase 0: Dependencies & Setup (1-2 days)
- Phase 1: Core Layout & Zone Structure (3-5 days)
- Phase 2: Bottom Sheet Footer (3-4 days)
- Phase 3: Zone A Implementation (4-6 days)
- Phase 4: Zone B Implementation (3-4 days)
- Phase 5: Zone C Implementation (3-4 days)
- Phase 6: FTMS Control Screen (2-3 days)
- Phase 7: Route & Plan Picker Modals (2-3 days)
- Phase 8: Recording Continuity (2-3 days)
- Phase 9: Animations & Polish (2-3 days)
- Phase 10: Testing & Validation (3-5 days)
- Phase 11: Migration & Cleanup (1-2 days)
- Phase 12: Beta Testing (Ongoing)

**Critical Path:** Phases 1-5 are blocking for core functionality. Phases 6-9 can be parallelized or done iteratively.

**Risk Mitigation:**
- If @gorhom/bottom-sheet has compatibility issues: Fall back to custom bottom sheet with react-native-reanimated
- If Zone A map performance is poor: Implement simplified map view with lower detail
- If FTMS integration is complex: Defer Phase 6 to post-MVP

**MVP Scope Reductions (Already Applied):**
- ❌ HR/Power graphs in Zone A (map-only)
- ❌ Notification banners and system overlays
- ❌ Haptic feedback for all interactions
- ❌ Voice feedback and audio cues
- ✅ Simplified footer labels (hide specific names)
- ✅ Swipe-down gestures disabled on all sheets
- ✅ Left-to-right swipe only on Sensors screen
- ✅ FTMS machine-specific configurations (Bikes, Rowers, Treadmills, Ellipticals)

---

## Success Criteria

**Functional Requirements:**
- ✅ All 8 configuration combinations render correctly
- ✅ Recording continues during modal interactions
- ✅ Zone focus mode works without covering footer
- ✅ Footer expands/collapses smoothly
- ✅ FTMS trainer responds to plan targets in auto mode
- ✅ Virtual route following works for indoor activities
- ✅ Zone A shows map-only (no HR/Power graphs)

**MVP UI/UX Requirements:**
- ✅ All sheets have "< Back" button (no swipe-down dismiss)
- ✅ Left-to-right swipe enabled only on Sensors screen
- ✅ Left-to-right swipe disabled on Record screen
- ✅ Footer shows simplified labels ("Edit Plan" vs "VO2 Max Intervals")
- ✅ FTMS screen adapts to machine type (Bikes, Rowers, Treadmills, Ellipticals)
- ✅ Dynamic plan/route attach/detach works mid-workout
- ✅ Focus Modes (Map, Plan, Metrics) all functional

**MVP Scope Exclusions (Verified):**
- ❌ No notification banners or system overlays
- ❌ No haptic feedback
- ❌ No voice feedback or audio cues
- ❌ No HR/Power graphs in Zone A

**Performance Requirements:**
- ✅ 60fps during animations (minimum 30fps acceptable)
- ✅ < 150MB RAM during active recording
- ✅ < 5% battery drain per hour (outdoor)
- ✅ < 2% battery drain per hour (indoor)

**User Experience Requirements:**
- ✅ Users can complete a workout without leaving recording screen
- ✅ Critical controls (Pause/Finish) are always accessible
- ✅ Interface adapts to user's equipment and intent
- ✅ No unnecessary UI clutter for simple workouts

---

This roadmap provides a structured approach to implementing the reactive recording interface while maintaining existing functionality and ensuring a smooth transition from the current carousel-based design.
