
# TurboFit Task List

## 1 Mobile Application Real Data Integration

### 1.1 Home Screen

* [x] Replace mock performance data (`usePerformanceMetrics` → real `ActivityService`)
* [x] Display weekly/monthly TSS from real activity history
* [x] Show real activity sync status indicators
* [x] Connect CTL/ATL/TSB calculations to actual activity metadata

### 1.2 Core Data

* [x] Connect `@repo/core` TSS calculations to real activity data
* [x] Implement CTL/ATL/TSB progression
* [x] TypeScript type safety for `PerformanceMetrics`

### 1.3 Activity Recording System

* [x] Make the activity recording modal fault tolerant
* [x] BLE sensor integration for multi sensor ingestion (HR, power, cadence, speed, smartwatch)
* [x] Real-time BLE sensor metrics (HR, power, cadence, speed, smartwatch) display, duration, clock
* [x] Optional Planned activity selection upon activity creation
* [x] Planned activity start/stop/pause/resume
* [x] Planned activity interactivity support (intervals, rest)
* [x] Activity completion workflow → JSON generation -> local -> storage upload -> cloud
* [x] JSON generation -> local -> Activity Record -> sync -> cloud
* [x] JSON generation -> local -> Activity Streams Record -> sync -> cloud
* [x] Remove FIT file generation logic and implement JSON-based local storage
* [x] Improve UI/UX, minimal, responsive, accessible, user-friendly, Interactive
* [x] Remove pop ups on activity completion workflow
* [x] Remove pop ups during activity recording session
* [x] Have only one pop up after activity completion for viewing a summary, activity metadata, Performance metrics, activity streams, etc...
* [x] Fix: Permissions Required displays correctly, but is not working as expected, fix permissions issue
  * [x] Permissions Required (when clicked) doesn't display popup to enable permissions
* [x] Fix: BLE is not working as expected, fix ble modal issue
  * [x] No Sensors (when clicked) doesn't display modal to select ble device
  * [x] No Updates to sensor information to indicated how many devices are connected (when successful connection occurs)
  * [x] Unable to disconnect from BLE device, device in modal doesn't change its ui. it should be reactive
* [x] Layout of record modal isn't as expected, fix layout issue.
  * [x] Next to the modal close button, remove content holding the "Start Activity" text and replace with the following:
    * [x] remove the "Start Activity" text
    * [x] a gps is ready indicator
    * [x] The permissions indicator, indicating if all permissions needed for a recording session are granted (if clicked, it should open a popup to enable permissions)
    * [x] The BLE indicator, indicating if BLE is enabled and connected (if clicked, it should open a popup to enable BLE) If ble is enabled, the ble device connection modal should display and users should be able to connect multiple devices
  * [x] The current no sensors indicator and gps active indicator should be removed
  * [x] The performance metrics should stay as they are
  * [x] the footer of the modal should hold the recording controls.
    * [x] Start Recording button
    * [x] Stop Recording button (if paused)
    * [x] Pause Recording button (if active)
    * [x] Resume Recording button (if paused)
* [x] GPS and Bluetooth Indicator UX Improvements
* [x] GPS ready indicator should be green when GPS is active (capable of recording location info)
* [x] Bluetooth indicator should be green when all user-selected connections are active
* [x] Bluetooth Modal Enhancements:
  * [x] Auto-trigger search when modal opens (no manual search button press)
  * [x] Auto-stop search after timeout or when no new devices found for 10 seconds
  * [x] Modal stays open when user selects/connects to devices
  * [x] List connected devices above available devices
  * [x] Simplified device listing with signal strength icon and connect/disconnect button
  * [x] Connect/disconnect buttons show loading states during connection process
  * [x] Remove device icons, descriptions, and dBM counts for MVP simplicity


### 1.4 Local Storage Refactoring

* [x] Update local_activities schema to use localStoragePath/cloudStoragePath for JSON files
* [x] Remove FIT file generation from activity completion service
* [x] Update activity completion workflow to save JSON files locally
* [x] Update sync service to upload JSON files and clean up after successful sync
* [x] Remove FIT file references from documentation and settings

### 1.5 Trends Screen
* [x] Replace mock charts with Victory Native charts
* [x] Training Load Progression Chart
* [x] Power Zone Distribution Chart
* [x] Heart Rate Zone Distribution Chart
* [x] Power vs Heart Rate Trend Chart
* [x] Performance / Power Curve Chart

### 1.6 Activity Detail Views – MVP Task List

* [x] Expo Router Navigation Refactoring - Modal Stacking Fix
  * [x] Create `(session)` route group for recording session isolation
  * [x] Move `record.tsx` from `(internal)` to `(session)` group
  * [x] Create new modal screens: `bluetooth.tsx`, `permissions.tsx`, `select-workout.tsx`
  * [x] Create `(modal)` route group for app-wide modals
  * [x] Move `reset-password.tsx` from `/auth` to `(modal)` group
  * [x] Update tab layout to remove record tab and add floating action button
  * [x] Integrate existing modal components with new navigation-based screens
  * [x] Update deep links and Supabase redirect URLs to use new modal paths
  * [x] Ensure recording session stays mounted during modal presentation

