# FTMS Integration: Recording Process Enhancement Opportunities

## Executive Summary

This document outlines how GradientPeak's activity recording process can be enhanced through FTMS (Fitness Machine Service) integration for automatic trainer control. Currently, both the mobile and web applications have the foundational infrastructure for Bluetooth connectivity and workout execution, but they differ significantly in their ability to actively control smart trainers during workouts.

**Key Finding:** The mobile app has all the necessary components for FTMS integration but lacks the control layer. The Auuki web app already implements full FTMS control and can serve as a reference implementation.

## Current Recording Process Analysis

### Mobile App Recording Architecture

#### Core Components

1. **ActivityRecorderService** (`apps/mobile/lib/services/ActivityRecorder/index.ts`)
   - Manages recording lifecycle (pending → recording → paused → finished)
   - Coordinates location tracking, sensor data, and workout plans
   - Handles permissions and notifications
   - Integrates with PlanManager for structured workouts

2. **SensorsManager** (`apps/mobile/lib/services/ActivityRecorder/sensors.ts`)
   - Manages BLE connections using `react-native-ble-plx`
   - Scans for and connects to BLE sensors
   - **Passive monitoring only** - reads characteristics but doesn't write
   - Supports: Heart Rate (HRM), Power (CPS), Cadence/Speed (CSC/RSC)
   - Parses standard BLE characteristics:
     - `00002a37` - Heart Rate Measurement
     - `00002a63` - Cycling Power Measurement
     - `00002a5b` - CSC Measurement
     - `00002a53` - RSC Measurement

3. **PlanManager** (`apps/mobile/lib/services/ActivityRecorder/plan.ts`)
   - Manages structured workout execution
   - Tracks current step and progress
   - Supports automatic and manual step advancement
   - Emits events: `planStarted`, `stepAdvanced`, `planFinished`, `planProgressUpdate`
   - Handles step targets (power, heart rate, cadence zones)

4. **Recording UI** (`apps/mobile/app/(internal)/record/`)
   - Real-time metrics display via RecordingCarousel
   - Start/pause/resume/finish controls
   - Sensor management screen for connecting BLE devices
   - Plan card showing current step targets

#### Current Workflow

```
User Flow:
1. Select activity type and optional workout plan
2. Navigate to record screen (index.tsx)
3. Connect sensors via Bluetooth screen (sensors.tsx)
4. Start recording
5. PlanManager progresses through steps (manual or automatic)
6. SensorsManager reads data from connected devices
7. User manually adjusts trainer via its controls or companion app
8. Finish and submit activity
```

#### What's Present
- ✅ BLE infrastructure (react-native-ble-plx)
- ✅ Sensor discovery and connection
- ✅ Characteristic monitoring (read/notify)
- ✅ Workout plan structure with targets
- ✅ Step progression logic
- ✅ Real-time metrics tracking
- ✅ Connection health monitoring

#### What's Missing
- ❌ FTMS characteristic write support
- ❌ Trainer control methods (setPowerTarget, setResistanceTarget, setSimulation)
- ❌ Control mode management (ERG, SIM, Resistance)
- ❌ Automatic trainer adjustment based on plan targets
- ❌ FTMS Control Point characteristic handling
- ❌ Fitness Machine Status characteristic monitoring
- ❌ Protocol negotiation (request control, reset)

### Auuki Web App Recording Architecture

#### Core Components

1. **Watch Service** (`apps/Auuki/src/watch.js`)
   - Manages watch state (started, paused, stopped)
   - Tracks workout state (started, done)
   - Handles interval and step progression
   - Manages timing (elapsed, lap time, step time)
   - Automatic step advancement based on duration

2. **FTMS Implementation** (`apps/Auuki/src/ble/ftms/`)
   - Full FTMS protocol implementation
   - **Active control** via Control Point characteristic
   - Supports three control modes:
     - **ERG Mode**: Target power control
     - **SIM Mode**: Grade/slope simulation
     - **Resistance Mode**: Direct resistance control
   
   **Key Methods:**
   ```javascript
   async function setSimulation(args = {})
   async function setPowerTarget(args = {})
   async function setResistanceTarget(args = {})
   async function protocol() // Request control
   async function reset()
   ```

3. **Connectable** (`apps/Auuki/src/ble/connectable.js`)
   - Device discovery and connection
   - Multi-protocol support (FTMS, FEC, WCPS)
   - Assigns `services.trainer` for control interface
   - Prevents protocol conflicts (only one control service)

4. **ReactiveConnectable** (`apps/Auuki/src/ble/reactive-connectable.js`)
   - Subscribes to target events: `ui:power-target-set`, `ui:slope-target-set`, `ui:resistance-target-set`
   - Maps events to trainer control methods
   - Respects control mode (only sends commands in appropriate mode)

5. **Workout Execution** (`apps/Auuki/src/workouts/`)
   - ZWO (Zwift Workout) file parsing
   - Interval and step structures
   - Duration-based automatic progression

#### Current Workflow

```
User Flow:
1. Load workout (intervals and steps with targets)
2. Connect to controllable trainer
3. Start workout
4. Watch progresses through steps automatically
5. ReactiveConnectable sends power/resistance/slope targets to trainer
6. Trainer automatically adjusts based on current step
7. User pedals, system records data
8. Finish and save activity
```

#### What Auuki Does Well
- ✅ Full FTMS protocol implementation
- ✅ Multi-protocol support (FTMS, FEC, WCPS)
- ✅ Control mode management
- ✅ Automatic trainer adjustment
- ✅ Protocol negotiation (request control, response handling)
- ✅ Control Point characteristic writes
- ✅ Fitness Machine Status monitoring
- ✅ Retry logic and error handling
- ✅ Characteristic blocking during writes (prevents command collision)

## The FTMS Control Gap

### What FTMS Enables

The Fitness Machine Service (FTMS) is a standardized Bluetooth Low Energy protocol that allows apps to control smart trainers. It defines several key characteristics:

