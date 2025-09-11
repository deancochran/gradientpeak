
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