* [x] Recording Session UX Improvements
  * [x] Recording state controls - only recording buttons control session after start
  * [x] Remove close button (X) from record screen when activity is actively recording
  * [x] Change close button icon from down arrow to X mark
  * [x] Update performance metrics to use 2-column grid layout
  * [x] Move GPS, permissions, and BLE indicators to top-right corner
  * [x] Change "Start Free Activity" to "Start Unplanned Activity"
  * [x] Fix modal black screen issues with improved presentation configuration
  * [x] Remove "recording continues in background" notice
  * [x] Show only pause button when actively recording
  * [x] Show resume, discard, and finish buttons when paused
  * [x] Remove separate "stop" button in favor of unified "finish" action
  * [x] Redirect to internal home page after activity completion
  * [x] I want to ensure that when users select a planned acitvity or unplanned activity that the type of activity is displayed.
  * [x] My app depends on the ability to accurately track and display the type of activity.
  * [x] My app depends on knowing the constraints of what can or cannot be recorded during an activity.
  * [x] This helps my app understand the speed and pace can't be tracked on an indoor treadmill run, but can be tracked on an outdoor run.
  * [x] If bluetooth sensors are available, the app can track heart rate pace and cadence it should override any default recording settings tha app has configured
  * [x] Any connected device that matches a metric that can be recorded, should be considered as ground truth
  * [x] For each metric displayed on the activity recording screen, it should subtly indicate the source of the data.
  * [x] before my user can select start an unplanned workout, they must first select a activity type...
  * [x] If the activity types do not exist type they should be defined in the core package of my repositorty.
  * [x] Each type should have a unique title, a displayable name, and some constraints about the available metrics that can be recorded. i.e. gps on/off if the activity is indoors or outdoors, heart rate on/off if the activity is outdoors or indoors, cadence on/off if the activity is outdoors or indoors

### 1.7 Recording UX Redesign

* [x] Unified Record Screen Design
  * [x] Combine the initial display of the record screen with the contents of the select workout modal
  * [x] Users cannot start an activity until they complete the workout selection process
  * [x] The selection of planned workout or activity type must be completed before the start button is enabled
  * [x] After activity type selection, users should be able to start the activity immediately
  * [x] Implement smooth state transitions between selection and active recording modes

* [x] Enhanced Recording Controls
  * [x] Once activity is started, users can pause and resume the activity
  * [x] Provide clear visual feedback for recording states (preparing, active, paused)
  * [x] Implement context-aware UI that adapts based on recording state

* [x] Dynamic Content Display
  * [x] Show planned activity display (interactive workout) for planned activities
  * [x] Show live performance metrics grid for unplanned activities
  * [x] Seamless switching between planned workout guidance and metrics during recording

* [x] Consolidated Record Screen Implementation
  * [x] Remove separate SelectWorkoutModal - combine all selection logic into record screen
  * [x] Record screen opens with activity selection UI (planned vs unplanned)
  * [x] State management for activity selection vs recording phases
  * [x] Planned activity selection loads workout visual to follow
  * [x] Unplanned activity requires activity type selection before recording
  * [x] Close button available when activity not started, removed when recording active
  * [x] Record screen and header components remain unchanged during recording
  * [x] Unified modal approach - single screen handles complete workflow

* [ ] Individual activity detail screens
  * Display basic activity info: name, date, sport type, duration.
  * Pull data directly from JSON activity records via the core package.
  * Simple layout: minimal UI, readable on mobile screens.

* [ ] View splits, maps, and metrics
  * Show split data (time/distance intervals) in a simple table or chart.
  * Render activity map with start-to-finish route (using minimal map component).
  * Display key performance metrics: TSS, normalized power, HR, pace, etc.

* [ ] Activity comparison & PR tracking
  * Compare selected metrics across multiple activities (same sport type).
  * Highlight personal records for distance, duration, or other key metrics.
  * Minimal UI: side-by-side or simple line/bar comparisons.

### 1.8 Critical Recording Flow Fixes

* [ ] Fix MetricCard Component Import Error
  * Fix typo in MetricCard component export (MetricCar → MetricCard)
  * Ensure MetricsGrid component properly imports and displays metrics
  * Test activity selection and recording flow works without crashes
  * Verify performance metrics display correctly during recording

* [ ] Dynamic Recording Body State Management  
  * Implement reactive recording body based on activity selection state
  * Show activity selection UI when no activity chosen
  * Display performance metrics for unplanned indoor activities (like treadmill runs)
  * Show planned activity interactive display for planned activities
  * Hide activity selection buttons and show appropriate content based on activity type and planning status
  * Ensure smooth state transitions between selection and recording phases