1. **Indoor Bike Data (0x2AD2)** - Measurement characteristic (already used in mobile app passively)
   - Instantaneous speed, cadence, power, heart rate
   - Distance, resistance level
   - Currently monitored but could be enhanced

2. **Fitness Machine Control Point (0x2AD9)** - Control characteristic (MISSING in mobile app)
   - Request/release control
   - Set target power, resistance, slope
   - Start/stop/pause commands
   - Reset command

3. **Fitness Machine Status (0x2ADA)** - Status characteristic (MISSING in mobile app)
   - Device state changes
   - Safety events
   - Target confirmations

4. **Fitness Machine Feature (0x2ACC)** - Capability characteristic
   - What the device supports
   - Available targets and readings

### Control Modes

The mobile app needs to support three control modes (like Auuki):

#### 1. ERG Mode (Power Target)
**Use Case:** Structured workouts with power targets

**How It Works:**
- App sends target power to trainer
- Trainer automatically adjusts resistance to maintain target power
- User's cadence doesn't affect power output (trainer compensates)

**Example:** Threshold intervals at 250W
```typescript
// Target: 250W for 5 minutes
await trainer.setPowerTarget({ power: 250 });
```

#### 2. SIM Mode (Simulation)
**Use Case:** Virtual courses, climb simulations

**How It Works:**
- App sends grade, wind speed, rolling resistance
- Trainer simulates real-world physics
- Power varies based on user's effort and simulated conditions

**Example:** 5% climb simulation
```typescript
await trainer.setSimulation({ 
  grade: 5.0,
  crr: 0.005,
  windResistance: 0.51,
  windSpeed: 0.0 
});
```

#### 3. Resistance Mode
**Use Case:** Simple resistance-based workouts

**How It Works:**
- App sends resistance level (percentage)
- User's power output varies with cadence
- More traditional "feel" like a spin bike

**Example:** 50% resistance
```typescript
await trainer.setResistanceTarget({ resistance: 50 });
```

### Current vs. Enhanced User Experience

#### Current Mobile App Experience

```
User Journey (Without FTMS Control):
1. Create/select workout plan with power targets
2. Connect heart rate monitor and power meter
3. Start workout
4. View current step target (e.g., "250W for 5:00")
5. Manually adjust trainer using:
   - Trainer's buttons/controls
   - Trainer's companion app
   - Physical gear shifter
6. Try to match displayed target
7. Progress to next step (manual or automatic)
8. Repeat manual adjustments
```

**Pain Points:**
- Constant manual adjustment required
- Difficult to hit precise targets
- Fumbling with multiple devices/apps
- Breaks focus and flow
- Why use GradientPeak if you need another app?

#### Enhanced Mobile App Experience (With FTMS)

```
User Journey (With FTMS Control):
1. Create/select workout plan with power targets
2. Connect smart trainer (with FTMS support)
3. Start workout
4. Trainer automatically adjusts to target (e.g., 250W)
5. Just pedal - trainer maintains target power
6. Step advances automatically
7. Trainer instantly adjusts to new target
8. Focus entirely on effort, not on fiddling with controls
```

**Benefits:**
- Hands-free operation
- Precise target adherence
- Seamless workout execution
- Single-app experience
- Professional training feel
- Enhanced user retention

## Technical Implementation Requirements

### Phase 1: Core FTMS Support

#### 1. Extend SensorsManager

Add FTMS-specific functionality to the existing SensorsManager:

```typescript
// apps/mobile/lib/services/ActivityRecorder/sensors.ts

// Add FTMS UUIDs
const FTMS_SERVICE = '00001826-0000-1000-8000-00805f9b34fb';
const FTMS_INDOOR_BIKE_DATA = '00002ad2-0000-1000-8000-00805f9b34fb';
const FTMS_CONTROL_POINT = '00002ad9-0000-1000-8000-00805f9b34fb';
const FTMS_STATUS = '00002ada-0000-1000-8000-00805f9b34fb';
const FTMS_FEATURE = '00002acc-0000-1000-8000-00805f9b34fb';

enum ControlMode {
  ERG = 'erg',
  SIM = 'sim',
  RESISTANCE = 'resistance',
}

interface ConnectedSensor {
  // Existing fields...
  isControllable?: boolean;
  controlMode?: ControlMode;
  features?: {
    supportsERG: boolean;
    supportsSIM: boolean;
    supportsResistance: boolean;
  };
}
```

#### 2. Add Trainer Control Methods

