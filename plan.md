# Design Specification: Reactive Recording Interface

**Project:** GradientPeak Mobile | **Module:** Activity Recording & Real-Time Dashboard

## Introduction

This spec defines the recording screen UI/UX using a **Single Vertical Stack Architecture** that reactively adapts based on environment (Indoor/Outdoor), intent (Structured/Free), and equipment (Sensors/FTMS). A single screen provides contextual information anchored by a persistent swipeable footer.

## Migration from Current Implementation

**Current:** Horizontal carousel with 3 cards (Dashboard, Map, Trainer Control)
**New:** Vertical 3-zone stack with all information visible simultaneously

**Preserve:**
- `ActivityRecorderService`, `FTMSController`, event hooks, manager classes

**Refactor:**
- `RecordingCarousel` → Conditional zones
- Cards → Zone components
- Footer → `@gorhom/bottom-sheet` swipeable expansion

**Dependencies:** `@gorhom/bottom-sheet` (v4+)

---

## MVP Scope & Requirements

### 1. FTMS: Machine-Specific Configurations

**Supported Machines:** Rowers, Bikes (Trainers), Treadmills, Ellipticals

**Adjust Tab Requirements (per machine):**
- Control Mode: Auto (plan) vs Manual
- Resistance mapping (plan → machine)
- Quick adjustment (+/- buttons)
- Machine-specific parameters:
  - **Rowers:** Damper (1-10), drag factor
  - **Bikes:** FTP zones, weight (for gradient)
  - **Treadmills:** Speed/incline limits
  - **Ellipticals:** Resistance range, stride rate

### 2. Focus Modes & Dynamic Attach/Detach

**Focus Modes:** (Only one active at a time, mutually exclusive with footer expansion)
- **Map Focus:** Expand Zone A when GPS/route available (tap map to toggle)
- **Plan Focus:** Expand Zone B when plan attached (tap plan card to toggle)
- **Metrics Focus:** Expand Zone C (always available, tap metrics to toggle)
- Minimize button appears in focused zone top-right

**Dynamic Attach/Detach:**
- Users can attach/detach plans/routes mid-workout
- UI animates zone mount/unmount (300ms)
- Recording never pauses, sensors continue
- Activity type (category/location) locked once started

### 3. UI Standardization

**Sheets:**
- All modals use `@gorhom/bottom-sheet`
- Standard "< Back" button (top-left, no X buttons)
- Swipe-down disabled: `enablePanDownToClose={false}`
- Tapping outside dismisses sheet

**Full Navigation Screens** (not sheets):
- Sensors (`/record/sensors`), FTMS Control (`/record/ftms`)
- Left-to-right swipe enabled, standard back button
- Recording continues in background

**Gestures:**
- Left-to-right swipe: Enabled on `/record/*` subpages, disabled on `/record/index`
- Swipe-down: Disabled everywhere (prevents accidental dismissals)

**Footer Labels:** Simplified generic labels ("Edit Route", "Edit Plan") instead of specific names

---

## 1. Visual Hierarchy: Three-Tier Dynamic Stack

**Principle:** Zones only render when data present; no placeholders.

### Zone A: Context Layer (CONDITIONAL)

**Rendering Logic:**
1. **Outdoor + Route:** GPS map + route overlay (blue) + breadcrumb (red), position marker, route %, grade
2. **Outdoor + No Route:** GPS map + breadcrumb only, position marker, heading, grade
3. **Indoor + Route:** Virtual route map, progress indicator, grade controls FTMS
4. **Indoor + No Route:** ❌ Unmount (Zones B/C expand)

### Zone B: Guidance Layer (CONDITIONAL)

**Rendering Logic:**
1. **Has Plan:** Interval card (plan title, timer, intensity chart, current step, progress bar, next step)
2. **No Plan:** ❌ Unmount (Zones A/C expand)

### Zone C: Data Layer (ALWAYS VISIBLE)

**Metrics:** Time, Lap Time, Speed, Distance, Heart Rate, Power, Cadence, Grade, Calories
- Reorder based on active plan targets
- Show "--" for unavailable sensors
- 2-column flexbox grid (6-9 metrics)

