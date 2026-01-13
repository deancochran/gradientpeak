# Implementation TODO: Reactive Recording Interface

**Last Updated:** 2026-01-13
**Status:** Not Started
**Verification Method:** `tsc --noEmit` after each phase

---

## Overview

This document tracks the implementation of the Single Vertical Stack Architecture for the mobile recording screen. The interface reactively adapts based on environment (Indoor/Outdoor), intent (Structured/Free), and equipment (Sensors/FTMS).

**Key Architectural Changes:**
- Migration from horizontal carousel (3 cards) to vertical 3-zone stack
- Swipeable footer using `@gorhom/bottom-sheet`
- Focus mode for zones (Map, Plan, Metrics)
- Dynamic attach/detach of plans/routes mid-workout
- Recording continuity preserved across all UI changes

**Implementation Order:** Database → Core Packages → Mobile

---

## Phase 0: Dependencies & Setup

Ensure required dependencies are installed before starting implementation.

### 0.1 Dependency Installation

- [ ] Verify `@gorhom/bottom-sheet` v4+ in mobile package
- [ ] Verify `react-native-reanimated` v3+ is installed
- [ ] Verify `react-native-gesture-handler` v2+ is installed

---

## Phase 1: Database Schema Changes

**Description:** Ensure database schema supports all required recording features. If no schema changes are needed, skip to Phase 2.

---

## Phase 2: Core Package Updates

**Description:** Update shared schemas, types, and utilities in `packages/core` to support new recording interface.

### 2.1 Schema Updates

- [ ] Review `packages/core/schemas/index.ts` for recording-related schemas
- [ ] Add/update schemas for recording state (not_started, recording, paused, finished)
- [ ] Add/update schemas for activity configuration (category, location, plan, route)
- [ ] Verify sensor connection status types
- [ ] Verify FTMS connection and mode types
- [ ] Run `tsc --noEmit` to verify schema changes

### 2.2 Type Definitions

- [ ] Define types for zone rendering states (ZoneA, ZoneB, ZoneC visibility)
- [ ] Define types for focus mode: `'none' | 'zone-a' | 'zone-b' | 'zone-c' | 'footer'`
- [ ] Define types for footer snap states
- [ ] Define types for FTMS control modes (ERG, SIM, Resistance)
- [ ] Define types for machine-specific parameters (Rower, Bike, Treadmill, Elliptical)
- [ ] Run `tsc --noEmit` to verify type definitions

---

## Phase 3: Mobile Foundation - Vertical Zone Layout

**Description:** Implement the 3-zone vertical stack with conditional rendering logic. This is the core architectural change from carousel to stack.

### 3.1 Create Zone Components

**Location:** `apps/mobile/components/recording/zones/`

- [ ] Create `ZoneA.tsx` (Context Layer - Map/Route component)
- [ ] Create `ZoneB.tsx` (Guidance Layer - Plan/Interval component)
- [ ] Create `ZoneC.tsx` (Data Layer - Metrics component)
- [ ] Create `RecordingZones.tsx` (Container component that renders zones conditionally)
- [ ] Run `tsc --noEmit` to verify components

### 3.2 Implement Conditional Rendering Logic

**Reference:** Conditional Rendering Matrix in plan.md section 1

- [ ] Implement Zone A rendering logic:
  - Outdoor + Route → GPS map + route overlay + breadcrumb
  - Outdoor + No Route → GPS map + breadcrumb only
  - Indoor + Route → Virtual route map
  - Indoor + No Route → Unmount (hidden)
- [ ] Implement Zone B rendering logic:
  - Has Plan → Interval card
  - No Plan → Unmount (hidden)
- [ ] Implement Zone C rendering logic (always visible)
  - Metrics grid with conditional sensor data
  - Show "--" for unavailable sensors
- [ ] Run `tsc --noEmit` to verify logic

### 3.3 Zone Mount/Unmount Animations

**Animation:** `withTiming()` 300ms ease-out

- [ ] Implement smooth mount animation when zone becomes visible
- [ ] Implement smooth unmount animation when zone should hide
- [ ] Use `react-native-reanimated` with `useSharedValue` and `useAnimatedStyle`
- [ ] Test all 8 configurations from rendering matrix
- [ ] Target 60fps (30fps minimum acceptable)
- [ ] Run `tsc --noEmit` to verify animations

### 3.4 Update Main Recording Screen

**File:** `apps/mobile/app/(internal)/(standard)/record/index.tsx`