```typescript
class SensorsManager {
  private controllableTrainer?: ConnectedSensor;
  private currentControlMode?: ControlMode;
  
  async connectSensor(deviceId: string) {
    // Existing connection logic...
    
    // Check if device has FTMS service
    const hasFTMS = services.some(s => 
      s.uuid.toLowerCase().includes('1826')
    );
    
    if (hasFTMS) {
      await this.setupTrainerControl(connectedSensor);
    }
  }
  
  private async setupTrainerControl(sensor: ConnectedSensor) {
    // 1. Read features to determine capabilities
    const features = await this.readFTMSFeatures(sensor);
    
    // 2. Request control
    const controlGranted = await this.requestTrainerControl(sensor);
    
    if (controlGranted) {
      sensor.isControllable = true;
      sensor.features = features;
      this.controllableTrainer = sensor;
      
      // 3. Subscribe to status characteristic
      await this.subscribeToTrainerStatus(sensor);
    }
  }
  
  private async requestTrainerControl(sensor: ConnectedSensor): Promise<boolean> {
    const device = sensor.device;
    const controlChar = await device.characteristicForService(
      FTMS_SERVICE,
      FTMS_CONTROL_POINT
    );
    
    // Op code 0x00 = Request Control
    const buffer = new Uint8Array([0x00]);
    
    try {
      await device.writeCharacteristicWithResponseForService(
        FTMS_SERVICE,
        FTMS_CONTROL_POINT,
        base64.encode(buffer)
      );
      
      // Wait for response on control point (it's also a notify characteristic)
      // Response op code 0x80 with result code 0x01 = Success
      return true;
    } catch (error) {
      console.error('Failed to request trainer control:', error);
      return false;
    }
  }
  
  async setPowerTarget(power: number): Promise<boolean> {
    if (!this.controllableTrainer) return false;
    if (this.currentControlMode !== ControlMode.ERG) {
      await this.setControlMode(ControlMode.ERG);
    }
    
    const device = this.controllableTrainer.device;
    
    // Op code 0x05 = Set Target Power
    // Power in watts (signed 16-bit, resolution 1W)
    const buffer = new Uint8Array(3);
    buffer[0] = 0x05; // Op code
    buffer[1] = power & 0xFF; // Low byte
    buffer[2] = (power >> 8) & 0xFF; // High byte
    
    try {
      await device.writeCharacteristicWithResponseForService(
        FTMS_SERVICE,
        FTMS_CONTROL_POINT,
        base64.encode(buffer)
      );
      return true;
    } catch (error) {
      console.error('Failed to set power target:', error);
      return false;
    }
  }
  
  async setSimulation(params: {
    windSpeed: number;
    grade: number;
    crr: number;
    windResistance: number;
  }): Promise<boolean> {
    if (!this.controllableTrainer) return false;
    if (this.currentControlMode !== ControlMode.SIM) {
      await this.setControlMode(ControlMode.SIM);
    }
    
    const device = this.controllableTrainer.device;
    
    // Op code 0x11 = Set Indoor Bike Simulation Parameters
    const buffer = new Uint8Array(7);
    buffer[0] = 0x11; // Op code
    
    // Wind speed (m/s, signed 16-bit, resolution 0.001 m/s)
    const windSpeed = Math.round(params.windSpeed * 1000);
    buffer[1] = windSpeed & 0xFF;
    buffer[2] = (windSpeed >> 8) & 0xFF;
    
    // Grade (percentage, signed 16-bit, resolution 0.01%)
    const grade = Math.round(params.grade * 100);
    buffer[3] = grade & 0xFF;
    buffer[4] = (grade >> 8) & 0xFF;
    
    // Crr (coefficient of rolling resistance, 8-bit, resolution 0.0001)
    buffer[5] = Math.round(params.crr * 10000) & 0xFF;
    
    // Wind resistance (kg/m, 8-bit, resolution 0.01 kg/m)
    buffer[6] = Math.round(params.windResistance * 100) & 0xFF;
    
    try {
      await device.writeCharacteristicWithResponseForService(
        FTMS_SERVICE,
        FTMS_CONTROL_POINT,
        base64.encode(buffer)
      );
      return true;
    } catch (error) {
      console.error('Failed to set simulation:', error);
      return false;
    }
  }
  
  async setResistanceTarget(resistance: number): Promise<boolean> {
    if (!this.controllableTrainer) return false;
    if (this.currentControlMode !== ControlMode.RESISTANCE) {
      await this.setControlMode(ControlMode.RESISTANCE);
    }
    
    const device = this.controllableTrainer.device;
    
    // Op code 0x04 = Set Target Resistance Level
    // Resistance level (unitless, signed 16-bit, resolution 0.1)
    const buffer = new Uint8Array(3);
    buffer[0] = 0x04; // Op code
    const resistanceValue = Math.round(resistance * 10);
    buffer[1] = resistanceValue & 0xFF;
    buffer[2] = (resistanceValue >> 8) & 0xFF;
    
    try {
      await device.writeCharacteristicWithResponseForService(
        FTMS_SERVICE,
        FTMS_CONTROL_POINT,
        base64.encode(buffer)
      );
      return true;
    } catch (error) {
      console.error('Failed to set resistance target:', error);
      return false;
    }
  }
  
  private async setControlMode(mode: ControlMode) {
    // May need to send a reset command when switching modes
    if (this.currentControlMode && this.currentControlMode !== mode) {
      await this.resetTrainer();
    }
    this.currentControlMode = mode;
  }
  
  private async resetTrainer(): Promise<boolean> {
    if (!this.controllableTrainer) return false;
    
    const device = this.controllableTrainer.device;
    
    // Op code 0x01 = Reset
    const buffer = new Uint8Array([0x01]);
    
    try {
      await device.writeCharacteristicWithResponseForService(
        FTMS_SERVICE,
        FTMS_CONTROL_POINT,
        base64.encode(buffer)
      );
      return true;
    } catch (error) {
      console.error('Failed to reset trainer:', error);
      return false;
    }
  }
  
  getControllableTrainer(): ConnectedSensor | undefined {
    return this.controllableTrainer;
  }
}
```

#### 3. Integrate with PlanManager

Create automatic trainer control based on workout plan:

```typescript
// apps/mobile/lib/services/ActivityRecorder/index.ts

class ActivityRecorderService {
  
  private async applyStepTargets(step: FlattenedStep) {
    if (!step.targets) return;
    
    const trainer = this.sensorsManager.getControllableTrainer();
    if (!trainer) {
      console.log('No controllable trainer, skipping target application');
      return;
    }
    
    // Determine which target to apply based on workout type and target availability
    if (step.targets.power) {
      const powerTarget = this.resolvePowerTarget(step.targets.power);
      if (powerTarget) {
        console.log(`Applying power target: ${powerTarget}W`);
        await this.sensorsManager.setPowerTarget(powerTarget);
      }
    } else if (step.targets.heartRate) {
      // Heart rate control requires ERG mode with power estimation
      // This is advanced - could map HR zones to estimated power based on profile
      console.log('Heart rate target - manual control required');
    }
    
    // Could also handle cadence targets by adjusting gear recommendations
  }
  
  private resolvePowerTarget(target: PowerTarget): number | null {
    if (typeof target === 'number') {
      return target; // Absolute watts
    }
    
    if (target.type === 'ftp') {
      const ftp = this.profile.ftp || 200; // fallback
      return Math.round(ftp * target.value);
    }
    
    if (target.type === 'zone') {
      // Map power zone to FTP percentage
      const zoneMap = {
        1: 0.55, // Recovery
        2: 0.75, // Endurance
        3: 0.90, // Tempo
        4: 1.05, // Threshold
        5: 1.20, // VO2 Max
        6: 1.50, // Anaerobic
      };
      const ftp = this.profile.ftp || 200;
      return Math.round(ftp * (zoneMap[target.value] || 0.75));
    }
    
    return null;
  }
  
  // Hook into plan step changes
  private setupPlanIntegration() {
    this._plan?.on('stepAdvanced', ({ progress }) => {
      const step = this._plan?.getCurrentStep();
      if (step) {
        this.applyStepTargets(step);
      }
    });
    
    this._plan?.on('planStarted', (progress) => {
      const step = this._plan?.getCurrentStep();
      if (step) {
        this.applyStepTargets(step);
      }
    });
  }
}
```