### Conditional Rendering Matrix

| Configuration | Zone A | Zone B | Zone C |
|--------------|--------|--------|--------|
| Outdoor + Route + Plan | GPS Map + Route | Plan Card | Metrics |
| Outdoor + Route + No Plan | GPS Map + Route | Hidden | Metrics |
| Outdoor + No Route + Plan | GPS Map | Plan Card | Metrics |
| Outdoor + No Route + No Plan | GPS Map | Hidden | Metrics |
| Indoor + Route + Plan | Virtual Map + Route | Plan Card | Metrics |
| Indoor + Route + No Plan | Virtual Map + Route | Hidden | Metrics |
| Indoor + No Route + Plan | Hidden | Plan Card | Metrics |
| Indoor + No Route + No Plan | Hidden | Hidden | Metrics |

---

## 2. Interaction Model: Focus Mode

**Expansion Rules:**
- Tap Zone A/B to expand (fills screen except footer overlay)
- Minimize button appears (tap to collapse or tap zone again)
- Footer and focus mode are mutually exclusive:
  - Focus → Footer swipe: Zone minimizes (300ms) → Footer expands
  - Expanded footer → Tap zone: Footer collapses (200ms) → Zone expands (300ms)

**State:** `expandedElement: 'none' | 'zone-a' | 'zone-b' | 'footer'`

---

## 3. Swipeable Control Footer

Uses `@gorhom/bottom-sheet` with 2 snap points: collapsed (120-140px) and expanded (70-75% screen).

### State 1: Collapsed (Default)

**Before Recording:**
- Primary button: "Start" (full-width green, 56px height)
- Displays: Selected activity (category icon + "Quick Start" or plan name)

**During Recording:**
- Primary buttons row: Pause/Resume | Lap | Finish
  - Pause/Resume: Toggle state, 48px height
  - Lap: 48px circular, increments lap counter
  - Finish: 48px, ends recording
- Activity type shown above buttons

**After Paused:**
- Resume | Discard | Finish buttons
- Timer shows paused state

### State 2: Expanded (Configuration)

**Controls Row:** Pause/Resume | Lap | Finish (pinned at top, always accessible)

**Configuration Grid (2-column):**
- Activity (category + location) - locked during recording
- Plan (attach/detach)
- Route (attach/detach)
- Sensors (navigate to `/record/sensors`)
- Adjust (FTMS control, navigate to `/record/ftms`)

**Modal Overlays:**
- Swipe up on Plan/Route → Picker sheet opens
- Modals render above expanded footer (recording continues)
- Dismiss via Back button or tap outside

---

## 3.1. Recording Continuity During Modals

**Background Guarantees:**
- GPS tracking continues
- Sensor readings continue
- Plan step progression continues
- Metrics update (visible after modal dismissal)

**User Feedback:**
- Interval transitions: Visual update in Zone B
- Sensor disconnection: Footer badge ("2/5"), icon in Zone C
- GPS loss: "GPS Searching..." overlay on map

**Safety:** Pause/Resume/Finish always accessible at top of expanded footer

---

## 3.2. Modal & Footer Z-Index Hierarchy

**Layering (bottom to top):**
1. Zones A/B/C (z-index: 1)
2. Footer collapsed/expanded (z-index: 10)
3. Modals/sheets (z-index: 50)
4. Toast notifications (z-index: 100)

**Interaction:**
- Tap outside modal → Dismiss modal only (footer remains expanded)
- Modals overlay footer (footer controls visible at top)
- Android back button → Dismiss topmost modal only

---

## 3.3. Activity Selection Button Positioning

**Recommended:** Integrated into footer (not standalone)
- "Edit Activity" item in configuration grid (when footer expanded)
- Disabled during recording (shows locked state)
- Pre-recording: Opens activity picker sheet

---

## 4. Technical Implementation

### 4.1 Platform Constraints

**iOS:**
- Status bar: 44-47px, avoid overlap with zones
- Safe areas: Use `SafeAreaView` wrapper
- Background location permission for GPS