- [ ] Remove old carousel implementation (`RecordingCarousel` component)
- [ ] Import and integrate `RecordingZones` component
- [ ] Set up vertical stack layout with proper spacing
- [ ] Account for iOS status bar (44-47px) and Android navigation bar (48px)
- [ ] Wrap with `SafeAreaView` for platform safety
- [ ] Disable back swipe gesture: `gestureEnabled={false}`
- [ ] Run `tsc --noEmit` to verify changes

**Phase 3 Checkpoint:**
- [ ] Run `tsc --noEmit` - must pass with zero errors
- [ ] Verify all 8 configuration scenarios render correctly
- [ ] Manual verification: Zones mount/unmount smoothly

---

## Phase 4: Footer - Bottom Sheet Integration

**Description:** Replace existing footer with `@gorhom/bottom-sheet` implementation. Footer has 2 snap points: collapsed (120-140px) and expanded (60-70% screen).

### 4.1 Create Footer Component Structure

**Location:** `apps/mobile/components/recording/footer/`

- [ ] Create `RecordingFooter.tsx` (main bottom sheet component)
- [ ] Create `FooterCollapsed.tsx` (collapsed state UI)
- [ ] Create `FooterExpanded.tsx` (expanded state UI)
- [ ] Create `RecordingControls.tsx` (Pause/Resume/Lap/Finish buttons)
- [ ] Run `tsc --noEmit` to verify structure

### 4.2 Implement Bottom Sheet

**Library:** `@gorhom/bottom-sheet` with snap points `[120, '60%']`

- [ ] Initialize BottomSheet with 2 snap points: `[120, '60%']`
- [ ] Configure animation: `damping: 80, stiffness: 500, mass: 0.3`
- [ ] Disable swipe-down to close: `enablePanDownToClose={false}`
- [ ] Implement tap-outside-to-collapse behavior
- [ ] Set proper z-index: `z-index: 10` (zones are z-index: 1)
- [ ] Run `tsc --noEmit` to verify implementation

### 4.3 Collapsed State UI (Before Recording)

**Height:** 120-140px

- [ ] Display selected activity (category icon + "Quick Start" or plan name)
- [ ] Display "Start" button (full-width green, 56px height)
- [ ] Wire up start button to begin recording
- [ ] Run `tsc --noEmit` to verify UI

### 4.4 Collapsed State UI (During Recording)

**Height:** 120-140px

- [ ] Display activity type above buttons
- [ ] Display primary buttons row: Pause/Resume | Lap | Finish
- [ ] Pause/Resume button: Toggle state, 48px height
- [ ] Lap button: 48px circular, increments lap counter
- [ ] Finish button: 48px, ends recording
- [ ] Wire up button actions to recording service
- [ ] Run `tsc --noEmit` to verify UI

### 4.5 Collapsed State UI (While Paused)

**Height:** 120-140px

- [ ] Display Resume | Discard | Finish buttons
- [ ] Show timer in paused state
- [ ] Wire up Resume to continue recording
- [ ] Wire up Discard to cancel recording
- [ ] Wire up Finish to end recording
- [ ] Run `tsc --noEmit` to verify UI

### 4.6 Expanded State UI

**Height:** 60-70% of screen

- [ ] Pin Pause/Resume | Lap | Finish controls at top (always accessible)
- [ ] Create 2-column configuration grid below controls
- [ ] Add "Activity" tile (category + location) - locked during recording
- [ ] Add "Plan" tile (attach/detach functionality)
- [ ] Add "Route" tile (attach/detach functionality)
- [ ] Add "Sensors" tile (navigates to `/record/sensors`)
- [ ] Add "Adjust" tile (FTMS control, navigates to `/record/ftms`)
- [ ] Run `tsc --noEmit` to verify UI

### 4.7 Footer State Management

- [ ] Create footer state context or hook for snap position
- [ ] Track collapsed vs expanded state
- [ ] Implement mutual exclusivity with zone focus mode
- [ ] When footer expands → minimize any focused zone first (300ms)
- [ ] When zone focuses → collapse footer first (200ms)
- [ ] Run `tsc --noEmit` to verify state management

**Phase 4 Checkpoint:**
- [ ] Run `tsc --noEmit` - must pass with zero errors
- [ ] Verify footer swipes smoothly between collapsed/expanded
- [ ] Verify all buttons functional in all states
- [ ] Manual verification: Footer never blocks critical UI

---

## Phase 5: Focus Mode Implementation

**Description:** Implement tap-to-expand functionality for Zones A, B, and C. Focused zones fill screen except for footer overlay. Mutually exclusive with footer expansion.

### 5.1 Focus Mode State Management