#### 4. UI Enhancements

Update the recording UI to show trainer control status:

```typescript
// apps/mobile/app/(internal)/record/index.tsx

function RecordScreen() {
  const { sensors } = useSensors(service);
  
  const controllableTrainer = useMemo(() => {
    return sensors.find(s => s.isControllable);
  }, [sensors]);
  
  const currentStep = plan.currentStep;
  
  return (
    <View className="flex-1 bg-background">
      {/* Show trainer control indicator */}
      {controllableTrainer && (
        <View className="bg-primary/10 px-4 py-2 border-b border-primary/20">
          <View className="flex-row items-center gap-2">
            <Icon as={Zap} size={16} className="text-primary" />
            <Text className="text-xs text-primary font-medium">
              Trainer Control Active
            </Text>
            {currentStep?.targets?.power && (
              <Text className="text-xs text-primary ml-auto">
                Target: {resolvePowerTarget(currentStep.targets.power)}W
              </Text>
            )}
          </View>
        </View>
      )}
      
      {/* Rest of UI... */}
    </View>
  );
}
```

### Phase 2: Advanced Features

#### 1. Smart Control Mode Selection

Automatically choose the best control mode based on workout type:

```typescript
function determineOptimalControlMode(plan: ActivityPlan): ControlMode {
  const steps = flattenPlanSteps(plan.structure.steps);
  
  // Check if all steps have power targets
  const allPowerTargets = steps.every(step => step.targets?.power);
  if (allPowerTargets) {
    return ControlMode.ERG; // Perfect for power-based workouts
  }
  
  // Check for grade/elevation targets
  const hasGradeTargets = steps.some(step => step.targets?.grade);
  if (hasGradeTargets) {
    return ControlMode.SIM; // Use simulation mode
  }
  
  // Default to ERG if any power targets exist
  const somePowerTargets = steps.some(step => step.targets?.power);
  if (somePowerTargets) {
    return ControlMode.ERG;
  }
  
  // Fallback to resistance mode
  return ControlMode.RESISTANCE;
}
```

#### 2. Trainer Response Monitoring

Monitor the status characteristic to ensure trainer is responding:

```typescript
private async subscribeToTrainerStatus(sensor: ConnectedSensor) {
  const device = sensor.device;
  
  device.monitorCharacteristicForService(
    FTMS_SERVICE,
    FTMS_STATUS,
    (error, characteristic) => {
      if (error) {
        console.error('Status monitoring error:', error);
        return;
      }
      
      if (!characteristic?.value) return;
      
      const data = base64.decode(characteristic.value);
      const opCode = data[0];
      
      // Parse status codes
      const statusMessages = {
        0x01: 'Reset',
        0x02: 'Stopped by user',
        0x03: 'Stopped by safety key',
        0x04: 'Started by user',
        0x07: 'Target resistance changed',
        0x08: 'Target power changed',
        0x12: 'Indoor bike simulation parameters changed',
      };
      
      const message = statusMessages[opCode] || 'Unknown status';
      console.log('Trainer status:', message);
      
      // Could emit events for UI feedback
      this.emit('trainerStatus', { opCode, message });
    }
  );
}
```

#### 3. Workout Recommendations

Suggest control mode in workout creation:

```typescript
// In workout builder UI
function WorkoutBuilderControlModeSelector({ plan }) {
  const recommended = determineOptimalControlMode(plan);
  
  return (
    <View>
      <Text className="text-sm font-medium mb-2">Control Mode</Text>
      <Text className="text-xs text-muted-foreground mb-3">
        Recommended: {recommended.toUpperCase()} 
        {recommended === 'ERG' && ' (Power-based workout)'}
        {recommended === 'SIM' && ' (Grade/terrain simulation)'}
      </Text>
      
      <RadioGroup value={controlMode} onValueChange={setControlMode}>
        <RadioOption value="erg" label="ERG - Power Target" />
        <RadioOption value="sim" label="SIM - Terrain Simulation" />
        <RadioOption value="resistance" label="Resistance Level" />
      </RadioGroup>
    </View>
  );
}
```

#### 4. Fallback Behavior

Handle cases where trainer control fails:

```typescript
async function setPowerTargetWithFallback(power: number): Promise<void> {
  const success = await this.sensorsManager.setPowerTarget(power);
  
  if (!success) {
    // Show notification to user
    this.notificationsManager.showNotification({
      title: 'Trainer Control Unavailable',
      body: `Manually adjust to ${power}W`,
      ios: { sound: 'default' },
    });
    
    // Log for troubleshooting
    console.warn('Trainer control failed, user must adjust manually');
  }
}
```

### Phase 3: Enhanced User Experience

#### 1. Pre-Workout Trainer Test

Before starting a workout, verify trainer control:

