# TurboFit Task List

---

##  In Progress


* [x] **Recording Flow Navigation Refactor**
  * [x] Separate activity selection from recording process
    * [x] `apps/mobile/src/routes/(internal)/(tabs)/record.tsx` - Activity selection screen only
    * [x] Reset selection state when record tab is opened
    * [x] Remove recording functionality from record screen
    * [x] Handle activity type and planned activity selection
  * [x] Create dedicated recording screen
    * [x] `apps/mobile/src/routes/(internal)/recording.tsx` - Actual recording process
    * [x] Implement navigation guards to prevent exiting during recording
    * [x] Handle start/pause/resume/stop recording functionality
    * [x] Display real-time metrics and sensor data
  * [x] Implement navigation flow control
    * [x] Redirect from record → recording on start
    * [x] Prevent back navigation during active recording
    * [x] Handle discard → cleanup → return to tabs
    * [x] Handle finish → summary → return to tabs
  * [ ] Add activity cleanup for discarded sessions
    * [ ] Remove discarded activities from local storage
    * [ ] Clean up database entries for abandoned activities
    * [ ] Ensure proper session cleanup on discard
  * [x] Update ActivityRecorder integration
    * [x] Move recording logic from record.tsx to recording.tsx
    * [x] Implement proper session management between screens
    * [x] Handle navigation state synchronization

* [x] **Stepper-Based Activity Selection Implementation**
  * [x] Create stepper component system for guided activity setup
    * [x] `components/record-selection/RecordingStepper.tsx` - Main stepper container
    * [x] `components/record-selection/StepIndicator.tsx` - Visual progress indicator
    * [x] `components/record-selection/hooks/useRecordSelection.tsx` - State management
  * [x] Implement step components:
    * [x] `ActivityModeStep.tsx` - Planned vs Unplanned activity selection
    * [x] `PlannedActivityStep.tsx` - Planned activity list selection
    * [x] `UnplannedActivityStep.tsx` - Activity type grid selection
    * [x] `PermissionsStep.tsx` - Permission request and management
    * [x] `BluetoothStep.tsx` - Bluetooth device connection
    * [x] `ReadyStep.tsx` - Final confirmation before recording
  * [x] Smart step navigation with conditional skipping
    * [x] Skip permissions step if already granted
    * [x] Skip bluetooth step if not needed or already connected
    * [x] Auto-advance logic based on requirements
  * [x] State reset on tab focus using useFocusEffect
  * [x] Enhanced navigation parameter passing to recording screen

---

##  High Priority


---

##  Medium Priority

* [ ] **Trends & Analytics**
  * [ ] Charts: zone distribution, performance curves
  * [ ] Comparison charts (week/week, year/year)
  * [ ] Interactive drill-down features
  * [ ] Advanced analytics (fitness progression, recovery, predictions)

* [ ] **Training Plan Infrastructure**
  * [ ] Plan templates (beginner/intermediate/advanced)
  * [ ] Plan assignment to users
  * [ ] Plan scheduling & periodization
  * [ ] Replace mock planned activities with real queries
  * [ ] Display plan progress/completion

---

##  Low Priority

* [ ] **Structured Activity Support**
  * [ ] Activity step guidance (intervals, rest, zones)
  * [ ] Progress tracking within recording
  * [ ] Step completion validation
  * [ ] Plan adherence scoring
  * [ ] Activity effectiveness analysis
  * [ ] Adaptive plan recommendations

* [ ] **Activity Library**
  * [ ] Standard activity structures
  * [ ] Schema validation via `@repo/core`
  * [ ] Intensity targets (HR, power zones)
  * [ ] Duration & TSS estimation

* [ ] **Planned Activities Listing**
  * [ ] `apps/mobile/src/routes/(internal)/planned_activities.tsx` - Planned activities browser
  * [ ] Show both completed and incomplete planned activities
  * [ ] Add filtering by status, difficulty, and type
  * [ ] Include progress tracking indicators

* [ ] **Planned Activity Detail View**
  * [ ] `apps/mobile/src/routes/(internal)/planned_activity-detail.tsx` - Structured activity viewer
  * [ ] Migrate functionality from `PlannedActivityModal.tsx`
  * [ ] Render step-by-step plan structure with intervals
  * [ ] Display intensity targets and duration estimates
  * [ ] Add start activity navigation integration