- [ ] Add focus mode state: `'none' | 'zone-a' | 'zone-b' | 'zone-c' | 'footer'`
- [ ] Implement state transitions with mutual exclusivity enforcement
- [ ] Track previous state for minimize button behavior
- [ ] Run `tsc --noEmit` to verify state management

### 5.2 Zone A Focus Mode

**Expansion:** Map fills screen except footer

- [ ] Add tap gesture to Zone A map
- [ ] Implement expand animation: `withSpring()` ~400ms
- [ ] Render minimize button in top-right corner
- [ ] Wire minimize button to collapse back to normal
- [ ] Test outdoor map with route
- [ ] Test outdoor map without route
- [ ] Test indoor virtual route
- [ ] Run `tsc --noEmit` to verify implementation

### 5.3 Zone B Focus Mode

**Expansion:** Plan card fills screen except footer

- [ ] Add tap gesture to Zone B plan card
- [ ] Implement expand animation: `withSpring()` ~400ms
- [ ] Render minimize button in top-right corner
- [ ] Wire minimize button to collapse back to normal
- [ ] Ensure interval chart and plan details visible when expanded
- [ ] Run `tsc --noEmit` to verify implementation

### 5.4 Zone C Focus Mode

**Expansion:** Metrics fill screen except footer

- [ ] Add tap gesture to Zone C metrics area
- [ ] Implement expand animation: `withSpring()` ~400ms
- [ ] Render minimize button in top-right corner
- [ ] Wire minimize button to collapse back to normal
- [ ] Enlarge metrics for better visibility when focused
- [ ] Run `tsc --noEmit` to verify implementation

### 5.5 Focus Mode & Footer Coordination

**Sequential animations to prevent conflicts**

- [ ] When footer swipe starts while zone focused:
  - Minimize focused zone (300ms)
  - Wait for completion
  - Allow footer to expand
- [ ] When zone tap occurs while footer expanded:
  - Collapse footer (200ms)
  - Wait for completion
  - Expand zone (300ms)
- [ ] Ensure smooth sequential animation flow
- [ ] Run `tsc --noEmit` to verify coordination

**Phase 5 Checkpoint:**
- [ ] Run `tsc --noEmit` - must pass with zero errors
- [ ] Verify all 3 zones can focus independently
- [ ] Verify minimize button works for all zones
- [ ] Verify mutual exclusivity with footer
- [ ] Manual verification: Animations feel smooth and natural

---

## Phase 6: Plan & Route Dynamic Attach/Detach

**Description:** Implement mid-workout plan and route attachment/detachment with smooth UI transitions.

### 6.1 Plan Picker Sheet

**Location:** `apps/mobile/components/recording/sheets/`

- [ ] Create `PlanPickerSheet.tsx` using `@gorhom/bottom-sheet`
- [ ] Display list of available training plans
- [ ] Add "Detach Plan" option if plan currently attached
- [ ] Add standard "< Back" button (top-left)
- [ ] Disable swipe-down: `enablePanDownToClose={false}`
- [ ] Enable tap-outside-to-dismiss
- [ ] Run `tsc --noEmit` to verify component

### 6.2 Route Picker Sheet

**Location:** `apps/mobile/components/recording/sheets/`

- [ ] Create `RoutePickerSheet.tsx` using `@gorhom/bottom-sheet`
- [ ] Display list of available routes
- [ ] Add "Detach Route" option if route currently attached
- [ ] Add standard "< Back" button (top-left)
- [ ] Disable swipe-down: `enablePanDownToClose={false}`
- [ ] Enable tap-outside-to-dismiss
- [ ] Run `tsc --noEmit` to verify component

### 6.3 Plan Attachment Logic

- [ ] Wire "Plan" tile in footer to open plan picker
- [ ] Implement plan attachment during recording:
  - Update recording state with new plan
  - Trigger Zone B mount animation if previously hidden
  - Update Zone C metric ordering based on plan targets
  - Ensure recording never pauses
- [ ] Implement plan detachment:
  - Remove plan from recording state
  - Trigger Zone B unmount animation
  - Reset Zone C metric ordering to default
- [ ] Run `tsc --noEmit` to verify logic

### 6.4 Route Attachment Logic

- [ ] Wire "Route" tile in footer to open route picker
- [ ] Implement route attachment during recording:
  - Update recording state with new route
  - Trigger Zone A mount animation if indoor and previously hidden
  - Update map overlay with route polyline
  - Ensure recording never pauses
- [ ] Implement route detachment:
  - Remove route from recording state
  - Trigger Zone A unmount animation if indoor
  - Clear route overlay from map
