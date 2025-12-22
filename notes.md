## Comprehensive Implementation Analysis: GradientPeak React Native Training App

Based on my exploration of the codebase, here's a detailed analysis of the trainer control, Bluetooth device management, recording, and data persistence implementation:

---

### 1. TRAINER CONTROL STATUS DISPLAY

**Location**: `/home/deancochran/GradientPeak/apps/mobile/app/(internal)/record/index.tsx` (lines 272-304)

**Display Implementation**:
- **Visual Indicator**: Header banner showing "Trainer Control Active" with power icon (Zap)
- **Target Display**:
  - For ERG mode: Shows "Target: {powerWatts}W"
  - For simulation mode: Shows "Target: {grade}%"
  - Falls back to "Connected" if no target
- **Feature Detection**: Uses `service.sensorsManager.getControllableTrainer()` to check if trainer is controllable
- **Step Target Resolution**: Uses `resolvePowerTarget()` helper function that handles:
  - `%FTP` (percentage of functional threshold power)
  - `watts` (absolute power in watts)
  - Profile FTP fallback (default 200W)

**Code Structure**:
```typescript
const trainer = service?.sensorsManager.getControllableTrainer();
const currentStep = service?.currentStep;

if (trainer?.isControllable && currentStep?.targets?.power) {
  targetDisplay = `Target: ${powerWatts}W`;
}
```

---

### 2. BLUETOOTH DEVICE CONNECTION STATE MANAGEMENT

**Location**: `/home/deancochran/GradientPeak/apps/mobile/lib/services/ActivityRecorder/sensors.ts`

**Connection States**:
```typescript
type SensorConnectionState = "disconnected" | "connecting" | "connected" | "failed"
```

**Key Features**:

1. **Connection Monitoring**:
   - Runs health checks every 10 seconds (HEALTH_CHECK_INTERVAL_MS = 10000)
   - Tracks last data timestamp per sensor
   - Auto-reconnects if no data for 30 seconds (DISCONNECT_TIMEOUT_MS = 30000)

2. **Reconnection Strategy**:
   - Exponential backoff starting at 500ms
   - Maximum 5 reconnection attempts per sensor
   - Backoff formula: `baseDelay * (2 ^ (attempt - 1))`

3. **Connected Sensor Interface**:
```typescript
interface ConnectedSensor {
  id: string;
  name: string;
  services: string[];
  characteristics: Map<string, string>;
  device: Device;
  connectionState: SensorConnectionState;
  lastDataTimestamp?: number;
  isControllable?: boolean;
  ftmsController?: FTMSController;
  ftmsFeatures?: FTMSFeatures;
  currentControlMode?: ControlMode;
  batteryLevel?: number;
}
```

4. **Sensor Disconnection Warning**:
   - Displays yellow warning banner in recording UI
   - Lists disconnected sensor names
   - Automatically attempts reconnection

---

### 3. RECORDING PAGE LAYOUT AND METRIC DISPLAYS

**Location**: `/home/deancochran/GradientPeak/apps/mobile/components/RecordingCarousel/`

**Carousel Architecture**:
- **Infinite scrolling** carousel using FlatList with tripled cards array
- **Dynamic card configuration** based on recording capabilities
- **Cards enabled by config**:
  - Dashboard (default)
  - Map (outdoor activities)
  - Plan/Steps (planned activities)
  - Trainer Control (FTMS device present)
  - Power metrics
  - Heart rate metrics

**Dashboard Card Metrics** (DashboardCard.tsx):
```
Primary Metric:
- Elapsed Time (formatted: HH:MM:SS)

Live Metrics Grid (6 metrics):
- Power (watts)
- Heart Rate (bpm)
- Cadence (rpm)
- Speed (km/h)
- Distance (km)
- Calories (kcal)
```

**Step Display** (CurrentStepDisplay.tsx):
- Step name and description
- Step duration with formatted time
- Target vs current metrics grid
- Manual advancement indicator

**Plan Card Features**:
- Current step progress bar
- Next step preview
- Target zone indicators
- Duration/distance remaining

**Trainer Control Card** (TrainerControlCard.tsx):
- Mode selector: ERG (watts), SIM (grade %), RESISTANCE (level)
- Target adjustment: +/- buttons with configurable increments
- Current power display during ERG mode
- Auto/Manual mode toggle
- Reset trainer button

---

### 4. WORKOUT DATA PERSISTENCE AND AUTO-SAVE MECHANISMS

**Location**: `/home/deancochran/GradientPeak/apps/mobile/lib/services/ActivityRecorder/`

**File-Based Streaming Architecture** (StreamBuffer.ts):
- Replaces SQLite with FileSystem-based storage
- **Auto-flush cycle**: Every 60 seconds (PERSISTENCE_INTERVAL = 60000ms)
- **Memory buffer**: Accumulates readings, flushes to files periodically

**Data Persistence Flow**:
1. **In-Memory Accumulation** (LiveMetricsManager):
   - Real-time metric calculations using 60-second rolling window
   - Sensor readings aggregated every 1 second (UPDATE_INTERVAL = 1000ms)

2. **Periodic File Writes** (StreamBuffer):
   - Writes chunks to filesystem every 60 seconds
   - Organizes by metric type
   - Stores both numeric and location data (lat/lng, altitude)

3. **Recording Completion** (finishRecording):
   - Calls `liveMetricsManager.finishRecording()`
   - Flushes final data to files
   - Updates recording metadata with end time
   - Emits `recordingComplete` event

**Data Types Persisted**:
```typescript
interface StreamChunk {
  metric: PublicActivityMetric;
  dataType: PublicActivityMetricDataType;
  values: number[] | number[][];
  timestamps: number[];
  sampleCount: number;
  startTime: Date;
  endTime: Date;
}
```

**Metrics Tracked** (complete LiveMetricsState):
- Timing: elapsedTime, movingTime
- Distance & Speed: distance, avgSpeed, maxSpeed
- Elevation: totalAscent, totalDescent, avgGrade
- Heart Rate: avgHeartRate, maxHeartRate, hrZone times (5 zones)
- Power: avgPower, maxPower, totalWork, powerZone times (7 zones)
- Cadence: avgCadence, maxCadence
- Environmental: avgTemperature
- Calories: total calories burned
- Derived: normalizedPower, intensityFactor, TSS, variabilityIndex

---

### 5. ERG MODE AND WORKOUT PLAN INTEGRATION

**Location**: `/home/deancochran/GradientPeak/apps/mobile/lib/services/ActivityRecorder/index.ts`

**FTMS Control Modes** (from ftms-types.ts):
```typescript
enum ControlMode {
  ERG = "erg",           // Power target control
  SIM = "sim",           // Simulation mode (grade/wind)
  RESISTANCE = "resistance",
  SPEED = "speed",
  INCLINATION = "inclination",
  HEART_RATE = "heart_rate",
  CADENCE = "cadence",
}
```

**Automatic Plan-Based Trainer Control**:

1. **Setup** (setupPlanTrainerIntegration):
   - Listens to `stepChanged` events
   - Listens to `stateChanged` events (recording start)
   - Applies step targets automatically

2. **Target Application** (applyStepTargets):
   - Extracts power target from current step
   - Resolves relative (%FTP) or absolute (watts) targets
   - Sends to trainer via FTMS control

3. **Power Target Resolution**:
   ```typescript
   if (target.type === "%FTP") {
     powerWatts = Math.round((percentage / 100) * profile.ftp);
   } else if (target.type === "watts") {
     powerWatts = Math.round(target.intensity);
   }
   ```