**Android:**
- Navigation bar: 48px bottom, account for footer height
- Foreground service notification required for recording
- Back button handling for modals/sheets

**Performance:**
- 60fps animations (30fps minimum acceptable)
- Memory: <150MB during recording
- Battery: <5%/hr (outdoor), <2%/hr (indoor)

### 4.2 Accessibility

**Screen Reader:**
- Label all controls with descriptive names
- Zone state changes announced ("Plan view expanded")
- Metric updates with value + unit ("Heart Rate 152 BPM")

**Visual:**
- Contrast ratio: WCAG AA 4.5:1 minimum
- Target zones: Color + pattern indicators
- Metrics: Minimum 16sp bold

---

## 4.7 Routing & Navigation

**Structure:**
```
(internal)/(standard)/
├── /record/index.tsx           // Main recording screen
├── /record/sensors.tsx         // Sensor management (full nav)
├── /record/ftms.tsx           // FTMS control (full nav)
└── /record/submit.tsx         // Post-recording summary
```

**Recording State Preservation:**
- Use React Context: `RecordingContext` (global across navigation)
- Service layer: `ActivityRecorderService` persists across screens
- Navigation doesn't interrupt recording

**Gesture Control:**
- `/record/index`: `gestureEnabled={false}` (no back swipe)
- `/record/sensors`, `/record/ftms`: `gestureEnabled={true}` (back swipe enabled)

---

## 4.8 State Management

**Global State (React Context):**
- Recording status (not_started, recording, paused, finished)
- Current activity config (category, location, plan, route)
- Sensor connection status
- FTMS connection and mode

**Local State (Component):**
- Footer snap position (collapsed/expanded)
- Focus mode (zone-a, zone-b, none)
- Modal visibility

**Service Layer:**
- `ActivityRecorderService`: Recording lifecycle
- `LocationManager`: GPS tracking
- `SensorsManager`: BLE sensor data
- `FTMSController`: Trainer control
- `LiveMetricsManager`: Metric calculations

**Persistence:**
- `AsyncStorage`: Last activity config (restore on crash)
- Key: `@gradientpeak:recording_state`
- Cleanup on successful recording submit

---

## 4.9 Animations

**Libraries:**
- `react-native-reanimated` (v3+) - Already installed
- `@gorhom/bottom-sheet` (v4+) - **NEW DEPENDENCY** required for footer
- `react-native-gesture-handler` (v2+) - Already installed

**Animations:**

**Zone Focus/Minimize:**
```typescript
withSpring(toFocusMode ? FULL_HEIGHT : NORMAL_HEIGHT, {
  damping: 0.8, stiffness: 100
})  // ~400ms spring settling
```

**Zone Mount/Unmount:**
```typescript
withTiming(isMounting ? ZONE_HEIGHT : 0, {
  duration: 300,
  easing: Easing.out(Easing.ease)
})  // Ease-out, fast start/slow end
```

**Footer Snap:**
```typescript
<BottomSheet
  snapPoints={[120, '60%']}  // Collapsed/Expanded
  animationConfigs={{
    damping: 80, stiffness: 500, mass: 0.3
  }}
/>  // Velocity-based snap point selection
```

**Metrics:** NO animation (instant update for precision)

**Performance:**
- Use `useSharedValue`, `useAnimatedStyle` (UI thread)
- Avoid layout recalculations during animations
- Target 60fps

---

## 4.10 Indoor Virtual Route Progress

**Calculation:**
- Track cumulative distance via speed sensor
- Map distance → route GPS track (linear interpolation)
- Extract lat/lng for virtual position marker
- Extract elevation for FTMS grade adjustment

**Grade Application:**
- Query route grade at current position
- Convert % grade → FTMS resistance
- User can manually override (disables auto-grade)

**Visual:**
- Virtual marker advances along route polyline
- Progress % shown (distance completed / route distance)

---

## 4.11 FTMS Control Logic