* [ ] Post-Recording Navigation & Summary Flow
  * Fix blank white home page after recording completion
  * Ensure proper navigation back to internal main app home page after finish
  * Implement activity summary modal display on recording completion
  * Show recently completed activity summary with key metrics and performance data
  * Prevent navigation issues and ensure clean session completion

* [ ] Activity Type-Based UI Adaptation
  * Update recording interface to adapt based on selected activity type constraints
  * For indoor activities (treadmill): hide GPS-dependent metrics, show available sensor data
  * For outdoor activities: show GPS, pace, speed metrics when available
  * Prioritize BLE sensor data over calculated metrics when sensors are connected
  * Display subtle data source indicators for each metric (GPS, BLE sensor, calculated)

### 1.9 Recording UX Refactor

* [x] Remove Modal-Based Recording Interface
  * Eliminate all modals except activity summary at workout completion
  * Convert current modal-based record screen to themed view approach
  * Maintain only ActivitySummaryModal for post-workout display

* [x] Three-Section Themed View Layout
  * Create recording header component with state access
  * Create recording body component with state access  
  * Create recording footer component with state access
  * Ensure all sections share recording session states, user selections, BLE devices, permissions, GPS data

* [x] Reactive Header Component
  * Display permissions and bluetooth adjustment buttons always accessible
  * Show real-time connection status indicators
  * Allow users to modify permissions/bluetooth at any time during session
  * Minimal styling with clear visual feedback

* [x] Dynamic Body Component Rendering
  * Activity selection interface when no activity chosen
  * Planned workout selection with demo data integration
  * Unplanned activity type selection interface
  * Planned activity display after selection (structured workout view)
  * Unplanned activity metrics display after selection (all available metrics for activity type)
  * Reactive updates based on activity selection state

* [x] Context-Aware Footer Controls
  * Recording control buttons only (start/pause/resume/stop/finish)
  * Planned activity start blocked until required metrics available for recording
  * Unplanned activity start blocked until activity selection complete
  * No automatic activity state changes (manual user control only)
  * Clean, minimal button design with state-based visibility

* [x] State Management Integration
  * Centralized access to recording session states
  * User selection tracking (planned vs unplanned, activity type)
  * Real-time BLE device connection states
  * Permission grant status monitoring
  * GPS location and signal quality states
  * Cross-component state synchronization

* [x] Activity Selection Flow
  * Binary choice: planned workout or unplanned activity
  * Planned workout selection from available plans (demo data)
  * Unplanned activity requires activity type selection first
  * Display selected activity information in body section
  * Prevent recording start until selection process complete

* [x] Minimal UI/UX Implementation
  * Bare, functional styling throughout
  * No complex animations or transitions
  * Simple, readable typography and spacing
  * Clear visual hierarchy without decorative elements
  * Focus on information visibility and accessibility

* [x] Requirements Display UX Enhancement
  * Replace generic "Requirements Not Met" footer message with contextual body content
  * Show detailed requirements breakdown when activity selected but can't start recording
  * Interactive permissions button that directs users to grant missing permissions
  * GPS connection status with helpful guidance text
  * Footer shows "Resolve Issues Above" instead of generic blocking message

---

## 2 Core Activity Features

### 2.1 Enhanced Recording

* [ ] Real-time GPS tracking
* [ ] BLE sensor integration complete
* [ ] Pause/resume, auto-pause
* [ ] Lap/split recording, audio/vibration alerts
* [ ] Battery optimization

### 2.2 Activity Detail & Management

* [ ] Detailed analysis screen
* [ ] Activity map, splits, zones
* [ ] Activity editing & privacy controls
* [ ] Deletion, bulk operations
* [ ] Search, filtering
* [ ] Personal record tracking

### 2.3 Trends & Analytics

* [ ] Charts: zone distribution, performance curves
* [ ] Comparison charts (week/week, year/year)
* [ ] Interactive drill-down features
* [ ] Advanced analytics (fitness progression, recovery, predictions)

---

## 3 Training Plan System

### 3.1 Training Plan Infrastructure

* [ ] Plan templates (beginner/intermediate/advanced)
* [ ] Plan assignment to users
* [ ] Plan scheduling & periodization
* [ ] Replace mock planned activities with real queries
* [ ] Display plan progress/completion

### 3.2 Structured Activity Support

* [ ] Activity step guidance (intervals, rest, zones)
* [ ] Progress tracking within recording
* [ ] Step completion validation
* [ ] Plan adherence scoring
* [ ] Activity effectiveness analysis
* [ ] Adaptive plan recommendations

### 3.3 Activity Library

* [ ] Standard activity structures
* [ ] Schema validation via `@repo/core`
* [ ] Intensity targets (HR, power zones)
* [ ] Duration & TSS estimation

---

## 4 Advanced Features

### 4.1 Social & Sharing

* [ ] Activity sharing (social media, public feeds)
* [ ] Follow/unfollow users
* [ ] Comments & kudos

### 4.2 Data Export & Integration

* [ ] Strava/TrainingPeaks sync
* [ ] TCX/FIT export
* [ ] Health app integration

---