- [ ] Run `tsc --noEmit` to verify logic

### 6.5 Zone C Metric Reordering

**Priority:** Plan target metrics appear first

- [ ] Implement metric priority calculation based on plan targets
- [ ] Reorder metrics when plan attached (prioritize target metrics)
- [ ] Reset to default order when plan detached
- [ ] Animate reordering smoothly (optional, can be instant)
- [ ] Run `tsc --noEmit` to verify reordering

### 6.6 Recording Continuity Verification

- [ ] Verify GPS tracking continues during plan/route picker
- [ ] Verify sensor readings continue
- [ ] Verify plan step progression continues (if applicable)
- [ ] Verify metrics update correctly after picker dismissal
- [ ] Run `tsc --noEmit` to verify continuity

**Phase 6 Checkpoint:**
- [ ] Run `tsc --noEmit` - must pass with zero errors
- [ ] Verify plan attachment/detachment works mid-workout
- [ ] Verify route attachment/detachment works mid-workout
- [ ] Verify Zone B animates in/out correctly
- [ ] Manual verification: Recording never pauses during changes

---

## Phase 7: Sensors Integration

**Description:** Integrate existing sensor management with new recording interface. Ensure sensor status visible in footer and metrics.

### 7.1 Sensors Page Integration

**File:** `apps/mobile/app/(internal)/(standard)/record/sensors.tsx`

- [ ] Verify existing sensors page exists and is functional
- [ ] Enable left-to-right swipe gesture: `gestureEnabled={true}`
- [ ] Add standard back button for navigation
- [ ] Verify navigation from footer "Sensors" tile works
- [ ] Verify recording continues when sensors page open
- [ ] Run `tsc --noEmit` to verify integration

### 7.2 Footer Sensor Badge

**Display:** "X/Y" badge showing connected sensors

- [ ] Add sensor count badge to collapsed footer
- [ ] Display connected/total sensor count (e.g., "2/5")
- [ ] Update badge in real-time as sensors connect/disconnect
- [ ] Make badge tappable to open sensors page
- [ ] Run `tsc --noEmit` to verify badge

### 7.3 Zone C Sensor Indicators

**Display:** "--" for missing sensor data

- [ ] Update Zone C metrics to show "--" when sensor unavailable
- [ ] Add icon indicator for disconnected sensors (optional)
- [ ] Update metric display when sensor reconnects
- [ ] Handle sensor disconnection gracefully (no crashes)
- [ ] Run `tsc --noEmit` to verify indicators

### 7.4 Sensor Disconnection Handling

**User feedback for connection issues**

- [ ] Display footer badge update when sensor disconnects
- [ ] Update Zone C metric to show "--" immediately
- [ ] Add subtle indicator in Zone C for sensor issue (optional icon)
- [ ] Do not interrupt recording or show blocking alerts
- [ ] Run `tsc --noEmit` to verify handling

**Phase 7 Checkpoint:**
- [ ] Run `tsc --noEmit` - must pass with zero errors
- [ ] Verify sensor page navigation works
- [ ] Verify sensor badge displays correctly
- [ ] Verify metrics show "--" for missing sensors
- [ ] Manual verification: Recording continues during sensor changes

---

## Phase 8: FTMS Control Implementation

**Description:** Implement machine-specific FTMS control with Auto and Manual modes. Supports Rowers, Bikes, Treadmills, and Ellipticals.

### 8.1 FTMS Control Page Structure

**File:** `apps/mobile/app/(internal)/(standard)/record/ftms.tsx`

- [ ] Create FTMS control page as full navigation screen (not sheet)
- [ ] Enable left-to-right swipe gesture: `gestureEnabled={true}`
- [ ] Add standard back button for navigation
- [ ] Detect connected FTMS machine type
- [ ] Route to machine-specific UI based on type
- [ ] Run `tsc --noEmit` to verify page structure

### 8.2 Bike/Trainer Control UI

**Modes:** ERG (Mode 5), SIM (Mode 1), Resistance (Mode 4)

- [ ] Create `BikeControlUI.tsx` component
- [ ] Add Auto/Manual mode toggle (visible only when plan active)
- [ ] Implement ERG mode controls: Target power slider, +/- buttons
- [ ] Implement SIM mode controls: Grade/wind simulation, resistance adjustment
- [ ] Implement Resistance mode controls: Resistance level (1-20), +/- buttons
- [ ] Display FTP zones for reference
- [ ] Display weight input for grade calculations
- [ ] Gray out controls in Auto mode (plan-driven)
- [ ] Run `tsc --noEmit` to verify UI