**Control Modes:**
- **ERG (Mode 5):** Target power control, trainer maintains watts regardless of cadence
- **SIM (Mode 1):** Simulates grade/wind/resistance (realistic physics)
- **Resistance (Mode 4):** Fixed resistance level (1-20 scale)

**Auto Mode Logic:**
```typescript
if (plan.hasPlan && !manualOverride) {
  const targetPower = plan.currentStep.targetPower
  // Add grade adjustment for indoor routes
  if (indoor && route) {
    const grade = getGradeAtPosition(distance)
    const gradeWatts = weight * 9.81 * velocity * sin(atan(grade/100))
    ftmsController.setPower(targetPower + gradeWatts)
  } else {
    ftmsController.setPower(targetPower)
  }
}
```

**Manual Mode:**
- User controls resistance via +/- buttons
- Plan targets still visible (reference only)
- Plan progression continues on time (not adherence)

**Machine-Specific Adjust Screens:**

**Bikes:** ERG/SIM/Resistance modes, target power slider, +/- quick adjust, FTP display, weight for grade
**Rowers:** Damper (1-10), resistance slider, stroke rate target, drag factor display
**Treadmills:** Speed slider + quick adjust, incline slider + quick adjust, safety limits display
**Ellipticals:** Resistance (1-20), cadence target, power display (read-only)

**Universal Behavior:**
- Full navigation screen (like Sensors page)
- Auto/Manual toggle (when plan active)
- Auto: Controls grayed, targets from plan
- Manual: All controls active, user override
- Recording continues in background

---

## 4.12 Error Boundaries

**Strategy:** Wrap zones individually to isolate failures

**Zones:**
```tsx
<RecordingErrorBoundary componentName="Zone A (Map)">
  {shouldRenderZoneA && <ZoneA />}
</RecordingErrorBoundary>
```

**Fallback:** Show error message + "Reload Zone" button (recording continues)

**Critical Services:** Separate error boundary for recording service (whole-app fallback)

---

## 4.13 Performance Targets

**Frame Rate:** 60fps animations (30fps acceptable minimum)
**Memory:** <150MB during active recording
**Battery:** <5%/hr outdoor, <2%/hr indoor
**GPS Accuracy:** ±10m (95% confidence)
**Metric Update Frequency:** 1Hz (sensors), 10Hz (GPS)

**Monitoring:**
- React Native Performance Monitor (dev)
- Production: Custom telemetry (battery, memory, frame drops)

---

## 4.14 Type Safety & Verification

**Verification Method:** Use `tsc --noEmit` throughout implementation to verify all changes meet TypeScript requirements.

**Run before completing each phase:** `tsc --noEmit` to catch type errors early.

---

## 5. User Journey Examples

### Journey 1: Outdoor Structured Ride (Plan + Route)

1. User selects planned activity with route
2. Recording starts: Zone A (map + route), Zone B (plan card), Zone C (metrics)
3. User taps map → Map expands to focus mode
4. User taps minimize → Returns to 3-zone stack
5. Interval changes → Zone B updates visually
6. User swipes up footer → Zones minimize, footer expands
7. User finishes workout → Stops recording → Submit screen

### Journey 2: Indoor Virtual Route (No Plan)

1. User quick starts indoor bike activity, attaches route
2. Recording starts: Zone A (virtual map + route), Zone C (metrics)
3. Zone B hidden (no plan)
4. FTMS auto-adjusts resistance based on route grade
5. User swipes up footer → Accesses FTMS controls
6. User manually overrides resistance
7. Finishes workout → Submit screen

### Journey 3: Quick Start Run (No Plan, No Route)

1. User quick starts outdoor run activity
2. Recording starts: Zone A (GPS map + breadcrumb), Zone C (metrics)
3. Zone B hidden (no plan)
4. User taps metrics → Metrics expand to focus mode
5. User swipes up footer mid-workout → Attaches plan
6. Zone B animates into view, metrics reorder
7. Finishes workout → Submit screen

---

## 6. Implementation Roadmap

### Phase 1: Foundation (3-4 days)
- Vertical zone layout with conditional rendering
- Zone mount/unmount animations
- Footer `@gorhom/bottom-sheet` integration (2 snap points)