```typescript
async function testTrainerControl(trainer: ConnectedSensor): Promise<boolean> {
  console.log('Testing trainer control...');
  
  // 1. Request control
  const controlGranted = await requestTrainerControl(trainer);
  if (!controlGranted) {
    return false;
  }
  
  // 2. Set a low power target
  const testSuccess = await setPowerTarget(100);
  if (!testSuccess) {
    return false;
  }
  
  // 3. Wait briefly
  await wait(2000);
  
  // 4. Reset to neutral
  await resetTrainer();
  
  console.log('Trainer control test successful');
  return true;
}
```

#### 2. Real-Time Target Adjustment

Allow users to adjust targets on the fly:

```typescript
// In enhanced plan card UI
function EnhancedPlanCard({ service }) {
  const [targetAdjustment, setTargetAdjustment] = useState(0); // -20% to +20%
  
  const handleAdjustment = async (delta: number) => {
    const newAdjustment = Math.max(-20, Math.min(20, targetAdjustment + delta));
    setTargetAdjustment(newAdjustment);
    
    const step = service.currentStep;
    if (step?.targets?.power) {
      const basePower = resolvePowerTarget(step.targets.power);
      const adjustedPower = Math.round(basePower * (1 + newAdjustment / 100));
      
      await service.sensorsManager.setPowerTarget(adjustedPower);
    }
  };
  
  return (
    <View>
      {/* Current target display */}
      <Text>Target: {currentPower}W</Text>
      
      {/* Adjustment controls */}
      <View className="flex-row gap-2">
        <Button onPress={() => handleAdjustment(-5)}>-5%</Button>
        <Button onPress={() => handleAdjustment(5)}>+5%</Button>
      </View>
      
      {targetAdjustment !== 0 && (
        <Text className="text-xs text-muted-foreground">
          Adjusted: {targetAdjustment > 0 ? '+' : ''}{targetAdjustment}%
        </Text>
      )}
    </View>
  );
}
```

#### 3. Multi-Device Support

Handle both power meter and controllable trainer:

```typescript
class SensorsManager {
  private powerMeter?: ConnectedSensor;
  private controllableTrainer?: ConnectedSensor;
  
  async connectSensor(deviceId: string) {
    // Existing connection logic...
    
    // Classify device type
    if (hasCyclingPower && !hasControlCapability) {
      this.powerMeter = connectedSensor;
      console.log('Connected power meter');
    }
    
    if (hasFTMS || hasFEC || hasWCPS) {
      this.controllableTrainer = connectedSensor;
      console.log('Connected controllable trainer');
    }
  }
  
  // Use power meter for more accurate readings if available
  private selectPowerSource(): ConnectedSensor | undefined {
    return this.powerMeter || this.controllableTrainer;
  }
}
```

## Integration Patterns from Auuki

### Pattern 1: Characteristic Blocking

Auuki uses a blocking mechanism to prevent multiple simultaneous writes:

```javascript
// From Auuki's characteristic.js
async function write(data) {
  if (isBlocked) {
    console.warn('Characteristic blocked, queuing write');
    return false;
  }
  
  this.block();
  await characteristic.writeValue(data);
  // Unblock happens when response is received
}
```

**Mobile Implementation:**
```typescript
class CharacteristicWriter {
  private isBlocked = false;
  private pendingWrites: Array<() => Promise<void>> = [];
  
  async write(deviceId: string, serviceUUID: string, charUUID: string, data: Uint8Array) {
    if (this.isBlocked) {
      // Queue or reject based on strategy
      console.warn('Control point blocked, write rejected');
      return false;
    }
    
    this.isBlocked = true;
    
    try {
      await device.writeCharacteristicWithResponseForService(
        serviceUUID,
        charUUID,
        base64.encode(data)
      );
      return true;
    } finally {
      // Unblock after response or timeout
      setTimeout(() => {
        this.isBlocked = false;
      }, 1000);
    }
  }
}
```

### Pattern 2: Protocol Negotiation

Auuki always requests control before sending commands:

```javascript
// From Auuki's ftms.js
async function protocol() {
  const control = service.characteristics.control;
  if (exists(control)) {
    const res = await control.write(
      controlParser.requestControl.encode()
    );
    return res;
  }
  return false;
}
```

**Mobile Implementation:**
```typescript
private async negotiateTrainerControl(sensor: ConnectedSensor): Promise<boolean> {
  console.log('Negotiating trainer control...');
  
  // 1. Request control (op code 0x00)
  const requestSuccess = await this.requestTrainerControl(sensor);
  if (!requestSuccess) {
    console.error('Failed to request control');
    return false;
  }
  
  // 2. Wait for confirmation via status or control point response
  await wait(500);
  
  // 3. Optionally reset trainer to clear any previous state
  await this.resetTrainer();
  
  console.log('Trainer control negotiated successfully');
  return true;
}
```

### Pattern 3: Multi-Protocol Support

Auuki supports multiple trainer control protocols in a unified interface:

```javascript
// From Auuki's connectable.js
if (hasFTMS) {
  services['trainer'] = FTMS({ service: getService(uuids.fitnessMachine), onData });
  return await services.trainer.setup();
}

if (hasFEC) {
  services['trainer'] = FEC({ service: getService(uuids.fec), onData });
  return await services.trainer.setup();
}

if (hasWCPS) {
  services['trainer'] = WCPS({ service: getService(uuids.cyclingPower), onData });
  return await services.trainer.setup();
}
```

**Mobile Implementation:**
```typescript
enum TrainerProtocol {
  FTMS = 'ftms',
  FEC = 'fec',
  WCPS = 'wcps',
}

interface TrainerControlInterface {
  protocol: TrainerProtocol;
  setPowerTarget(power: number): Promise<boolean>;
  setResistanceTarget(resistance: number): Promise<boolean>;
  setSimulation(params: SimulationParams): Promise<boolean>;
  reset(): Promise<boolean>;
}

class TrainerController implements TrainerControlInterface {
  protocol: TrainerProtocol;
  private sensor: ConnectedSensor;
  
  constructor(sensor: ConnectedSensor, protocol: TrainerProtocol) {
    this.sensor = sensor;
    this.protocol = protocol;
  }
  
  async setPowerTarget(power: number): Promise<boolean> {
    switch (this.protocol) {
      case TrainerProtocol.FTMS:
        return this.ftmsSetPowerTarget(power);
      case TrainerProtocol.FEC:
        return this.fecSetPowerTarget(power);
      case TrainerProtocol.WCPS:
        return this.wcpsSetPowerTarget(power);
    }
  }
  
  // Protocol-specific implementations...
}
```