### 8.3 Rower Control UI

**Controls:** Damper, Resistance, Stroke Rate

- [ ] Create `RowerControlUI.tsx` component
- [ ] Add Auto/Manual mode toggle (visible only when plan active)
- [ ] Implement damper control (1-10)
- [ ] Implement resistance slider
- [ ] Display stroke rate target
- [ ] Display drag factor (read-only)
- [ ] Gray out controls in Auto mode
- [ ] Run `tsc --noEmit` to verify UI

### 8.4 Treadmill Control UI

**Controls:** Speed, Incline

- [ ] Create `TreadmillControlUI.tsx` component
- [ ] Add Auto/Manual mode toggle (visible only when plan active)
- [ ] Implement speed slider with +/- buttons
- [ ] Implement incline slider with +/- buttons
- [ ] Display safety limits (max speed/incline)
- [ ] Gray out controls in Auto mode
- [ ] Run `tsc --noEmit` to verify UI

### 8.5 Elliptical Control UI

**Controls:** Resistance, Cadence Target

- [ ] Create `EllipticalControlUI.tsx` component
- [ ] Add Auto/Manual mode toggle (visible only when plan active)
- [ ] Implement resistance control (1-20)
- [ ] Display cadence target
- [ ] Display power (read-only)
- [ ] Gray out controls in Auto mode
- [ ] Run `tsc --noEmit` to verify UI

### 8.6 Auto Mode Logic

**Plan-driven FTMS control**

- [ ] Implement auto mode activation when plan attached
- [ ] Read current plan step target (power/pace/grade)
- [ ] Convert plan target to FTMS command
- [ ] Send FTMS control commands via `FTMSController`
- [ ] Update controls on plan step transitions
- [ ] Disable manual controls (grayed out)
- [ ] Run `tsc --noEmit` to verify auto mode

### 8.7 Manual Mode Override

**User-controlled FTMS**

- [ ] Implement manual mode toggle switch
- [ ] Enable manual controls (remove gray state)
- [ ] Wire +/- buttons to adjust resistance/power/speed
- [ ] Apply user adjustments via `FTMSController`
- [ ] Keep plan targets visible for reference (but not enforced)
- [ ] Plan progression continues on time (not adherence)
- [ ] Run `tsc --noEmit` to verify manual mode

### 8.8 Footer "Adjust" Tile Integration

- [ ] Wire "Adjust" tile in footer to open FTMS page
- [ ] Show "Adjust" tile only when FTMS device connected
- [ ] Navigate to `/record/ftms` on tile tap
- [ ] Verify recording continues when FTMS page open
- [ ] Run `tsc --noEmit` to verify integration

**Phase 8 Checkpoint:**
- [ ] Run `tsc --noEmit` - must pass with zero errors
- [ ] Verify all 4 machine types have specific UIs
- [ ] Verify Auto/Manual mode toggle works
- [ ] Verify FTMS commands sent correctly
- [ ] Manual verification: Recording continues during FTMS adjustments

---

## Phase 9: Indoor Virtual Route Progress

**Description:** Implement indoor route simulation with distance-based position tracking and grade-based FTMS adjustment.

### 9.1 Distance → GPS Track Mapping

**Algorithm:** Map cumulative distance to route GPS coordinates

- [ ] Track cumulative distance via speed sensor during indoor recording
- [ ] Load route GPS track (array of lat/lng/elevation points)
- [ ] Implement linear interpolation to map distance → position
- [ ] Calculate current virtual lat/lng based on distance traveled
- [ ] Calculate current elevation based on distance traveled
- [ ] Run `tsc --noEmit` to verify mapping logic

### 9.2 Virtual Position Marker

**Display:** Position marker on Zone A virtual route map

- [ ] Render route polyline on map in Zone A (indoor + route)
- [ ] Display virtual position marker at calculated lat/lng
- [ ] Animate marker movement along route smoothly
- [ ] Display progress percentage (distance completed / total route distance)
- [ ] Run `tsc --noEmit` to verify marker display

### 9.3 Grade Extraction & FTMS Application

**Auto-adjust resistance based on route grade**

- [ ] Calculate grade at current virtual position from elevation data
- [ ] Convert % grade to FTMS resistance adjustment
- [ ] Apply grade adjustment to FTMS in Auto mode
- [ ] Formula: `gradeWatts = weight * 9.81 * velocity * sin(atan(grade/100))`
- [ ] Combine with plan target power: `totalPower = targetPower + gradeWatts`
- [ ] Send combined power to FTMS via `FTMSController`
- [ ] Allow manual override (disables auto-grade)
- [ ] Run `tsc --noEmit` to verify grade application