**Deliverable:** 3-zone stack rendering correctly for all configurations

### Phase 2: Footer Controls (2-3 days)
- Start/Pause/Resume/Finish button logic
- Lap button with counter
- Configuration grid (Activity, Plan, Route, Sensors, Adjust)
- State-based button rendering

**Deliverable:** Full recording lifecycle controllable via footer

### Phase 3: Focus Mode (2 days)
- Tap-to-expand for Zones A/B/C
- Minimize button overlay
- Mutual exclusivity with footer expansion
- Sequential animations

**Deliverable:** Focus mode functional for all zones

### Phase 4: Plan/Route Integration (2-3 days)
- Plan picker sheet
- Route picker sheet
- Dynamic attach/detach mid-workout
- Zone B animation on plan changes
- Zone C metric reordering

**Deliverable:** Plans/routes attachable during recording

### Phase 5: Sensors Integration (1-2 days)
- Sensors screen navigation (existing, verify compatibility)
- Footer badge for sensor count
- Metrics show "--" for missing sensors
- Sensor disconnect indicators

**Deliverable:** Sensor management integrated

### Phase 6: FTMS Control (3-4 days)
- FTMS screen navigation
- Machine-specific UI (Bikes, Rowers, Treadmills, Ellipticals)
- Auto mode: Plan + Route grade
- Manual mode: +/- adjustments
- Mode switching logic

**Deliverable:** FTMS control functional for all machine types

### Phase 7: Indoor Virtual Routes (2 days)
- Distance → GPS track mapping
- Virtual position marker on map
- Grade extraction and FTMS application
- Progress % calculation

**Deliverable:** Indoor virtual routes fully functional

### Phase 8: Background Continuity (1-2 days)
- Verify GPS/sensors/plan continue during modals
- Sensor disconnection: Footer badge + Zone C icon
- GPS loss: Map text overlay
- Background/foreground handling
- Android foreground service notification

**Deliverable:** Recording seamless during all interactions

### Phase 9: Animations & Polish (2-3 days)
- Refine zone transition animations (spring, 60fps)
- Focus mode + footer mutual exclusivity timing
- Gesture tuning (velocity thresholds)
- Run `tsc --noEmit` to verify type safety

**Deliverable:** Smooth animations across all interactions

### Phase 10: Migration & Cleanup (1-2 days)
- Remove old carousel implementation
- Delete unused carousel dependencies
- Update documentation
- Verify submit screen integration
- Run final `tsc --noEmit` to ensure type safety

**Deliverable:** Clean codebase, old code removed

---

## Implementation Timeline Estimate

**Total:** 18-25 days (3-5 weeks)

**Critical Path:** Phases 1-5 (core functionality)
**Parallelizable:** Phases 6-9 (can be done iteratively)

**Verification:** Run `tsc --noEmit` after each phase to catch type errors early

**Risk Mitigation:**
- `@gorhom/bottom-sheet` issues: Fallback to custom bottom sheet
- Zone A map performance: Simplified map view
- FTMS complexity: Defer to post-MVP if needed

---

## Success Criteria

**Functional:**
- ✅ 3-zone stack renders for all configurations
- ✅ Focus modes functional (Map, Plan, Metrics)
- ✅ Dynamic plan/route attach/detach works mid-workout
- ✅ Footer swipe gesture smooth and responsive
- ✅ FTMS adapts to machine type
- ✅ Recording never pauses during UI changes
- ✅ Swipe-down disabled, left-to-right only on subpages
- ✅ Footer shows simplified labels

**Performance:**
- ✅ 60fps animations (30fps minimum)
- ✅ <150MB RAM during recording
- ✅ <5%/hr battery (outdoor), <2%/hr (indoor)

**UX:**
- ✅ Users complete workouts without leaving recording screen
- ✅ Critical controls always accessible
- ✅ Zone transitions feel natural
- ✅ Modal overlays don't interrupt recording
- ✅ Sensor/GPS status clearly visible