### Pattern 4: Reactive Control Updates

Auuki uses an event-driven architecture for control updates:

```javascript
// From Auuki's reactive-connectable.js
xf.sub('ui:power-target-set', onPowerTarget);
xf.sub('ui:slope-target-set', onSlopeTarget);
xf.sub('ui:resistance-target-set', onResistanceTarget);

function onPowerTarget(powerTarget) {
  if (!connectable.isConnected() || !equals(mode, ControlMode.erg)) return;
  connectable.services.trainer.setPowerTarget({ power: powerTarget });
}
```

**Mobile Implementation:**
```typescript
class ActivityRecorderService {
  private setupTrainerControlIntegration() {
    // Subscribe to plan step changes
    this._plan?.on('stepAdvanced', async ({ progress }) => {
      const step = this._plan?.getCurrentStep();
      if (step) {
        await this.updateTrainerTarget(step);
      }
    });
    
    // Subscribe to manual target adjustments
    this.on('manualTargetAdjustment', async ({ type, value }) => {
      switch (type) {
        case 'power':
          await this.sensorsManager.setPowerTarget(value);
          break;
        case 'resistance':
          await this.sensorsManager.setResistanceTarget(value);
          break;
        case 'grade':
          await this.sensorsManager.setSimulation({ grade: value, crr: 0.005, windResistance: 0.51, windSpeed: 0 });
          break;
      }
    });
  }
  
  private async updateTrainerTarget(step: FlattenedStep) {
    if (!step.targets) return;
    
    const trainer = this.sensorsManager.getControllableTrainer();
    if (!trainer) return;
    
    // Apply appropriate target based on control mode and step targets
    if (step.targets.power) {
      const power = this.resolvePowerTarget(step.targets.power);
      if (power) {
        await this.sensorsManager.setPowerTarget(power);
        this.emit('trainerTargetApplied', { type: 'power', value: power });
      }
    }
  }
}
```

## Comparison: Mobile vs. Auuki Recording Process

### Feature Matrix

| Feature | Mobile App | Auuki Web App | Implementation Effort |
|---------|-----------|---------------|---------------------|
| **BLE Infrastructure** | ✅ react-native-ble-plx | ✅ Web Bluetooth API | N/A (already present) |
| **Sensor Discovery** | ✅ Full support | ✅ Full support | N/A |
| **Passive Data Reading** | ✅ HR, Power, Cadence | ✅ HR, Power, Cadence | N/A |
| **Workout Plans** | ✅ Full structure | ✅ Intervals & steps | N/A |
| **Step Progression** | ✅ Auto & manual | ✅ Auto only | N/A |
| **FTMS Control Point** | ❌ Not implemented | ✅ Full implementation | **High Priority** |
| **ERG Mode** | ❌ Not implemented | ✅ Full support | **High Priority** |
| **SIM Mode** | ❌ Not implemented | ✅ Full support | **Medium Priority** |
| **Resistance Mode** | ❌ Not implemented | ✅ Full support | **Low Priority** |
| **Multi-Protocol** | ❌ Not implemented | ✅ FTMS, FEC, WCPS | **Future** |
| **Auto Target Application** | ❌ Not implemented | ✅ Reactive system | **High Priority** |
| **Status Monitoring** | ❌ Not implemented | ✅ Full support | **Medium Priority** |
| **Control Mode Switching** | ❌ Not implemented | ✅ Full support | **Medium Priority** |

### User Experience Comparison

#### Starting a Structured Workout

**Mobile (Current):**
1. Select workout plan (e.g., "Sweet Spot Intervals")
2. Navigate to record screen
3. Connect heart rate monitor
4. Connect power meter (if separate from trainer)
5. Start recording
6. **Manually adjust trainer** to match first interval target (250W)
7. Begin pedaling
8. Watch timer count down
9. **Manually adjust trainer** for next interval (150W recovery)
10. Repeat steps 8-9 for each interval

**Mobile (With FTMS):**
1. Select workout plan (e.g., "Sweet Spot Intervals")
2. Navigate to record screen
3. Connect smart trainer (single device for power + control)
4. Start recording → **Trainer automatically sets 250W**
5. Begin pedaling
6. Watch timer count down → **Trainer automatically adjusts to 150W**
7. Just pedal and focus on form

**Auuki (Current):**
1. Load workout from library
2. Connect controllable trainer
3. Start workout → **Trainer automatically sets target**
4. Pedal through intervals → **Automatic adjustments**
5. Save activity

### Key Advantages of Adding FTMS to Mobile

1. **Seamless Experience**: One-device connection, automatic control
2. **Precision**: Exact power targets maintained by trainer
3. **Focus**: User focuses on effort, not fiddling with buttons
4. **Professional**: Matches experience of TrainerRoad, Zwift, etc.
5. **Retention**: Users less likely to need multiple apps

## Implementation Roadmap

### Phase 1: MVP FTMS Support (4-6 weeks)

**Goal:** Basic ERG mode control for power-based workouts

#### Week 1-2: Core Infrastructure
- [ ] Add FTMS service and characteristic UUIDs
- [ ] Extend `ConnectedSensor` interface with controllable properties
- [ ] Implement FTMS feature reading
- [ ] Implement request control command
- [ ] Implement reset command

#### Week 3-4: ERG Mode Implementation
- [ ] Implement `setPowerTarget()` method
- [ ] Add control point write functionality
- [ ] Implement response monitoring
- [ ] Add characteristic blocking mechanism
- [ ] Test with popular trainers (Wahoo, Tacx)