### 9.4 Progress Display

**Zone A overlay with route progress**

- [ ] Display progress percentage in Zone A (e.g., "45% Complete")
- [ ] Display current grade in Zone A (e.g., "Grade: +3.5%")
- [ ] Display distance remaining (optional)
- [ ] Update display in real-time as distance increases
- [ ] Run `tsc --noEmit` to verify progress display

**Phase 9 Checkpoint:**
- [ ] Run `tsc --noEmit` - must pass with zero errors
- [ ] Verify virtual position marker tracks correctly
- [ ] Verify grade adjustments apply to FTMS
- [ ] Verify progress percentage displays correctly
- [ ] Manual verification: Indoor route feels realistic

---

## Phase 10: Background Continuity & Error Handling

**Description:** Ensure recording never pauses during UI interactions, navigation, or modal overlays. Handle errors gracefully.

### 10.1 Recording Service Persistence

**File:** `apps/mobile/lib/services/ActivityRecorderService.ts` (verify existing)

- [ ] Verify `ActivityRecorderService` persists across navigation
- [ ] Verify service not tied to component lifecycle
- [ ] Verify GPS tracking continues when screens change
- [ ] Verify sensor readings continue when screens change
- [ ] Verify plan step progression continues when screens change
- [ ] Run `tsc --noEmit` to verify persistence

### 10.2 React Context for Recording State

**Global state across navigation**

- [ ] Create `RecordingContext` (if not exists) in `apps/mobile/lib/contexts/`
- [ ] Provide recording status (not_started, recording, paused, finished)
- [ ] Provide current activity config (category, location, plan, route)
- [ ] Provide sensor connection status
- [ ] Provide FTMS connection and mode
- [ ] Wrap recording flow with context provider
- [ ] Run `tsc --noEmit` to verify context

### 10.3 GPS Loss Handling

**User feedback for GPS signal issues**

- [ ] Detect GPS signal loss in `LocationManager`
- [ ] Display "GPS Searching..." text overlay on Zone A map
- [ ] Do not pause recording (continue with last known position)
- [ ] Remove overlay when GPS signal restored
- [ ] Run `tsc --noEmit` to verify GPS handling

### 10.4 Sensor Disconnection Feedback

**Already handled in Phase 7, verify integration**

- [ ] Verify footer badge updates on sensor disconnect
- [ ] Verify Zone C metrics show "--" for disconnected sensor
- [ ] Verify no blocking alerts or popups
- [ ] Recording continues seamlessly
- [ ] Run `tsc --noEmit` to verify feedback

### 10.5 Plan Step Transitions

**Visual feedback for interval changes**

- [ ] Listen for plan step transition events in Zone B
- [ ] Update Zone B interval card with new step details
- [ ] Highlight current step in plan progression
- [ ] Display "next step" preview
- [ ] Ensure transitions visible even when modals open
- [ ] Run `tsc --noEmit` to verify transitions

### 10.6 Android Foreground Service

**Required for background recording on Android**

- [ ] Verify foreground service notification exists for Android
- [ ] Display persistent notification while recording
- [ ] Show recording time in notification
- [ ] Add Pause/Stop actions to notification
- [ ] Run `tsc --noEmit` to verify service

### 10.7 App Backgrounding/Foregrounding

**Preserve recording when app goes to background**

- [ ] Verify recording continues when app backgrounded
- [ ] Verify GPS tracking continues (iOS background location permission)
- [ ] Verify sensor readings continue
- [ ] Restore UI state when app returns to foreground
- [ ] Run `tsc --noEmit` to verify behavior

### 10.8 Error Boundaries

**Isolate zone failures to prevent full app crash**

- [ ] Create `RecordingErrorBoundary.tsx` component
- [ ] Wrap each zone independently:
  - `<RecordingErrorBoundary componentName="Zone A">`
  - `<RecordingErrorBoundary componentName="Zone B">`
  - `<RecordingErrorBoundary componentName="Zone C">`
- [ ] Display error message + "Reload Zone" button on failure
- [ ] Recording continues even if zone crashes
- [ ] Separate error boundary for critical services (whole-app fallback)
- [ ] Run `tsc --noEmit` to verify error boundaries

**Phase 10 Checkpoint:**
- [ ] Run `tsc --noEmit` - must pass with zero errors
- [ ] Verify recording never pauses during modals
- [ ] Verify GPS loss handled gracefully
- [ ] Verify sensor disconnects don't crash app
- [ ] Manual verification: Recording robust to interruptions