**Manual Control Override**:
- `setManualControlMode(enabled: boolean)` - Toggles auto control
- When enabled: Plan targets are NOT applied
- When disabled: Targets are reapplied to trainer
- UI shows "Auto" vs "Manual" toggle in trainer control card

**Step Progression**:
- **Automatic**: Time-based steps advance when duration elapsed
- **Manual**: Steps with `duration.type === "untilFinished"` require manual advance
- Check: `progress.canAdvance && progress.progress >= 1`

**Trainer Control Methods** (sensors.ts):
```typescript
async setPowerTarget(watts: number): Promise<boolean>
async setSimulation(params: {grade, windSpeed, crr, windResistance}): Promise<boolean>
async setResistanceTarget(level: number): Promise<boolean>
async resetTrainerControl(): Promise<boolean>
```

---

### 6. DATA SELECTION AND INITIALIZATION FLOW

**Activity Selection Store** (activitySelectionStore.ts):
- Simple singleton store using consume-once pattern
- Prevents race conditions during navigation
- Selection cleared after being read

**Initialization Pipeline** (record/index.tsx):
1. User selects activity → stored in `activitySelectionStore`
2. RecordScreen mounts → calls `consumeSelection()`
3. Validates and calls `service.selectActivityFromPayload(payload)`
4. Service loads plan structure or sets unplanned activity
5. Recording ready for start

**Activity Payload Structure**:
```typescript
interface ActivityPayload {
  category: PublicActivityCategory;
  location: PublicActivityLocation;
  plan?: RecordingServiceActivityPlan;
  plannedActivityId?: string;
}
```

---

### 7. KEY SERVICE ARCHITECTURE

**ActivityRecorderService** (index.ts):
- **State**: pending → ready → recording → paused → finished
- **Event System**: EventEmitter with 11 core events
- **Managers**:
  - `liveMetricsManager`: Real-time metric calculations
  - `locationManager`: GPS tracking
  - `sensorsManager`: BLE device management

**Recording Lifecycle**:
```
selectActivityFromPayload() 
  ↓
startRecording()  [permissions check, sensors start, location start]
  ↓
pauseRecording()  [pause metrics, keep sensor connections]
  ↓
resumeRecording() [resume metrics, restart timers]
  ↓
finishRecording() [flush data, emit recordingComplete, cleanup]
```

**Configuration Detection** (getRecordingConfiguration):
- Analyzes activity type, devices, and plan structure
- Returns RecordingConfiguration determining:
  - Which UI cards to show
  - Which features are available
  - Auto-control enablement status

---

### 8. PERMISSION MANAGEMENT

**Location**: `/home/deancochran/GradientPeak/apps/mobile/lib/services/ActivityRecorder/index.ts`

**Required Permissions**:
1. Bluetooth - Device control and sensor data
2. Location - GPS tracking
3. Background Location - Continued tracking while paused

**Permission Flow**:
1. Check on service initialization
2. Request before recording start if not granted
3. Fallback: Direct users to settings if still not granted
4. Background reconnection when app returns to foreground

---

### FILE PATHS SUMMARY

| Component | Path |
|-----------|------|
| Recording Screen | `/home/deancochran/GradientPeak/apps/mobile/app/(internal)/record/index.tsx` |
| Dashboard Card | `/home/deancochran/GradientPeak/apps/mobile/components/RecordingCarousel/cards/DashboardCard.tsx` |
| Trainer Control Card | `/home/deancochran/GradientPeak/apps/mobile/components/RecordingCarousel/cards/TrainerControlCard.tsx` |
| Current Step Display | `/home/deancochran/GradientPeak/apps/mobile/components/ActivityPlan/CurrentStepDisplay.tsx` |
| Next Step Preview | `/home/deancochran/GradientPeak/apps/mobile/components/ActivityPlan/NextStepPreview.tsx` |
| Templates List | `/home/deancochran/GradientPeak/apps/mobile/components/TemplatesList.tsx` |
| Activity Recorder Service | `/home/deancochran/GradientPeak/apps/mobile/lib/services/ActivityRecorder/index.ts` |
| Sensors Manager | `/home/deancochran/GradientPeak/apps/mobile/lib/services/ActivityRecorder/sensors.ts` |
| FTMS Controller | `/home/deancochran/GradientPeak/apps/mobile/lib/services/ActivityRecorder/FTMSController.ts` |
| Stream Buffer | `/home/deancochran/GradientPeak/apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts` |
| Live Metrics Manager | `/home/deancochran/GradientPeak/apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts` |
| Selection Store | `/home/deancochran/GradientPeak/apps/mobile/lib/stores/activitySelectionStore.ts` |
| Recorder Provider | `/home/deancochran/GradientPeak/apps/mobile/lib/providers/ActivityRecorderProvider.tsx` |
| Recorder Hooks | `/home/deancochran/GradientPeak/apps/mobile/lib/hooks/useActivityRecorder.ts` |
| FTMS Types | `/home/deancochran/GradientPeak/packages/core/ftms-types.ts` |
| Wahoo Sync Service | `/home/deancochran/GradientPeak/packages/trpc/src/lib/integrations/wahoo/sync-service.ts` |

This implementation demonstrates a sophisticated React Native fitness app with real-time metrics tracking, trainer control via FTMS protocol, Bluetooth device management, and file-based data persistence designed for long workout sessions.
</output>

## Assistant

Now let me compile the comprehensive recommendations with priority rankings.# GradientPeak UX/UI Research & Improvement Recommendations

Based on my comprehensive research of industry standards, competitor analysis, and examination of your React Native codebase, here are actionable recommendations for each issue:

---

## **1. Redundant Trainer Control Status Label**

### Research Findings
- **Industry Standard**: Apps like Zwift, TrainerRoad, and Wahoo emphasize clear trainer control status to prevent conflicts when multiple apps try to control the same trainer
- **Best Practice**: Status indicators should be contextual and dismissible after initial acknowledgment
- **Wahoo Approach**: Uses "Passive Mode" with minimal persistent indicators; control status is only prominent during mode switches

### Current Implementation
Location: `apps/mobile/app/(internal)/record/index.tsx:272-304`
- Header banner with "Trainer Control Active" persists throughout entire workout
- Shows target power/grade with Zap icon

### Recommendations
1. **Remove persistent banner with contextual badge**

2. **Add trainer control indicator to relevant card only**
   - Move status to TrainerControlCard.tsx header instead of screen-level banner
   - Use color coding: Green = Auto ERG, Blue = Manual, Gray = Disconnected


**Priority**: MEDIUM  
**Complexity**: Low (2-3 hours)  
**User Impact**: Reduces visual clutter without compromising safety