#### Week 5-6: Plan Integration & Testing
- [ ] Integrate `setPowerTarget()` with PlanManager
- [ ] Automatic target application on step changes
- [ ] UI indicators for trainer control status
- [ ] Error handling and fallback behavior
- [ ] Beta testing with real users

**Success Criteria:**
- User can connect FTMS trainer
- Power targets automatically apply during workout
- Smooth step transitions
- Stable connection throughout 60+ minute workouts

### Phase 2: Enhanced Control (2-3 weeks)

**Goal:** Add SIM mode and improve user experience

#### Week 7-8: SIM Mode
- [ ] Implement `setSimulation()` method
- [ ] Add grade/slope target support in plans
- [ ] Course integration (apply grade based on route)
- [ ] Control mode selection UI

#### Week 9: Polish
- [ ] Status characteristic monitoring
- [ ] Pre-workout trainer test
- [ ] Manual target adjustment controls
- [ ] Improved error messages and recovery

**Success Criteria:**
- Support both ERG and SIM modes
- Smart control mode selection
- Reliable mode switching
- Clear user feedback

### Phase 3: Advanced Features (3-4 weeks)

**Goal:** Multi-protocol support and advanced controls

#### Week 10-11: Multi-Protocol
- [ ] Research FEC over BLE protocol
- [ ] Research Wahoo WCPS protocol
- [ ] Abstract trainer control interface
- [ ] Protocol detection and selection
- [ ] Testing with various trainer brands

#### Week 12-13: Advanced Controls
- [ ] Resistance mode implementation
- [ ] Real-time target adjustment (+/- controls)
- [ ] Multi-device support (power meter + trainer)
- [ ] Advanced retry and recovery logic
- [ ] Connection quality indicators

**Success Criteria:**
- Support 95%+ of smart trainers on market
- Graceful handling of edge cases
- Professional-grade reliability
- Feature parity with leading apps

## Technical Challenges & Solutions

### Challenge 1: Platform Differences

**Issue:** FTMS implementation differs between iOS and Android

**Solution:**
- Use `react-native-ble-plx` abstraction layer (already in place)
- Test on both platforms extensively
- Document platform-specific quirks
- Implement platform-specific workarounds if needed

```typescript
const platformSpecificFTMSHandling = {
  ios: {
    // iOS may need explicit service discovery
    requiresServiceDiscovery: true,
    writeTimeout: 5000,
  },
  android: {
    // Android may have different connection timing
    requiresServiceDiscovery: false,
    writeTimeout: 3000,
  }
};
```

### Challenge 2: Trainer Compatibility

**Issue:** Not all trainers implement FTMS correctly

**Solution:**
- Maintain compatibility database
- Implement trainer-specific workarounds
- Fallback to manual control gracefully
- Clear error messages for unsupported devices

```typescript
const trainerQuirks = {
  'Wahoo KICKR': {
    needsResetBetweenModes: true,
    maxPowerTarget: 2500,
  },
  'Tacx Neo': {
    needsResetBetweenModes: false,
    preferredProtocol: 'FTMS',
  },
  'Elite Direto': {
    needsResetBetweenModes: true,
    ftmsDelayMs: 1000,
  },
};
```

### Challenge 3: Connection Reliability

**Issue:** BLE connections can be unstable, especially during writes

**Solution:**
- Implement retry logic with exponential backoff
- Queue writes to prevent command collision
- Monitor connection state continuously
- Auto-reconnect on disconnection

```typescript
async function writeWithRetry(
  device: Device,
  serviceUUID: string,
  characteristicUUID: string,
  data: Uint8Array,
  maxRetries = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await device.writeCharacteristicWithResponseForService(
        serviceUUID,
        characteristicUUID,
        base64.encode(data)
      );
      return true;
    } catch (error) {
      console.warn(`Write attempt ${attempt + 1} failed:`, error);
      
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
        await wait(delay);
      }
    }
  }
  
  return false;
}
```

### Challenge 4: Real-Time Performance

**Issue:** Control commands must be sent quickly during step transitions

**Solution:**
- Pre-calculate targets before step change
- Use async/await properly to avoid blocking
- Minimize UI updates during control operations
- Profile and optimize critical paths

```typescript
class OptimizedPlanExecutor {
  private nextStepTarget?: number;
  
  async prepareNextStep(stepIndex: number) {
    // Pre-calculate target for next step
    const nextStep = this.steps[stepIndex + 1];
    if (nextStep?.targets?.power) {
      this.nextStepTarget = this.resolvePowerTarget(nextStep.targets.power);
    }
  }
  
  async advanceStep() {
    // Use pre-calculated target for instant application
    if (this.nextStepTarget !== undefined) {
      await this.sensorsManager.setPowerTarget(this.nextStepTarget);
    }
    
    // Prepare next target in background
    this.prepareNextStep(this.currentStepIndex);
  }
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('SensorsManager FTMS Control', () => {
  it('should encode power target correctly', () => {
    const buffer = encodePowerTarget(250);
    expect(buffer[0]).toBe(0x05); // Op code
    expect(buffer[1]).toBe(250 & 0xFF);
    expect(buffer[2]).toBe((250 >> 8) & 0xFF);
  });
  
  it('should encode simulation parameters correctly', () => {
    const buffer = encodeSimulation({
      windSpeed: 0,
      grade: 5.5,
      crr: 0.005,
      windResistance: 0.51,
    });
    expect(buffer[0]).toBe(0x11);
    // Validate encoding...
  });
  
  it('should handle control point responses', async () => {
    const response = new Uint8Array([0x80, 0x05, 0x01]); // Success response
    const result = parseControlPointResponse(response);
    expect(result.success).toBe(true);
    expect(result.requestOpCode).toBe(0x05);
  });
});
```

### Integration Tests