---

## Phase 11: Animations & Polish

**Description:** Refine animations for smooth 60fps experience. Tune gesture handling and timing.

### 11.1 Zone Transition Animation Refinement

**Target: 60fps, 30fps minimum acceptable**

- [ ] Review zone mount/unmount animations for smoothness
- [ ] Ensure `withTiming()` uses ease-out curve (300ms)
- [ ] Profile frame rate during transitions using React Native Performance Monitor
- [ ] Optimize if dropping below 30fps
- [ ] Run `tsc --noEmit` to verify changes

### 11.2 Focus Mode Animation Refinement

**Target: Smooth spring animation ~400ms**

- [ ] Review focus mode expand/collapse animations
- [ ] Ensure `withSpring()` uses proper damping (0.8) and stiffness (100)
- [ ] Test on multiple device types (low-end and high-end)
- [ ] Adjust timing if animation feels too slow or too fast
- [ ] Run `tsc --noEmit` to verify changes

### 11.3 Footer Snap Animation Refinement

**Target: Velocity-based snap, feels responsive**

- [ ] Review footer swipe gesture behavior
- [ ] Tune `@gorhom/bottom-sheet` animation config (damping: 80, stiffness: 500)
- [ ] Test snap point selection based on swipe velocity
- [ ] Ensure footer doesn't feel sticky or sluggish
- [ ] Run `tsc --noEmit` to verify changes

### 11.4 Mutual Exclusivity Timing

**Sequential animations: Focus → Footer or Footer → Focus**

- [ ] Test focus mode while footer expanded (should collapse footer first)
- [ ] Test footer swipe while zone focused (should minimize zone first)
- [ ] Verify animations don't overlap (sequential, not parallel)
- [ ] Ensure timing feels natural (200ms → 300ms or 300ms → 200ms)
- [ ] Run `tsc --noEmit` to verify timing

### 11.5 Gesture Tuning

**Left-to-right swipe on subpages, disabled on main recording**

- [ ] Verify `/record/index` has `gestureEnabled={false}` (no back swipe)
- [ ] Verify `/record/sensors` has `gestureEnabled={true}` (back swipe enabled)
- [ ] Verify `/record/ftms` has `gestureEnabled={true}` (back swipe enabled)
- [ ] Test swipe-down disabled on all sheets: `enablePanDownToClose={false}`
- [ ] Test tap-outside-to-dismiss works on all sheets
- [ ] Run `tsc --noEmit` to verify gestures

### 11.6 Performance Profiling

**Targets: <150MB RAM, <5%/hr battery outdoor, <2%/hr indoor**

- [ ] Profile memory usage during active recording
- [ ] Check for memory leaks (leave recording running for 30+ min)
- [ ] Profile battery usage during outdoor GPS recording
- [ ] Profile battery usage during indoor recording
- [ ] Optimize if exceeding targets
- [ ] Run `tsc --noEmit` to verify optimizations

**Phase 11 Checkpoint:**
- [ ] Run `tsc --noEmit` - must pass with zero errors
- [ ] Verify all animations smooth (60fps target)
- [ ] Verify gestures feel responsive
- [ ] Verify performance targets met
- [ ] Manual verification: App feels polished and smooth

---

## Phase 12: Migration & Cleanup

**Description:** Remove old carousel implementation, clean up unused code, update documentation.

### 12.1 Remove Old Carousel Implementation

**Files to remove or refactor:**

- [ ] Locate `RecordingCarousel` component (likely in `apps/mobile/components/`)
- [ ] Remove `RecordingCarousel.tsx` file
- [ ] Remove old card components:
  - Dashboard card component
  - Map card component
  - Trainer control card component
- [ ] Search codebase for imports of removed components
- [ ] Remove all imports and references to old carousel
- [ ] Run `tsc --noEmit` to verify removal (should catch any missed imports)

### 12.2 Remove Unused Dependencies

**If carousel used specific libraries no longer needed:**

- [ ] Review `apps/mobile/package.json` for carousel-specific dependencies
- [ ] Remove unused carousel libraries (if any)
- [ ] Run `npm install` to clean up node_modules
- [ ] Run `tsc --noEmit` to verify no dependency issues

### 12.3 Update Navigation Flow

**Ensure submit screen integration works**

- [ ] Verify `/record/submit` route exists
- [ ] Test navigation from "Finish" button → submit screen
- [ ] Verify recording data passed correctly to submit screen
- [ ] Verify submit screen can access recorded metrics, GPS track, etc.
- [ ] Run `tsc --noEmit` to verify navigation