**Reference Sources**:
- [Wahoo Trainer Control Modes](https://support.wahoofitness.com/hc/en-us/articles/204281764-Trainer-control-modes-for-KICKR-CORE-SNAP-or-BIKE-in-the-Wahoo-app)
- [Zwift and TrainerRoad Together](https://zwiftinsider.com/zwift-and-trainerroad/)

---

## **2. Elevation Metrics Overflow**

### Research Findings
- **Card Layout Best Practice**: Each card should convey a single metric or closely related metric group
- **Responsive Design**: Cards should use dynamic height based on content or implement scrolling for overflow
- **Fitness App Pattern**: Apps like Strava use collapsible metric sections or paginated card views

### Current Implementation
Location: `apps/mobile/components/RecordingCarousel/cards/DashboardCard.tsx`
- Fixed 6-metric grid layout
- No overflow handling for elevation data

### Recommendations
1. **Implement scrollable metric grid**
   ```typescript
   <ScrollView 
     style={styles.metricsContainer}
     contentContainerStyle={styles.metricsContent}
     showsVerticalScrollIndicator={false}
   >
     <View style={styles.metricsGrid}>
       {/* Metrics */}
     </View>
   </ScrollView>
   ```

2. **Use dynamic card height based on content**
   - Allow dashboard card to expand vertically
   - Limit to 8-10 visible metrics, then scroll

3. **Create dedicated elevation card** (Recommended)
   - Add new "ElevationCard" to carousel
   - Show elevation profile graph with metrics overlay
   - Includes: Total Ascent, Total Descent, Current Elevation, Avg Grade, Max Grade
   - Only appears for outdoor activities with GPS

4. **Implement metric priority system**
   - Primary metrics (always visible): Time, Distance, Speed, Power, HR
   - Secondary metrics (collapsible): Elevation, Cadence, Temperature
   - Add "More Metrics" expansion button

**Priority**: HIGH  
**Complexity**: Medium (4-6 hours)  
**User Impact**: Prevents data truncation and improves readability

**Reference Sources**:
- [Card UI Design Examples](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners)
- [Fitness App UI Design Principles](https://stormotion.io/blog/fitness-app-ux/)

---

## **3. Missing Cadence Data from Smart Trainer**

### Research Findings
- **FTMS Specification**: Bluetooth Fitness Machine Service includes Indoor Bike Data characteristic (Section 4.9) with Instantaneous Cadence and Average Cadence fields
- **Standard Practice**: Smart trainers like KICKR CORE broadcast cadence via FTMS alongside power data
- **Characteristic**: UUID `0x2AD2` (Indoor Bike Data)

### Current Implementation
Location: `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts`
- Currently reading Indoor Bike Data characteristic
- Parsing power but not extracting cadence

### Recommendations
1. **Update FTMS Indoor Bike Data parser** (Critical Fix)
   
   The Indoor Bike Data characteristic has this structure:
   ```
   Flags (2 bytes)
   - Bit 0: More Data
   - Bit 1: Average Speed present
   - Bit 2: Instantaneous Cadence present
   - Bit 3: Average Cadence present
   - Bit 4: Total Distance present
   - Bit 5: Resistance Level present
   - Bit 6: Instantaneous Power present
   - Bit 7: Average Power present
   ```

   Update parser to check flags and extract cadence:
   ```typescript
   // In FTMSController.ts
   private parseIndoorBikeData(data: ArrayBuffer): FTMSIndoorBikeData {
     const view = new DataView(data);
     const flags = view.getUint16(0, true);
     let offset = 2;
     
     const result: FTMSIndoorBikeData = {};
     
     // Instantaneous Speed (if present)
     if (flags & 0x01) {
       result.instantaneousSpeed = view.getUint16(offset, true) / 100; // km/h
       offset += 2;
     }
     
     // Average Speed (if present)
     if (flags & 0x02) {
       result.averageSpeed = view.getUint16(offset, true) / 100;
       offset += 2;
     }
     
     // Instantaneous Cadence (NEW - Bit 2)
     if (flags & 0x04) {
       result.instantaneousCadence = view.getUint16(offset, true) / 2; // rpm
       offset += 2;
     }
     
     // Average Cadence (NEW - Bit 3)
     if (flags & 0x08) {
       result.averageCadence = view.getUint16(offset, true) / 2;
       offset += 2;
     }
     
     // Continue parsing other fields...
     // Instantaneous Power (Bit 6)
     if (flags & 0x40) {
       result.instantaneousPower = view.getInt16(offset, true);
       offset += 2;
     }
     
     return result;
   }
   ```

2. **Verify KICKR CORE feature support**
   - Read Fitness Machine Feature characteristic (UUID `0x2ACC`) on connection
   - Check bit 2 (Cadence Supported) in feature flags
   - Store in `ftmsFeatures` object

3. **Update data flow to LiveMetricsManager**
   - Pass cadence readings from FTMS to metrics manager
   - Update avgCadence and maxCadence calculations
   - Display in dashboard card

**Priority**: CRITICAL  
**Complexity**: Medium (3-4 hours)  
**User Impact**: Essential data currently missing; directly affects workout analysis

**Reference Sources**:
- [Bluetooth FTMS Specification](https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/)
- [FTMS Specification PDF](https://www.onelap.cn/pdf/FTMS_v1.0.pdf)
- [FTMS Overview - Kinni](https://kinni.co/what-is-ftms/)

---

## **4. Incorrect Distance Calculation for Indoor Training**

### Research Findings
- **TrainerRoad Approach**: Uses "Virtual Speed" - physics-based model using power data to estimate realistic speed/distance
- **Industry Standard**: Most apps either:
  1. Disable distance for stationary indoor (Zwift without route)
  2. Calculate virtual distance from power + rider weight
  3. Show "Virtual Distance" label clearly
- **User Expectation**: Indoor distance should not match outdoor distance at same power due to aerodynamics

### Current Implementation
Location: `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts`
- Distance calculated from location updates
- No differentiation between indoor/outdoor activities

### Recommendations
1. **Implement virtual distance for indoor activities** (Recommended)
   
   Use simplified power-to-speed model:
   ```typescript
   // In LiveMetricsManager.ts
   private calculateVirtualDistance(powerWatts: number, durationSeconds: number, riderWeightKg: number = 75): number {
     // Simplified virtual speed model
     // Based on flat road, no wind, standard bike position
     const CRR = 0.005; // Rolling resistance coefficient
     const CDA = 0.324; // Drag coefficient * frontal area (m²)
     const AIR_DENSITY = 1.225; // kg/m³
     const DRIVETRAIN_LOSS = 0.03; // 3% loss
     
     const effectivePower = powerWatts * (1 - DRIVETRAIN_LOSS);
     const totalMassKg = riderWeightKg + 8; // Rider + bike
     
     // Solve for speed using power equation
     // P = (CRR * m * g * v) + (0.5 * ρ * CDA * v³)
     // Simplified iterative solution
     let speed = 0; // m/s
     for (let v = 0; v < 20; v += 0.1) {
       const rollingResistance = CRR * totalMassKg * 9.81 * v;
       const airResistance = 0.5 * AIR_DENSITY * CDA * Math.pow(v, 3);
       const requiredPower = rollingResistance + airResistance;
       
       if (requiredPower >= effectivePower) {
         speed = v;
         break;
       }
     }
     
     const distanceMeters = speed * durationSeconds;
     return distanceMeters / 1000; // Convert to km
   }
   ```

2. **Add activity location detection**
   ```typescript
   // In ActivityRecorder start()
   const isIndoor = payload.location === 'indoor';
   
   if (isIndoor) {
     this.liveMetricsManager.setVirtualDistanceMode(true, profile.weight);
   } else {
     this.liveMetricsManager.setVirtualDistanceMode(false);
   }
   ```

3. **Update UI to show "Virtual Distance" label**
   ```typescript
   // In DashboardCard.tsx
   <Text style={styles.metricLabel}>
     {isIndoor ? 'Virtual Distance' : 'Distance'}
   </Text>
   ```

4. **Alternative: Disable distance for indoor** (Simpler)
   ```typescript
   // Only show distance metric if outdoor activity
   {!isIndoor && (
     <MetricDisplay label="Distance" value={distance} unit="km" />
   )}
   ```

**Priority**: HIGH  
**Complexity**: Medium-High (5-8 hours for full virtual distance implementation, 1 hour to disable)  
**User Impact**: Prevents confusing/incorrect distance data; aligns with user expectations

**Reference Sources**:
- [TrainerRoad Virtual Speed Documentation](https://support.trainerroad.com/hc/en-us/articles/203103294-Speed-Distance-on-an-Indoor-Trainer)
- [Indoor Cycling Apps Comparison](https://www.cyclingnews.com/features/indoor-cycling-apps/)

---

## **5. Trainer Control UI Layout Issues**

### Research Findings
- **Zwift Pattern**: ERG mode intensity adjustment with +/- buttons, bias slider
- **TrainerRoad Pattern**: 0-100% resistance slider, clear mode indication
- **Best Practice**: Group related controls, use clear visual hierarchy, ensure touch targets are minimum 44x44pt

### Current Implementation
Location: `apps/mobile/components/RecordingCarousel/cards/TrainerControlCard.tsx`
- Mode selector, target adjustment buttons, current values

### Recommendations
1. **Implement proper container constraints**
   ```typescript
   <View style={styles.cardContainer}>
     <ScrollView 
       contentContainerStyle={styles.contentContainer}
       showsVerticalScrollIndicator={false}
     >
       {/* Control elements */}
     </ScrollView>
   </View>
   
   const styles = StyleSheet.create({
     cardContainer: {
       flex: 1,
       padding: 16,
     },
     contentContainer: {
       flexGrow: 1,
       gap: 12,
     },
   });
   ```

2. **Use sectioned layout with clear visual separation**
   ```
   ┌─────────────────────────┐
   │ 🎯 ERG Mode        [⚙️] │ ← Header
   ├─────────────────────────┤
   │ Current: 225W           │ ← Status
   │ Target:  250W           │
   ├─────────────────────────┤
   │ [−]  250W  [+]          │ ← Controls
   │                         │
   │ [ Auto ] Reset          │ ← Actions
   └─────────────────────────┘
   ```

3. **Add responsive button layout**
   ```typescript
   <View style={styles.controlRow}>
     <TouchableOpacity 
       style={styles.adjustButton}
       onPressIn={() => startDecrement()}
       onPressOut={() => stopAdjustment()}
     >
       <Text style={styles.buttonText}>−</Text>
     </TouchableOpacity>
     
     <View style={styles.targetDisplay}>
       <Text style={styles.targetValue}>{target}</Text>
       <Text style={styles.targetUnit}>W</Text>
     </View>
     
     <TouchableOpacity 
       style={styles.adjustButton}
       onPressIn={() => startIncrement()}
       onPressOut={() => stopAdjustment()}
     >
       <Text style={styles.buttonText}>+</Text>
     </TouchableOpacity>
   </View>
   ```

4. **Use FlexBox with proper spacing**
   - Set explicit heights for control sections
   - Use `gap` for consistent spacing (React Native 0.71+)
   - Ensure minimum touch target size of 44x44 points

**Priority**: MEDIUM  
**Complexity**: Medium (4-5 hours)  
**User Impact**: Improves usability and prevents UI clipping

**Reference Sources**:
- [Zwift ERG Mode Guide](https://www.smartbiketrainers.com/use-erg-mode-zwift-4293)
- [TrainerRoad Forum: Resistance Control](https://www.trainerroad.com/forum/t/zwift-ride-smart-frame-and-resistance-mode/95764)

---

## **6. Bluetooth Connection State Flicker**

### Research Findings
- **iOS Core Bluetooth**: `didConnect` fires immediately after connection, before pairing completes
- **Android BLE**: `onConnectionStateChange` may not fire when peripherals disconnect unexpectedly
- **Best Practice**: Implement state machine with transition guards to prevent conflicting states

### Current Implementation
Location: `apps/mobile/lib/services/ActivityRecorder/sensors.ts`
- Connection states: disconnected, connecting, connected, failed
- Reconnection logic with exponential backoff

### Recommendations
1. **Implement state machine with transition validation**
   ```typescript
   class SensorConnectionStateMachine {
     private state: SensorConnectionState = 'disconnected';
     private transitionInProgress: boolean = false;
     
     async transition(
       to: SensorConnectionState,
       validate: () => Promise<boolean> = async () => true
     ): Promise<boolean> {
       // Prevent concurrent transitions
       if (this.transitionInProgress) {
         console.warn('Transition already in progress, ignoring');
         return false;
       }
       
       // Validate state transition
       if (!this.isValidTransition(this.state, to)) {
         console.warn(`Invalid transition: ${this.state} -> ${to}`);
         return false;
       }
       
       this.transitionInProgress = true;
       
       try {
         const isValid = await validate();
         if (isValid) {
           this.state = to;
           this.emit('stateChanged', to);
           return true;
         }
         return false;
       } finally {
         this.transitionInProgress = false;
       }
     }
     
     private isValidTransition(from: SensorConnectionState, to: SensorConnectionState): boolean {
       const validTransitions = {
         'disconnected': ['connecting'],
         'connecting': ['connected', 'failed', 'disconnected'],
         'connected': ['disconnected'],
         'failed': ['connecting', 'disconnected'],
       };
       
       return validTransitions[from]?.includes(to) ?? false;
     }
   }
   ```

2. **Add debouncing for rapid state changes**
   ```typescript
   private connectionStateDebouncer = new Map<string, NodeJS.Timeout>();
   
   private debounceStateChange(sensorId: string, newState: SensorConnectionState, delay: number = 500) {
     // Clear existing timeout
     const existingTimeout = this.connectionStateDebouncer.get(sensorId);
     if (existingTimeout) {
       clearTimeout(existingTimeout);
     }
     
     // Set new timeout
     const timeout = setTimeout(() => {
       this.updateSensorConnectionState(sensorId, newState);
       this.connectionStateDebouncer.delete(sensorId);
     }, delay);
     
     this.connectionStateDebouncer.set(sensorId, timeout);
   }
   ```

3. **Update UI to show single authoritative state**
   ```typescript
   // In recording UI, derive display state from sensor object
   const getDisplayState = (sensor: ConnectedSensor) => {
     const { connectionState, lastDataTimestamp } = sensor;
     
     // Show 'connected' only if receiving data
     if (connectionState === 'connected') {
       const timeSinceData = Date.now() - (lastDataTimestamp || 0);
       if (timeSinceData > 5000) {
         return 'connecting'; // No data for 5s, treat as connecting
       }
     }
     
     return connectionState;
   };
   ```

4. **Add connection quality indicator**
   Instead of just connected/disconnected, show signal quality:
   - Green: Connected, receiving data
   - Yellow: Connected, no recent data
   - Red: Disconnected

**Priority**: HIGH  
**Complexity**: Medium (4-6 hours)  
**User Impact**: Eliminates confusion during device pairing and improves perceived reliability

**Reference Sources**:
- [Apple Core Bluetooth Guide](https://punchthrough.com/core-bluetooth-guide/)
- [Android BLE Connection Management](https://blog.stackademic.com/establishing-connection-with-bluetooth-classic-in-android-1f9f17c9a452)

---

## **7. Card Swipe Navigation Glitch**

### Research Findings
- **react-native-snap-carousel**: Industry-standard library with snap-to-position, overscroll prevention
- **Best Practice**: Use `snapToAlignment` and `decelerationRate='fast'` for better snap feeling
- **Alternative**: FlatList with `snapToInterval` for simpler use cases

### Current Implementation
Location: `apps/mobile/components/RecordingCarousel/index.tsx`
- Custom FlatList implementation with tripled array for infinite scroll
- No snap constraints or overscroll prevention

### Recommendations
1. **Implement snap constraints with FlatList** (Current approach improvement)
   ```typescript
   <FlatList
     data={cards}
     horizontal
     pagingEnabled={false}
     snapToInterval={CARD_WIDTH + CARD_MARGIN}
     snapToAlignment="center"
     decelerationRate="fast"
     bounces={false} // Disable bounce on iOS
     overScrollMode="never" // Disable overscroll on Android
     scrollEventThrottle={16}
     getItemLayout={(data, index) => ({
       length: CARD_WIDTH + CARD_MARGIN,
       offset: (CARD_WIDTH + CARD_MARGIN) * index,
       index,
     })}
     onMomentumScrollEnd={(event) => {
       const newIndex = Math.round(
         event.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_MARGIN)
       );
       handleCardChange(newIndex);
     }}
   />
   ```

2. **Add scroll boundaries**
   ```typescript
   const scrollX = useRef(new Animated.Value(0)).current;
   const [currentIndex, setCurrentIndex] = useState(0);
   
   const onScroll = Animated.event(
     [{ nativeEvent: { contentOffset: { x: scrollX } } }],
     {
       useNativeDriver: true,
       listener: (event) => {
         const offsetX = event.nativeEvent.contentOffset.x;
         const index = Math.round(offsetX / (CARD_WIDTH + CARD_MARGIN));
         
         // Prevent scrolling past boundaries
         if (index < 0 || index >= cards.length) {
           flatListRef.current?.scrollToIndex({
             index: Math.max(0, Math.min(index, cards.length - 1)),
             animated: true,
           });
         }
       },
     }
   );
   ```

3. **Use react-native-snap-carousel** (Alternative - more robust)
   ```typescript
   import Carousel from 'react-native-snap-carousel';
   
   <Carousel
     data={cards}
     renderItem={renderCard}
     sliderWidth={SCREEN_WIDTH}
     itemWidth={CARD_WIDTH + CARD_MARGIN}
     layout="default"
     layoutCardOffset={18}
     enableSnap={true}
     enableMomentum={false} // Better snap feeling
     decelerationRate="fast"
     activeSlideAlignment="center"
     inactiveSlideScale={0.94}
     inactiveSlideOpacity={0.7}
     loop={false} // Prevent infinite loop issues
     loopClonesPerSide={0}
     onSnapToItem={(index) => handleCardChange(index)}
   />
   ```

4. **Add snap-back animation on overscroll**
   ```typescript
   const handleScrollEnd = (event) => {
     const offsetX = event.nativeEvent.contentOffset.x;
     const maxOffset = (cards.length - 1) * (CARD_WIDTH + CARD_MARGIN);
     
     if (offsetX < 0) {
       // Scrolled past start
       flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
     } else if (offsetX > maxOffset) {
       // Scrolled past end
       flatListRef.current?.scrollToOffset({ offset: maxOffset, animated: true });
     }
   };
   ```

**Priority**: MEDIUM  
**Complexity**: Medium (3-5 hours with FlatList improvements, 2-3 hours with react-native-snap-carousel)  
**User Impact**: Prevents jarring glitches and improves navigation experience

**Reference Sources**:
- [react-native-snap-carousel GitHub](https://github.com/meliorence/react-native-snap-carousel)
- [React Native Carousel Tutorial](https://blog.logrocket.com/implement-react-native-snap-carousel/)
- [Horizontal Card Carousel Guide](https://dev.to/reime005/horizontal-card-carousel-in-react-native-303n)

---

## **8. Auto ERG Doesn't Recognize Active Plans on Late Connection**

### Research Findings
- **Event-Driven Architecture**: Fitness apps should use real-time event detection for sensor connections
- **Best Practice**: Implement device state change listeners that trigger workout synchronization
- **Industry Pattern**: Apps like Strava and Zwift use pub/sub patterns (MQTT, WebSocket) for real-time sensor integration

### Current Implementation
Location: `apps/mobile/lib/services/ActivityRecorder/index.ts`
- `setupPlanTrainerIntegration()` called once during initialization
- Listens to `stepChanged` events but not dynamic device connections

### Recommendations
1. **Add dynamic trainer connection listener** (Critical Fix)
   ```typescript
   // In ActivityRecorder.ts
   private setupDynamicTrainerDetection() {
     // Listen for new controllable trainers
     this.sensorsManager.on('controllerConnected', (sensorId: string) => {
       console.log('Controllable trainer connected:', sensorId);
       
       // Check if workout is in progress
       if (this.state === 'recording' && this.currentPlan) {
         // Reapply plan integration
         this.setupPlanTrainerIntegration();
         
         // Apply current step targets immediately
         if (this.currentStep) {
           this.applyStepTargets(this.currentStep);
         }
         
       }
     });
     
     // Also listen for reconnections
     this.sensorsManager.on('sensorReconnected', (sensorId: string) => {
       const sensor = this.sensorsManager.getSensorById(sensorId);
       if (sensor?.isControllable && this.state === 'recording' && this.currentPlan) {
         this.applyStepTargets(this.currentStep);
       }
     });
   }
   ```

2. **Update SensorsManager to emit controller events**
   ```typescript
   // In sensors.ts
   async connectSensor(deviceId: string): Promise<void> {
     // ... existing connection logic ...
     
     // After successful connection and feature detection
     if (sensor.isControllable) {
       this.emit('controllerConnected', deviceId);
     }
   }
   
   private async reconnectSensor(sensorId: string): Promise<void> {
     // ... existing reconnection logic ...
     
     // After successful reconnection
     this.emit('sensorReconnected', sensorId);
   }
   ```

3. **Add state synchronization method**
   ```typescript
   // In ActivityRecorder.ts
   public syncTrainerWithWorkout(): void {
     const trainer = this.sensorsManager.getControllableTrainer();
     
     if (!trainer) {
       console.log('No controllable trainer available');
       return;
     }
     
     if (!this.currentPlan || !this.currentStep) {
       console.log('No active plan or step');
       return;
     }
     
     // Re-establish plan integration
     this.setupPlanTrainerIntegration();
     
     // Apply current step targets
     this.applyStepTargets(this.currentStep);
     
     console.log('Trainer synchronized with workout state');
   }
   ```

4. **Add UI button for manual sync** (Fallback)
   ```typescript
   // In TrainerControlCard.tsx
   <TouchableOpacity 
     style={styles.syncButton}
     onPress={() => service.syncTrainerWithWorkout()}
   >
     <Icon name="refresh-cw" size={20} color="#fff" />
     <Text style={styles.syncText}>Sync Workout</Text>
   </TouchableOpacity>
   ```

5. **Implement startup reconciliation**
   ```typescript
   // In ActivityRecorder.startRecording()
   async startRecording(): Promise<void> {
     // ... existing start logic ...
     
     // After sensors start, check for late-connected trainers
     setTimeout(() => {
       const trainer = this.sensorsManager.getControllableTrainer();
       if (trainer && this.currentPlan && !this.planTrainerIntegrationSetup) {
         console.log('Late trainer detection - setting up integration');
         this.setupPlanTrainerIntegration();
       }
     }, 2000); // Give 2 seconds for device connection
   }
   ```

**Priority**: CRITICAL  
**Complexity**: Medium (4-6 hours)  
**User Impact**: Essential for reliable workout execution; prevents missed intervals

**Reference Sources**:
- [Event-Driven Architecture for IoT Sensors](https://aws.amazon.com/blogs/architecture/building-event-driven-architectures-with-iot-sensor-data/)
- [Building Fitness Apps with Real-Time Sensors](https://www.weblineindia.com/blog/build-fitness-app-like-strava/)

---

## **9. Recording Modal Safe Area Violation**

### Research Findings
- **React Native Standard**: Use `react-native-safe-area-context` (built-in SafeAreaView is iOS-only)
- **Best Practice**: Always wrap modal content with SafeAreaProvider and useSafeAreaInsets hook
- **React Navigation**: Recommends useSafeAreaInsets over SafeAreaView to avoid animation flickering

### Current Implementation
Location: `apps/mobile/app/(internal)/record/index.tsx`
- Recording screen as modal without safe area handling

### Recommendations
1. **Install and configure react-native-safe-area-context**
   ```bash
   npm install react-native-safe-area-context
   ```

2. **Wrap app root with SafeAreaProvider** (if not already done)
   ```typescript
   // In app/_layout.tsx or App.tsx
   import { SafeAreaProvider } from 'react-native-safe-area-context';
   
   export default function RootLayout() {
     return (
       <SafeAreaProvider>
         {/* Your app content */}
       </SafeAreaProvider>
     );
   }
   ```

3. **Use useSafeAreaInsets in recording screen**
   ```typescript
   // In record/index.tsx
   import { useSafeAreaInsets } from 'react-native-safe-area-context';
   
   export default function RecordScreen() {
     const insets = useSafeAreaInsets();
     
     return (
       <View style={[styles.container, {
         paddingTop: insets.top,
         paddingBottom: insets.bottom,
         paddingLeft: insets.left,
         paddingRight: insets.right,
       }]}>
         {/* Header */}
         <View style={styles.header}>
           {/* ... */}
         </View>
         
         {/* Content */}
         <RecordingCarousel />
         
         {/* Controls */}
         <View style={styles.controls}>
           {/* ... */}
         </View>
       </View>
     );
   }
   ```

4. **Alternative: Use SafeAreaView wrapper** (simpler but less flexible)
   ```typescript
   import { SafeAreaView } from 'react-native-safe-area-context';
   
   export default function RecordScreen() {
     return (
       <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
         {/* Content */}
       </SafeAreaView>
     );
   }
   ```

5. **Specific safe area margins** (recommended values)
   - **iOS**: Dynamic based on notch/home indicator (insets.top, insets.bottom)
   - **Android**: Typically 24-48pt top (status bar), 0-24pt bottom (gesture bar)
   - **Minimum fallback**: 24pt top, 16pt bottom if safe area context not available

6. **Test on multiple devices**
   - iPhone with notch (X, 11, 12, 13, 14, 15)
   - iPhone with Dynamic Island (14 Pro, 15 Pro, 16 Pro)
   - Android with gesture navigation
   - Android with buttons

**Priority**: HIGH  
**Complexity**: Low (1-2 hours)  
**User Impact**: Prevents content being hidden behind notches/status bars; professional appearance

**Reference Sources**:
- [Expo Safe Area Documentation](https://docs.expo.dev/develop/user-interface/safe-areas/)
- [React Navigation Safe Area Guide](https://reactnavigation.org/docs/handling-safe-area/)
- [react-native-safe-area-context GitHub](https://github.com/AppAndFlow/react-native-safe-area-context)

---

## **10. Power/Grade/Resistance Control UX**

### Research Findings
- **Haptic Feedback**: Apps should use transient haptics for button taps and continuous haptics for hold-to-repeat
- **Acceleration Curves**: Increase adjustment speed over time (start slow, accelerate after 1-2 seconds)
- **Best Practice**: 100-200ms initial delay, 50ms repeat interval with 1.5-2x acceleration multiplier

### Current Implementation
Location: `apps/mobile/components/RecordingCarousel/cards/TrainerControlCard.tsx`
- Buttons respond to single taps only
- No hold-to-repeat functionality

### Recommendations
1. **Implement hold-to-repeat with acceleration**
   ```typescript
   import { useRef, useState } from 'react';
   import * as Haptics from 'expo-haptics';
   
   function TrainerControlCard() {
     const [targetPower, setTargetPower] = useState(250);
     const incrementInterval = useRef<NodeJS.Timeout | null>(null);
     const accelerationTimer = useRef<NodeJS.Timeout | null>(null);
     const currentSpeed = useRef(1);
     
     const startIncrement = (direction: 1 | -1) => {
       // Initial haptic feedback
       Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
       
       // Immediate first adjustment
       adjustTarget(direction);
       
       // Start repeating after 300ms delay
       setTimeout(() => {
         currentSpeed.current = 1;
         
         const repeat = () => {
           adjustTarget(direction);
           
           // Haptic feedback for each adjustment
           Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
           
           // Calculate next interval with acceleration
           const baseInterval = 150; // ms
           const minInterval = 50; // ms
           const nextInterval = Math.max(
             minInterval,
             baseInterval / currentSpeed.current
           );
           
           incrementInterval.current = setTimeout(repeat, nextInterval);
         };
         
         repeat();
         
         // Accelerate every second
         accelerationTimer.current = setInterval(() => {
           currentSpeed.current = Math.min(currentSpeed.current * 1.5, 4);
         }, 1000);
       }, 300);
     };
     
     const stopIncrement = () => {
       // Clear all timers
       if (incrementInterval.current) {
         clearTimeout(incrementInterval.current);
         incrementInterval.current = null;
       }
       if (accelerationTimer.current) {
         clearInterval(accelerationTimer.current);
         accelerationTimer.current = null;
       }
       
       // Reset speed
       currentSpeed.current = 1;
       
       // Final haptic feedback
       Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
     };
     
     const adjustTarget = (direction: 1 | -1) => {
       const increment = 5; // 5W increments
       const min = 50;
       const max = 600;
       
       setTargetPower(prev => {
         const newValue = prev + (increment * direction * currentSpeed.current);
         return Math.max(min, Math.min(max, Math.round(newValue / 5) * 5));
       });
     };
     
     return (
       <View style={styles.controls}>
         <TouchableOpacity
           style={styles.button}
           onPressIn={() => startIncrement(-1)}
           onPressOut={stopIncrement}
           onLongPress={() => {}} // Required for onPressIn
         >
           <Text style={styles.buttonText}>−</Text>
         </TouchableOpacity>
         
         <Text style={styles.targetValue}>{targetPower}W</Text>
         
         <TouchableOpacity
           style={styles.button}
           onPressIn={() => startIncrement(1)}
           onPressOut={stopIncrement}
           onLongPress={() => {}}
         >
           <Text style={styles.buttonText}>+</Text>
         </TouchableOpacity>
       </View>
     );
   }
   ```

2. **Add visual feedback during hold**
   ```typescript
   const [isHolding, setIsHolding] = useState(false);
   
   const startIncrement = (direction: 1 | -1) => {
     setIsHolding(true);
     // ... rest of logic
   };
   
   const stopIncrement = () => {
     setIsHolding(false);
     // ... rest of logic
   };
   
   // In styles
   <TouchableOpacity
     style={[
       styles.button,
       isHolding && styles.buttonActive
     ]}
   >
   ```

3. **Add increment size configuration**
   ```typescript
   const getIncrement = (controlMode: ControlMode) => {
     switch (controlMode) {
       case 'erg': return 5; // 5W increments
       case 'sim': return 0.5; // 0.5% grade increments
       case 'resistance': return 1; // 1 level increments
       default: return 1;
     }
   };
   ```

4. **Add debouncing for FTMS commands**
   ```typescript
   const debouncedSendToTrainer = useRef(
     debounce((power: number) => {
       service.sensorsManager.setPowerTarget(power);
     }, 250) // Send at most every 250ms
   ).current;
   
   const adjustTarget = (direction: 1 | -1) => {
     const newValue = calculateNewValue(direction);
     setTargetPower(newValue);
     debouncedSendToTrainer(newValue);
   };
   ```

5. **Install expo-haptics** (if not already installed)
   ```bash
   npx expo install expo-haptics
   ```

**Priority**: MEDIUM-HIGH  
**Complexity**: Medium (3-4 hours)  
**User Impact**: Significantly improves usability during workouts; reduces interaction friction

**Reference Sources**:
- [Haptic UX Design Guide](https://medium.muz.li/haptic-ux-the-design-guide-for-building-touch-experiences-84639aa4a1b8)
- [Android Haptics UX Design](https://source.android.com/docs/core/interaction/haptics/haptics-ux-design)
- [iOS Core Haptics](https://exyte.com/blog/creating-haptic-feedback-with-core-haptics)

---

## **11. App Crash Results in Complete Data Loss**

### Research Findings
- **iOS HealthKit**: System automatically relaunches app after crash and restores workout session
- **Android Health Services**: Use Room database for data persistence with WorkManager for uploads
- **Best Practice**: Auto-save every 30-60 seconds, implement crash recovery on app restart
- **Industry Standard**: Strava, TrainerRoad, Garmin all implement continuous auto-save

### Current Implementation
Location: `apps/mobile/lib/services/ActivityRecorder/`
- StreamBuffer with 60-second flush interval
- Data stored in memory until periodic flush
- No crash recovery mechanism

### Recommendations
1. **Reduce auto-save interval to 10-15 seconds** (Critical)
   ```typescript
   // In StreamBuffer.ts or config.ts
   const PERSISTENCE_INTERVAL = 15000; // 15 seconds (was 60s)
   ```

2. **Implement automatic crash recovery**
   ```typescript
   // Create new file: ActivityRecorder/CrashRecovery.ts
   import AsyncStorage from '@react-native-async-storage/async-storage';
   import * as FileSystem from 'expo-file-system';
   
   interface RecoveryState {
     activityId: string;
     startTime: string;
     state: RecordingState;
     currentPlan?: any;
     currentStep?: any;
     lastSaveTime: string;
     metricsSnapshot: any;
   }
   
   export class CrashRecoveryManager {
     private static RECOVERY_KEY = '@gradientpeak:recovery_state';
     private static AUTO_SAVE_INTERVAL = 15000; // 15 seconds
     private autoSaveTimer?: NodeJS.Timeout;
     
     async saveRecoveryState(recorder: ActivityRecorder): Promise<void> {
       const state: RecoveryState = {
         activityId: recorder.activityId,
         startTime: recorder.startTime.toISOString(),
         state: recorder.state,
         currentPlan: recorder.currentPlan,
         currentStep: recorder.currentStep,
         lastSaveTime: new Date().toISOString(),
         metricsSnapshot: recorder.liveMetricsManager.getMetrics(),
       };
       
       await AsyncStorage.setItem(
         CrashRecoveryManager.RECOVERY_KEY,
         JSON.stringify(state)
       );
     }
     
     async checkForCrash(): Promise<RecoveryState | null> {
       const stateJson = await AsyncStorage.getItem(
         CrashRecoveryManager.RECOVERY_KEY
       );
       
       if (!stateJson) return null;
       
       const state: RecoveryState = JSON.parse(stateJson);
       
       // Check if last save was recent (< 5 minutes ago)
       const lastSave = new Date(state.lastSaveTime);
       const timeSinceLastSave = Date.now() - lastSave.getTime();
       
       if (timeSinceLastSave < 5 * 60 * 1000) {
         // Potential crash recovery
         return state;
       }
       
       // Old recovery state, ignore
       await this.clearRecoveryState();
       return null;
     }
     
     async clearRecoveryState(): Promise<void> {
       await AsyncStorage.removeItem(CrashRecoveryManager.RECOVERY_KEY);
     }
     
     startAutoSave(recorder: ActivityRecorder): void {
       this.autoSaveTimer = setInterval(() => {
         this.saveRecoveryState(recorder).catch(console.error);
       }, CrashRecoveryManager.AUTO_SAVE_INTERVAL);
     }
     
     stopAutoSave(): void {
       if (this.autoSaveTimer) {
         clearInterval(this.autoSaveTimer);
         this.autoSaveTimer = undefined;
       }
     }
   }
   ```

3. **Integrate crash recovery into ActivityRecorder**
   ```typescript
   // In ActivityRecorder.ts
   import { CrashRecoveryManager } from './CrashRecovery';
   
   export class ActivityRecorder extends EventEmitter {
     private crashRecovery = new CrashRecoveryManager();
     
     async initialize(): Promise<void> {
       // ... existing initialization ...
       
       // Check for crash recovery
       const recoveryState = await this.crashRecovery.checkForCrash();
       if (recoveryState) {
         this.emit('crashRecoveryAvailable', recoveryState);
       }
     }
     
     async startRecording(): Promise<void> {
       // ... existing start logic ...
       
       // Start auto-save for crash recovery
       this.crashRecovery.startAutoSave(this);
     }
     
     async finishRecording(): Promise<void> {
       // Stop auto-save
       this.crashRecovery.stopAutoSave();
       await this.crashRecovery.clearRecoveryState();
       
       // ... existing finish logic ...
     }
     
     async recoverFromCrash(recoveryState: RecoveryState): Promise<void> {
       console.log('Recovering from crash:', recoveryState);
       
       // Restore activity state
       this.activityId = recoveryState.activityId;
       this.startTime = new Date(recoveryState.startTime);
       this.currentPlan = recoveryState.currentPlan;
       this.currentStep = recoveryState.currentStep;
       
       // Restore metrics
       await this.liveMetricsManager.restoreFromSnapshot(
         recoveryState.metricsSnapshot
       );
       
       // Resume recording
       this.state = 'recording';
       this.emit('stateChanged', 'recording');
       
       // Clear recovery state
       await this.crashRecovery.clearRecoveryState();
       
       // Restart auto-save
       this.crashRecovery.startAutoSave(this);
       
       console.log('Crash recovery complete');
     }
   }
   ```

4. **Add UI for crash recovery prompt**
   ```typescript
   // In record/index.tsx or App.tsx
   useEffect(() => {
     const checkCrashRecovery = async () => {
       const recorder = ActivityRecorderService.getInstance();
       
       recorder.on('crashRecoveryAvailable', (recoveryState) => {
         Alert.alert(
           'Recover Workout?',
           `We detected an incomplete workout from ${formatTime(recoveryState.lastSaveTime)}. Would you like to recover it?`,
           [
             {
               text: 'Discard',
               style: 'cancel',
               onPress: () => recorder.crashRecovery.clearRecoveryState(),
             },
             {
               text: 'Recover',
               onPress: () => {
                 recorder.recoverFromCrash(recoveryState);
                 navigation.navigate('Record');
               },
             },
           ]
         );
       });
     };
     
     checkCrashRecovery();
   }, []);
   ```

5. **Implement write-ahead logging (Advanced)**
   ```typescript
   // For critical data changes, write to log before applying
   class WriteAheadLog {
     private logFile = `${FileSystem.documentDirectory}wal.log`;
     
     async appendEntry(entry: any): Promise<void> {
       const logEntry = JSON.stringify(entry) + '\n';
       await FileSystem.writeAsStringAsync(this.logFile, logEntry, {
         encoding: FileSystem.EncodingType.UTF8,
         append: true,
       });
     }
     
     async replayLog(): Promise<void> {
       // Read and replay all log entries
       const log = await FileSystem.readAsStringAsync(this.logFile);
       const entries = log.split('\n').filter(l => l);
       
       for (const entry of entries) {
         await this.applyEntry(JSON.parse(entry));
       }
     }
   }
   ```

6. **Add data integrity checks**
   ```typescript
   // Validate data files on recovery
   async validateActivityFiles(activityId: string): Promise<boolean> {
     try {
       const activityDir = `${FileSystem.documentDirectory}activities/${activityId}`;
       const files = await FileSystem.readDirectoryAsync(activityDir);
       
       // Check for required files
       const requiredFiles = ['metadata.json', 'power_stream.json'];
       for (const file of requiredFiles) {
         if (!files.includes(file)) {
           console.warn(`Missing required file: ${file}`);
           return false;
         }
       }
       
       return true;
     } catch (error) {
       console.error('File validation failed:', error);
       return false;
     }
   }
   ```

**Priority**: CRITICAL  
**Complexity**: High (8-12 hours for full implementation)  
**User Impact**: Prevents catastrophic data loss; essential for user trust and retention

**Reference Sources**:
- [iOS HealthKit Workout Recovery](https://developer.apple.com/videos/play/wwdc2025/322/)
- [Android Health Services Data Persistence](https://developer.android.com/health-and-fitness/health-services/active-data)
- [iOS Workout Recovery Best Practices](https://moldstud.com/articles/p-top-10-essential-tools-for-data-management-in-apple-watch-fitness-app-development)

---

## Priority Summary Table

| Issue | Priority | Complexity | Estimated Hours | User Impact |
|-------|----------|------------|-----------------|-------------|
| #11 - Data Loss on Crash | **CRITICAL** | High | 8-12 | Catastrophic data loss |
| #3 - Missing Cadence Data | **CRITICAL** | Medium | 3-4 | Essential data missing |
| #8 - Auto ERG Late Connection | **CRITICAL** | Medium | 4-6 | Workout execution failure |
| #4 - Indoor Distance Calculation | **HIGH** | Med-High | 5-8 (or 1) | Incorrect/confusing data |
| #6 - Connection State Flicker | **HIGH** | Medium | 4-6 | Confusing UX, trust issue |
| #9 - Safe Area Violation | **HIGH** | Low | 1-2 | Content hidden/unprofessional |
| #2 - Elevation Overflow | **HIGH** | Medium | 4-6 | Data truncation |
| #10 - Hold-to-Repeat Controls | **MED-HIGH** | Medium | 3-4 | Usability friction |
| #5 - Trainer Control Layout | **MEDIUM** | Medium | 4-5 | UI clipping |
| #7 - Card Swipe Glitch | **MEDIUM** | Medium | 3-5 | Jarring navigation |
| #1 - Redundant Status Label | **MEDIUM** | Low | 2-3 | Visual clutter |

**Total Estimated Development Time**: 41-61 hours

---

## Recommended Implementation Order

### Phase 1: Critical Fixes (Week 1)
1. **Issue #11** - Crash recovery (12 hours)
2. **Issue #3** - Cadence data (4 hours)
3. **Issue #8** - Auto ERG connection (6 hours)
4. **Issue #9** - Safe area (2 hours)

### Phase 2: High-Priority UX (Week 2)
5. **Issue #4** - Indoor distance (8 hours or 1 hour for disable)
6. **Issue #6** - Connection state (6 hours)
7. **Issue #2** - Elevation overflow (6 hours)

### Phase 3: Polish & Refinement (Week 3)
8. **Issue #10** - Hold-to-repeat (4 hours)
9. **Issue #5** - Trainer control layout (5 hours)
10. **Issue #7** - Card swipe (5 hours)
11. **Issue #1** - Status label (3 hours)

---

## Additional Recommendations

### Testing Strategy
1. **Crash Recovery Testing**:
   - Force kill app during active recording
   - Test recovery with various data amounts
   - Verify data integrity after recovery

2. **Bluetooth Testing**:
   - Test with multiple KICKR CORE firmware versions
   - Test late connection scenarios
   - Test rapid connect/disconnect cycles

3. **Device Testing**:
   - Test on iPhone with notch, Dynamic Island, and older models
   - Test on Android with gesture navigation and buttons
   - Test on various screen sizes

### Code Quality Improvements
1. **Add TypeScript strict mode** for better type safety
2. **Implement error boundaries** for graceful error handling
3. **Add analytics tracking** for crash detection and UX improvements
4. **Create automated tests** for critical recording flows

### Documentation Needed
1. Recovery mechanism documentation for support team
2. FTMS implementation guide for future sensor additions
3. Architecture decision records (ADRs) for key design choices

---

## Sources

### Research References
- [Bluetooth FTMS Specification](https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/)
- [FTMS Specification PDF](https://www.onelap.cn/pdf/FTMS_v1.0.pdf)
- [TrainerRoad Virtual Speed](https://support.trainerroad.com/hc/en-us/articles/203103294-Speed-Distance-on-an-Indoor-Trainer)
- [Wahoo Trainer Control Modes](https://support.wahoofitness.com/hc/en-us/articles/204281764-Trainer-control-modes-for-KICKR-CORE-SNAP-or-BIKE-in-the-Wahoo-app)
- [Zwift Insider: TrainerRoad Integration](https://zwiftinsider.com/zwift-and-trainerroad/)
- [DC Rainmaker: TrainerRoad & Zwift Integration](https://www.dcrainmaker.com/2025/02/trainerroad-zwift-integration-finally-arrives-full-details.html)
- [React Native Safe Area Context](https://docs.expo.dev/develop/user-interface/safe-areas/)
- [React Navigation Safe Area Guide](https://reactnavigation.org/docs/handling-safe-area/)
- [react-native-snap-carousel](https://github.com/meliorence/react-native-snap-carousel)
- [iOS HealthKit Workout Recovery](https://developer.apple.com/videos/play/wwdc2025/322/)
- [Android Health Services](https://developer.android.com/health-and-fitness/health-services/active-data)
- [Haptic UX Design Guide](https://medium.muz.li/haptic-ux-the-design-guide-for-building-touch-experiences-84639aa4a1b8)
- [Apple Core Bluetooth Guide](https://punchthrough.com/core-bluetooth-guide/)
- [Event-Driven Architecture for IoT](https://aws.amazon.com/blogs/architecture/building-event-driven-architectures-with-iot-sensor-data/)
- [Card UI Design Best Practices](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners)
- [Fitness App UX Principles](https://stormotion.io/blog/fitness-app-ux/)