```typescript
describe('Workout Execution with FTMS', () => {
  it('should apply power targets automatically on step change', async () => {
    const service = new ActivityRecorderService(profile);
    const mockTrainer = createMockFTMSTrainer();
    
    service.sensorsManager.connectSensor(mockTrainer.id);
    service.selectPlan(mockWorkoutPlan);
    
    await service.startRecording();
    
    // Verify first step target applied
    expect(mockTrainer.lastPowerTarget).toBe(200);
    
    // Advance to next step
    await service.advanceStep();
    
    // Verify new target applied
    expect(mockTrainer.lastPowerTarget).toBe(300);
  });
});
```

### Device Testing

Required test devices:
- [ ] Wahoo KICKR (FTMS)
- [ ] Tacx Neo (FTMS)
- [ ] Elite Direto (FTMS)
- [ ] Saris H3 (FTMS)
- [ ] Budget trainer with FTMS

Test scenarios:
- [ ] 60-minute ERG workout
- [ ] 90-minute SIM workout with varying grade
- [ ] Connection loss and recovery
- [ ] Mode switching mid-workout
- [ ] Multiple sensors (HRM + trainer)
- [ ] Background app transitions
- [ ] Phone calls during workout

## User Documentation

### Help Article: "Using Smart Trainer Control"

**What You'll Need:**
- A FTMS-compatible smart trainer (Wahoo KICKR, Tacx Neo, etc.)
- A structured workout plan with power targets
- Bluetooth enabled on your phone

**Setup:**
1. Turn on your smart trainer
2. In GradientPeak, go to Record screen
3. Tap the Bluetooth icon
4. Select your trainer from the list
5. Wait for "Trainer Control Active" indicator

**During Your Workout:**
- Your trainer will automatically adjust to match workout targets
- Focus on maintaining your cadence and form
- The app handles all resistance changes

**Troubleshooting:**
- **"Trainer Control Unavailable"**: Disconnect and reconnect trainer
- **Erratic resistance**: Ensure no other apps are connected to trainer
- **Connection lost**: Check battery level, move phone closer to trainer

### UI Copy

**Sensor Connection Screen:**
```
Smart Trainer Detected
This trainer supports automatic control. 
Your resistance will adjust automatically during workouts.
```

**Recording Screen:**
```
🔌 Trainer Control Active
Target: 250W | Actual: 248W
```

**Workout Builder:**
```
💡 Pro Tip
This workout will work best in ERG mode. 
Your smart trainer will maintain power targets automatically.
```

## Business Impact

### User Benefits

1. **Reduced Friction**: No need for multiple apps or manual adjustments
2. **Better Workouts**: Precise target adherence improves training quality
3. **Professional Experience**: Matches or exceeds competitor apps
4. **Increased Engagement**: Seamless experience encourages regular use

### Competitive Positioning

**Current State:**
- GradientPeak has great features but requires manual trainer control
- Users need TrainerRoad/Zwift for structured indoor workouts
- Split user attention between multiple apps

**With FTMS:**
- GradientPeak becomes complete indoor training solution
- Retain users who might otherwise churn to competitors
- Attract users from other platforms seeking unified experience
- Differentiate with outdoor/indoor unified platform

### Retention Impact

**Expected Improvements:**
- 30-40% increase in indoor workout completion rate
- 20-25% reduction in churn during winter months
- Higher subscription value (users get more from the platform)
- Positive reviews mentioning "works just like TrainerRoad"

### Development ROI

**Investment:**
- 9-13 weeks development time
- Testing infrastructure and devices (~$3000)
- Ongoing maintenance (~5% dev time)

**Return:**
- Essential for indoor training market
- Table stakes feature for serious cyclists
- Unlocks enterprise/coaching opportunities
- Positive reviews drive organic growth

## Recommendations

### Priority 1: Implement Phase 1 (MVP FTMS)

**Rationale:**
- Core feature gap that limits product-market fit
- Relatively straightforward implementation
- High impact on user satisfaction
- Foundation for future enhancements

**Action Items:**
1. Allocate 1 senior mobile developer for 6 weeks
2. Acquire test devices (3-4 popular trainers)
3. Beta test with 20-30 active indoor riders
4. Launch with clear documentation

### Priority 2: Iterate Based on Feedback

**Rationale:**
- Real-world usage will reveal edge cases
- Trainer compatibility issues need real-world testing
- User preferences may differ from assumptions

**Action Items:**
1. Set up telemetry for FTMS feature usage
2. Monitor error rates and connection issues
3. Collect user feedback actively
4. Rapid iteration on Phase 2 based on learnings

### Priority 3: Expand Protocol Support

**Rationale:**
- FTMS covers 80%+ of trainers
- Remaining protocols needed for complete coverage
- Can be added incrementally

**Action Items:**
1. Survey users about trainer brands
2. Prioritize FEC or WCPS based on demand
3. Partner with trainer manufacturers for testing
4. Document protocol implementations for community

## Conclusion

FTMS integration represents a critical enhancement to GradientPeak's recording process. The mobile app already has strong foundational infrastructure—BLE connectivity, workout plans, sensor management, and step progression. What's missing is the control layer that transforms the app from a passive recorder to an active training partner.

The Auuki web app provides an excellent reference implementation, demonstrating that FTMS control is:
1. **Technically feasible** with existing architecture
2. **Highly valuable** for indoor training experience
3. **Well-understood** through prior implementation

By following the phased roadmap outlined in this document, GradientPeak can close the Bluetooth control gap and deliver a world-class indoor training experience. The MVP (Phase 1) provides immediate value with ERG mode support for power-based workouts, while subsequent phases add sophistication and coverage.

**The opportunity is clear:** Transform GradientPeak from "another cycling app" to "the complete training platform" by enabling the seamless, automatic trainer control that serious indoor cyclists expect and demand.

**Next Steps:**
1. Review and approve this technical specification
2. Allocate development resources for Phase 1
3. Order test equipment
4. Begin implementation
5. Beta test with target users
6. Launch and iterate