### 12.4 Update Documentation

**Internal code documentation**

- [ ] Update any inline code comments referencing old carousel
- [ ] Add JSDoc comments to new components (zones, footer, sheets)
- [ ] Document component props and expected behavior
- [ ] Update README or internal docs if needed
- [ ] Run `tsc --noEmit` to verify no issues

### 12.5 Code Review & Quality Check

**Final code quality pass**

- [ ] Review code for console.logs (remove or keep only critical logs)
- [ ] Review code for TODO comments (resolve or track separately)
- [ ] Ensure consistent code formatting
- [ ] Ensure consistent naming conventions
- [ ] Run linter if available (ESLint)
- [ ] Run `tsc --noEmit` one final time - must pass with zero errors

**Phase 12 Checkpoint:**
- [ ] Run `tsc --noEmit` - must pass with zero errors
- [ ] Old carousel code completely removed
- [ ] No unused dependencies remain
- [ ] Navigation flows work end-to-end
- [ ] Manual verification: Clean codebase, no dead code

---

## Final Verification & Success Criteria

**Complete before marking implementation done**

### Functional Requirements

- [ ] ✅ 3-zone stack renders correctly for all 8 configuration scenarios
- [ ] ✅ Zone A shows correct content (outdoor/indoor, route/no route)
- [ ] ✅ Zone B shows correct content (plan/no plan)
- [ ] ✅ Zone C always visible with metrics
- [ ] ✅ Focus mode works for Map, Plan, and Metrics
- [ ] ✅ Footer swipe gesture smooth and responsive (collapsed ↔ expanded)
- [ ] ✅ Plans can be attached/detached mid-workout
- [ ] ✅ Routes can be attached/detached mid-workout
- [ ] ✅ Sensors page accessible and functional
- [ ] ✅ FTMS control page accessible and functional
- [ ] ✅ FTMS adapts to machine type (Bike, Rower, Treadmill, Elliptical)
- [ ] ✅ Auto mode applies plan targets to FTMS
- [ ] ✅ Manual mode allows user override
- [ ] ✅ Indoor virtual routes display position marker
- [ ] ✅ Indoor virtual routes apply grade to FTMS
- [ ] ✅ Recording never pauses during UI changes
- [ ] ✅ Swipe-down disabled everywhere
- [ ] ✅ Left-to-right swipe enabled only on subpages
- [ ] ✅ Footer shows simplified labels ("Edit Route", "Edit Plan")

### Performance Requirements

- [ ] ✅ Animations run at 60fps (30fps minimum acceptable)
- [ ] ✅ Memory usage <150MB during active recording
- [ ] ✅ Battery usage <5%/hr outdoor, <2%/hr indoor

### UX Requirements

- [ ] ✅ Users can complete workouts without leaving recording screen
- [ ] ✅ Pause/Resume/Lap/Finish always accessible (pinned in expanded footer)
- [ ] ✅ Zone transitions feel natural and smooth
- [ ] ✅ Modal overlays don't interrupt recording
- [ ] ✅ Sensor status clearly visible (footer badge, Zone C indicators)
- [ ] ✅ GPS loss clearly indicated (overlay on map)

### Technical Requirements

- [ ] ✅ TypeScript passes with zero errors: `tsc --noEmit`
- [ ] ✅ No console errors during normal operation
- [ ] ✅ Error boundaries prevent full app crashes
- [ ] ✅ Recording service persists across navigation
- [ ] ✅ Old carousel code completely removed

---

## Notes & Reminders

**Key Implementation Principles:**
- Recording continuity is paramount - never pause recording during UI changes
- Use TypeScript strictly - run `tsc --noEmit` after each phase
- Optimize for mobile performance (60fps animations, low battery usage)
- Mutual exclusivity: only one element expanded at a time (focus mode OR footer)
- Sequential animations: don't overlap focus mode and footer transitions
- Use `@gorhom/bottom-sheet` for all modals (consistent UX)
- Disable swipe-down, enable tap-outside-to-dismiss
- Standard back button for all sheets and subpages

**Testing Strategy:**
- Manual verification throughout (no automated tests)
- Use `tsc --noEmit` for type safety verification
- Test on real devices with GPS, sensors, FTMS when possible
- Profile performance regularly (memory, battery, FPS)

**Living Document:**
- Update this document as implementation progresses
- Mark checkboxes as tasks complete
- Add notes for blockers or issues encountered
- Update "Last Updated" date at top when making changes
