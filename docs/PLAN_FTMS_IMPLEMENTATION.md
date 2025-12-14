# FTMS Implementation Plan

**Priority**: CRITICAL  
**Estimated Effort**: 4-6 weeks MVP  
**Impact**: Transforms GradientPeak from passive recording to active training partner

---

## Overview

Implement Fitness Machine Service (FTMS) control to enable GradientPeak to control smart trainers during workouts. This closes the critical gap between passive recording and active workout execution.

**Reference**: See BLUETOOTH_CONTROL_GAP.md and FTMS_RECORDING_ENHANCEMENTS.md for detailed implementation guides.

---

## Goals

1. **Control smart trainers** via FTMS protocol (ERG mode, SIM mode, resistance mode)
2. **Automatic target application** from workout plans
3. **Real-time target adjustments** during intervals
4. **Status monitoring** for trainer capabilities and current state
5. **Error handling** for connection issues and control failures

---

## Technical Foundation

### FTMS Protocol Specifications

**Service UUID**: `00001826-0000-1000-8000-00805f9b34fb`

**Key Characteristics**:

1. **Indoor Bike Data** (`0x2AD2`) - Already monitored passively
   - Read/Notify: Power, cadence, speed, distance
   - Currently parsed by SensorsManager
   - No changes needed

2. **Fitness Machine Control Point** (`0x2AD9`) - NEW: Write/Indicate
   - Write commands to control trainer
   - Receive response codes
   - Requires implementation

3. **Fitness Machine Status** (`0x2ADA`) - NEW: Notify
   - Device state changes
   - Safety events
   - Target confirmations

4. **Fitness Machine Feature** (`0x2ACC`) - NEW: Read
   - Capability detection
   - Supported control modes
   - Power/resistance ranges

**Control Op Codes** (for Control Point characteristic):
```typescript
const FTMS_OPCODES = {
  REQUEST_CONTROL: 0x00,
  RESET: 0x01,
  SET_TARGET_SPEED: 0x02,
  SET_TARGET_INCLINATION: 0x03,
  SET_TARGET_RESISTANCE: 0x04,
  SET_TARGET_POWER: 0x05,
  SET_TARGET_HEART_RATE: 0x06,
  START_RESUME: 0x07,
  STOP_PAUSE: 0x08,
  SET_INDOOR_BIKE_SIMULATION: 0x11,
  RESPONSE_CODE: 0x80,
};

const FTMS_RESULT_CODES = {
  SUCCESS: 0x01,
  NOT_SUPPORTED: 0x02,
  INVALID_PARAMETER: 0x03,
  OPERATION_FAILED: 0x04,
  CONTROL_NOT_PERMITTED: 0x05,
};
```

---

## Implementation Details

### Phase 1: Core FTMS Infrastructure

#### 1.1 Constants & UUIDs

**File**: `packages/core/constants.ts`  
**Lines**: Add after existing BLE_SERVICE_UUIDS (currently around line 10-15)

**Current code**:
```typescript
export const BLE_SERVICE_UUIDS = {
  HEART_RATE: "0000180d-0000-1000-8000-00805f9b34fb",
  CYCLING_POWER: "00001818-0000-1000-8000-00805f9b34fb",
  CYCLING_SPEED_AND_CADENCE: "00001816-0000-1000-8000-00805f9b34fb",
  RUNNING_SPEED_AND_CADENCE: "00001814-0000-1000-8000-00805f9b34fb",
}
```

**Add after existing UUIDs**:
```typescript
export const BLE_SERVICE_UUIDS = {
  HEART_RATE: "0000180d-0000-1000-8000-00805f9b34fb",
  CYCLING_POWER: "00001818-0000-1000-8000-00805f9b34fb",
  CYCLING_SPEED_AND_CADENCE: "00001816-0000-1000-8000-00805f9b34fb",
  RUNNING_SPEED_AND_CADENCE: "00001814-0000-1000-8000-00805f9b34fb",
  FITNESS_MACHINE: "00001826-0000-1000-8000-00805f9b34fb", // NEW
}

// NEW: FTMS Characteristics
export const FTMS_CHARACTERISTICS = {
  INDOOR_BIKE_DATA: "00002ad2-0000-1000-8000-00805f9b34fb",
  CONTROL_POINT: "00002ad9-0000-1000-8000-00805f9b34fb",
  STATUS: "00002ada-0000-1000-8000-00805f9b34fb",
  FEATURE: "00002acc-0000-1000-8000-00805f9b34fb",
  TRAINING_STATUS: "00002ad3-0000-1000-8000-00805f9b34fb",
}

// NEW: FTMS Control Op Codes
export const FTMS_OPCODES = {
  REQUEST_CONTROL: 0x00,
  RESET: 0x01,
  SET_TARGET_SPEED: 0x02,
  SET_TARGET_INCLINATION: 0x03,
  SET_TARGET_RESISTANCE: 0x04,
  SET_TARGET_POWER: 0x05,
  SET_TARGET_HEART_RATE: 0x06,
  START_RESUME: 0x07,
  STOP_PAUSE: 0x08,
  SET_INDOOR_BIKE_SIMULATION: 0x11,
  RESPONSE_CODE: 0x80,
}

// NEW: FTMS Result Codes
export const FTMS_RESULT_CODES = {
  SUCCESS: 0x01,
  NOT_SUPPORTED: 0x02,
  INVALID_PARAMETER: 0x03,
  OPERATION_FAILED: 0x04,
  CONTROL_NOT_PERMITTED: 0x05,
}
```

**Rationale**: Centralizes FTMS protocol constants for use across the codebase.

---

#### 1.2 FTMS Controller Class (NEW FILE)

**File**: `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts` (CREATE NEW)

**Purpose**: Encapsulates all FTMS protocol encoding/decoding logic

**Full implementation**:
```typescript
import { Device } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { FTMS_CHARACTERISTICS, FTMS_OPCODES, FTMS_RESULT_CODES, BLE_SERVICE_UUIDS } from '@repo/core';

export enum ControlMode {
  ERG = 'erg',
  SIM = 'sim',
  RESISTANCE = 'resistance',
}

export interface FTMSFeatures {
  supportsERG: boolean;
  supportsSIM: boolean;
  supportsResistance: boolean;
  maxPower?: number;
  minPower?: number;
}

export interface FTMSControlEvent {
  timestamp: number;
  controlType: 'power_target' | 'simulation' | 'resistance';
  targetValue: number;
  actualValue?: number;
  success: boolean;
  errorMessage?: string;
}

export interface SimulationParams {
  windSpeed: number; // m/s
  grade: number; // percentage (-100 to 100)
  crr: number; // coefficient of rolling resistance (0.0001 to 0.01)
  windResistance: number; // kg/m (0.01 to 2.55)
}

export class FTMSController {
  private device: Device;
  private isBlocked = false;
  private currentControlMode?: ControlMode;
  private features?: FTMSFeatures;
  public controlEvents: FTMSControlEvent[] = [];

  constructor(device: Device) {
    this.device = device;
  }

  // ==================== Setup & Feature Detection ====================

  /**
   * Read FTMS features to determine trainer capabilities
   * Must be called after connection before sending control commands
   */
  async readFeatures(): Promise<FTMSFeatures> {
    try {
      const characteristic = await this.device.readCharacteristicForService(
        BLE_SERVICE_UUIDS.FITNESS_MACHINE,
        FTMS_CHARACTERISTICS.FEATURE
      );

      if (!characteristic.value) {
        throw new Error('Failed to read FTMS features');
      }

      const buffer = Buffer.from(characteristic.value, 'base64');
      const view = new DataView(buffer.buffer);

      // Parse features from bytes 0-7 (64-bit flags)
      const featuresLow = view.getUint32(0, true);
      const featuresHigh = view.getUint32(4, true);

      this.features = {
        supportsERG: !!(featuresLow & 0x00004000), // Bit 14: Power Target Setting
        supportsSIM: !!(featuresLow & 0x00800000), // Bit 23: Indoor Bike Simulation Parameters
        supportsResistance: !!(featuresLow & 0x00002000), // Bit 13: Resistance Target Setting
      };

      console.log('[FTMS] Features:', this.features);
      return this.features;
    } catch (error) {
      console.error('[FTMS] Failed to read features:', error);
      throw error;
    }
  }

  /**
   * Request control of the trainer
   * Must be called before sending any control commands
   */
  async requestControl(): Promise<boolean> {
    const buffer = new Uint8Array([FTMS_OPCODES.REQUEST_CONTROL]);
    
    try {
      const success = await this.writeControlPoint(buffer);
      if (success) {
        console.log('[FTMS] Control granted');
      }
      return success;
    } catch (error) {
      console.error('[FTMS] Failed to request control:', error);
      return false;
    }
  }

  /**
   * Reset trainer to neutral state
   * Recommended when switching control modes
   */
  async reset(): Promise<boolean> {
    const buffer = new Uint8Array([FTMS_OPCODES.RESET]);
    
    try {
      const success = await this.writeControlPoint(buffer);
      if (success) {
        console.log('[FTMS] Trainer reset');
        this.currentControlMode = undefined;
      }
      return success;
    } catch (error) {
      console.error('[FTMS] Failed to reset:', error);
      return false;
    }
  }

  // ==================== ERG Mode (Power Target) ====================

  /**
   * Set target power in ERG mode
   * Trainer will automatically adjust resistance to maintain this power
   * 
   * @param watts - Target power (0-4000W)
   */
  async setPowerTarget(watts: number): Promise<boolean> {
    if (!this.features?.supportsERG) {
      console.warn('[FTMS] Trainer does not support ERG mode');
      return false;
    }

    // Validate power range
    const targetPower = Math.max(0, Math.min(watts, 4000));
    
    // Op code 0x05 = Set Target Power
    // Power in watts (signed 16-bit, resolution 1W)
    const buffer = new Uint8Array(3);
    buffer[0] = FTMS_OPCODES.SET_TARGET_POWER;
    buffer[1] = targetPower & 0xFF; // Low byte
    buffer[2] = (targetPower >> 8) & 0xFF; // High byte

    try {
      // Switch to ERG mode if needed
      if (this.currentControlMode !== ControlMode.ERG) {
        await this.reset();
        this.currentControlMode = ControlMode.ERG;
      }

      const success = await this.writeControlPoint(buffer);
      
      // Log control event
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: 'power_target',
        targetValue: targetPower,
        success,
      });

      if (success) {
        console.log(`[FTMS] Set power target: ${targetPower}W`);
      }

      return success;
    } catch (error) {
      console.error('[FTMS] Failed to set power target:', error);
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: 'power_target',
        targetValue: targetPower,
        success: false,
        errorMessage: String(error),
      });
      return false;
    }
  }

  // ==================== SIM Mode (Terrain Simulation) ====================

  /**
   * Set indoor bike simulation parameters
   * Trainer will simulate real-world conditions
   * 
   * @param params - Simulation parameters
   */
  async setSimulation(params: SimulationParams): Promise<boolean> {
    if (!this.features?.supportsSIM) {
      console.warn('[FTMS] Trainer does not support SIM mode');
      return false;
    }

    // Op code 0x11 = Set Indoor Bike Simulation Parameters
    const buffer = new Uint8Array(7);
    buffer[0] = FTMS_OPCODES.SET_INDOOR_BIKE_SIMULATION;

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
      // Switch to SIM mode if needed
      if (this.currentControlMode !== ControlMode.SIM) {
        await this.reset();
        this.currentControlMode = ControlMode.SIM;
      }

      const success = await this.writeControlPoint(buffer);
      
      // Log control event (using grade as primary value)
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: 'simulation',
        targetValue: params.grade,
        success,
      });

      if (success) {
        console.log(`[FTMS] Set simulation: ${params.grade}% grade`);
      }

      return success;
    } catch (error) {
      console.error('[FTMS] Failed to set simulation:', error);
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: 'simulation',
        targetValue: params.grade,
        success: false,
        errorMessage: String(error),
      });
      return false;
    }
  }

  // ==================== Resistance Mode ====================

  /**
   * Set target resistance level
   * User's power output will vary with cadence
   * 
   * @param level - Resistance level (0-100, unitless)
   */
  async setResistanceTarget(level: number): Promise<boolean> {
    if (!this.features?.supportsResistance) {
      console.warn('[FTMS] Trainer does not support resistance mode');
      return false;
    }

    // Validate resistance range
    const targetResistance = Math.max(0, Math.min(level, 100));

    // Op code 0x04 = Set Target Resistance Level
    // Resistance level (unitless, signed 16-bit, resolution 0.1)
    const buffer = new Uint8Array(3);
    buffer[0] = FTMS_OPCODES.SET_TARGET_RESISTANCE;
    const resistanceValue = Math.round(targetResistance * 10);
    buffer[1] = resistanceValue & 0xFF;
    buffer[2] = (resistanceValue >> 8) & 0xFF;

    try {
      // Switch to resistance mode if needed
      if (this.currentControlMode !== ControlMode.RESISTANCE) {
        await this.reset();
        this.currentControlMode = ControlMode.RESISTANCE;
      }

      const success = await this.writeControlPoint(buffer);
      
      // Log control event
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: 'resistance',
        targetValue: targetResistance,
        success,
      });

      if (success) {
        console.log(`[FTMS] Set resistance: ${targetResistance}%`);
      }

      return success;
    } catch (error) {
      console.error('[FTMS] Failed to set resistance:', error);
      this.controlEvents.push({
        timestamp: Date.now(),
        controlType: 'resistance',
        targetValue: targetResistance,
        success: false,
        errorMessage: String(error),
      });
      return false;
    }
  }

  // ==================== Control Point Write ====================

  /**
   * Write to FTMS Control Point characteristic with blocking
   * Prevents multiple simultaneous writes
   */
  private async writeControlPoint(buffer: Uint8Array, retries = 3): Promise<boolean> {
    // Check if control point is blocked
    if (this.isBlocked) {
      console.warn('[FTMS] Control point blocked, rejecting write');
      return false;
    }

    // Block control point
    this.isBlocked = true;

    try {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          await this.device.writeCharacteristicWithResponseForService(
            BLE_SERVICE_UUIDS.FITNESS_MACHINE,
            FTMS_CHARACTERISTICS.CONTROL_POINT,
            Buffer.from(buffer).toString('base64')
          );

          // Unblock after successful write
          setTimeout(() => {
            this.isBlocked = false;
          }, 500); // 500ms delay before accepting next command

          return true;
        } catch (error) {
          console.warn(`[FTMS] Write attempt ${attempt + 1} failed:`, error);
          
          if (attempt < retries - 1) {
            // Exponential backoff: 500ms, 1s, 2s
            const delay = Math.pow(2, attempt) * 500;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      return false;
    } finally {
      // Ensure control point is unblocked even on error
      setTimeout(() => {
        this.isBlocked = false;
      }, 1000);
    }
  }

  // ==================== Status Monitoring ====================

  /**
   * Subscribe to FTMS status characteristic
   * Monitors trainer state changes and responses
   */
  async subscribeStatus(callback: (status: string) => void): Promise<void> {
    try {
      this.device.monitorCharacteristicForService(
        BLE_SERVICE_UUIDS.FITNESS_MACHINE,
        FTMS_CHARACTERISTICS.STATUS,
        (error, characteristic) => {
          if (error) {
            console.error('[FTMS] Status monitoring error:', error);
            return;
          }

          if (!characteristic?.value) return;

          const buffer = Buffer.from(characteristic.value, 'base64');
          const opCode = buffer[0];

          const statusMessages: Record<number, string> = {
            0x01: 'Reset',
            0x02: 'Stopped by user',
            0x03: 'Stopped by safety key',
            0x04: 'Started by user',
            0x07: 'Target resistance changed',
            0x08: 'Target power changed',
            0x12: 'Indoor bike simulation parameters changed',
          };

          const message = statusMessages[opCode] || `Unknown status (0x${opCode.toString(16)})`;
          console.log('[FTMS] Status:', message);
          callback(message);
        }
      );
    } catch (error) {
      console.error('[FTMS] Failed to subscribe to status:', error);
    }
  }

  // ==================== Getters ====================

  getFeatures(): FTMSFeatures | undefined {
    return this.features;
  }

  getCurrentMode(): ControlMode | undefined {
    return this.currentControlMode;
  }

  getControlEvents(): FTMSControlEvent[] {
    return this.controlEvents;
  }

  clearControlEvents(): void {
    this.controlEvents = [];
  }
}
```

**Rationale**: 
- Isolates all FTMS protocol logic from SensorsManager
- Handles characteristic blocking to prevent command collisions
- Implements retry logic with exponential backoff
- Tracks control events for analytics
- Provides clean API for ActivityRecorderService

---

#### 1.3 Extend SensorsManager

**File**: `apps/mobile/lib/services/ActivityRecorder/sensors.ts`  
**Lines**: Multiple locations

**Change 1: Add FTMS to service scan**

**Location**: Line ~130 (in `startScan` method)

**Current code**:
```typescript
this.bleManager.startDeviceScan(
  [
    BLE_SERVICE_UUIDS.HEART_RATE,
    BLE_SERVICE_UUIDS.CYCLING_SPEED_AND_CADENCE,
    BLE_SERVICE_UUIDS.CYCLING_POWER,
    BLE_SERVICE_UUIDS.RUNNING_SPEED_AND_CADENCE,
  ],
```

**Updated code**:
```typescript
this.bleManager.startDeviceScan(
  [
    BLE_SERVICE_UUIDS.HEART_RATE,
    BLE_SERVICE_UUIDS.CYCLING_SPEED_AND_CADENCE,
    BLE_SERVICE_UUIDS.CYCLING_POWER,
    BLE_SERVICE_UUIDS.RUNNING_SPEED_AND_CADENCE,
    BLE_SERVICE_UUIDS.FITNESS_MACHINE, // NEW: Scan for FTMS trainers
  ],
```

**Change 2: Import FTMSController**

**Location**: Top of file (line ~10)

**Add import**:
```typescript
import { FTMSController, ControlMode, FTMSFeatures } from './FTMSController';
```

**Change 3: Extend ConnectedSensor interface**

**Location**: Line ~14

**Current code**:
```typescript
export interface ConnectedSensor {
  id: string;
  name: string;
  services: string[];
  characteristics: Map<string, string>;
  device: Device;
  connectionState: SensorConnectionState;
  lastDataTimestamp?: number;
  reconnectAttempted?: boolean;
}
```

**Updated code**:
```typescript
export interface ConnectedSensor {
  id: string;
  name: string;
  services: string[];
  characteristics: Map<string, string>;
  device: Device;
  connectionState: SensorConnectionState;
  lastDataTimestamp?: number;
  reconnectAttempted?: boolean;
  
  // NEW: FTMS control support
  isControllable?: boolean;
  ftmsController?: FTMSController;
  ftmsFeatures?: FTMSFeatures;
  currentControlMode?: ControlMode;
}
```

**Change 4: Add private controllableTrainer tracking**

**Location**: After line ~70 (in class properties)

**Add**:
```typescript
export class SensorsManager {
  private bleManager = new BleManager();
  private connectedSensors: Map<string, ConnectedSensor> = new Map();
  // ... existing properties ...
  
  // NEW: Track controllable trainer
  private controllableTrainer?: ConnectedSensor;
```

**Change 5: Setup FTMS on connection**

**Location**: Line ~180 (in `connectSensor` method, after service discovery)

**Current code** (around line 180):
```typescript
this.connectedSensors.set(device.id, connectedSensor);
await this.monitorKnownCharacteristics(connectedSensor);
```

**Add after this**:
```typescript
this.connectedSensors.set(device.id, connectedSensor);
await this.monitorKnownCharacteristics(connectedSensor);

// NEW: Check if device supports FTMS control
const hasFTMS = services.some(s => 
  s.uuid.toLowerCase().includes('1826')
);

if (hasFTMS) {
  console.log(`[SensorsManager] Detected FTMS trainer: ${connectedSensor.name}`);
  await this.setupFTMSControl(connectedSensor);
}
```

**Change 6: Add FTMS setup method**

**Location**: Add new method after `disconnectAll()` (around line 240)

**Add new method**:
```typescript
/**
 * Setup FTMS control for a trainer
 * Reads features, requests control, and initializes FTMSController
 */
private async setupFTMSControl(sensor: ConnectedSensor): Promise<void> {
  try {
    // Create FTMS controller
    const controller = new FTMSController(sensor.device);
    
    // Read features to determine capabilities
    const features = await controller.readFeatures();
    
    // Request control
    const controlGranted = await controller.requestControl();
    
    if (controlGranted) {
      sensor.isControllable = true;
      sensor.ftmsController = controller;
      sensor.ftmsFeatures = features;
      this.controllableTrainer = sensor;
      
      // Subscribe to status updates
      await controller.subscribeStatus((status) => {
        console.log(`[SensorsManager] Trainer status: ${status}`);
      });
      
      console.log('[SensorsManager] FTMS control setup successful');
      console.log('[SensorsManager] Capabilities:', features);
      
      // Notify connection callbacks (triggers UI update)
      this.connectionCallbacks.forEach((cb) => cb(sensor));
    } else {
      console.warn('[SensorsManager] Failed to gain FTMS control');
    }
  } catch (error) {
    console.error('[SensorsManager] FTMS setup failed:', error);
    sensor.isControllable = false;
  }
}
```

**Change 7: Add public control methods**

**Location**: Add new methods at end of class (after `validateSensorReading`, around line 420)

**Add new methods**:
```typescript
// ==================== FTMS Control Methods ====================

/**
 * Get the currently connected controllable trainer
 */
getControllableTrainer(): ConnectedSensor | undefined {
  return this.controllableTrainer;
}

/**
 * Set power target in ERG mode
 */
async setPowerTarget(watts: number): Promise<boolean> {
  if (!this.controllableTrainer?.ftmsController) {
    console.warn('[SensorsManager] No controllable trainer connected');
    return false;
  }
  
  return await this.controllableTrainer.ftmsController.setPowerTarget(watts);
}

/**
 * Set terrain simulation parameters
 */
async setSimulation(params: {
  windSpeed?: number;
  grade?: number;
  crr?: number;
  windResistance?: number;
}): Promise<boolean> {
  if (!this.controllableTrainer?.ftmsController) {
    console.warn('[SensorsManager] No controllable trainer connected');
    return false;
  }
  
  // Provide defaults for optional parameters
  const simParams = {
    windSpeed: params.windSpeed ?? 0,
    grade: params.grade ?? 0,
    crr: params.crr ?? 0.005,
    windResistance: params.windResistance ?? 0.51,
  };
  
  return await this.controllableTrainer.ftmsController.setSimulation(simParams);
}

/**
 * Set resistance level
 */
async setResistanceTarget(level: number): Promise<boolean> {
  if (!this.controllableTrainer?.ftmsController) {
    console.warn('[SensorsManager] No controllable trainer connected');
    return false;
  }
  
  return await this.controllableTrainer.ftmsController.setResistanceTarget(level);
}

/**
 * Reset trainer control
 */
async resetTrainerControl(): Promise<boolean> {
  if (!this.controllableTrainer?.ftmsController) {
    console.warn('[SensorsManager] No controllable trainer connected');
    return false;
  }
  
  return await this.controllableTrainer.ftmsController.reset();
}

/**
 * Get control events for current session
 */
getControlEvents(): any[] {
  if (!this.controllableTrainer?.ftmsController) {
    return [];
  }
  
  return this.controllableTrainer.ftmsController.getControlEvents();
}

/**
 * Clear control events history
 */
clearControlEvents(): void {
  if (this.controllableTrainer?.ftmsController) {
    this.controllableTrainer.ftmsController.clearControlEvents();
  }
}
```

**Rationale**: 
- Minimal changes to existing SensorsManager
- FTMS detection happens automatically during connection
- Clean delegation to FTMSController
- Maintains existing architecture patterns

---

### Phase 2: Plan Integration & Auto-Target Application

#### 2.1 Integrate with ActivityRecorderService

**File**: `apps/mobile/lib/services/ActivityRecorder/index.ts`  
**Location**: Multiple locations

**Change 1: Add plan integration setup**

**Location**: Line ~100 (in constructor, after initializing managers)

**Current code**:
```typescript
// Setup location listeners
this.locationManager.addCallback((location) =>
  this.handleLocationData(location),
);
```

**Add after this**:
```typescript
// Setup location listeners
this.locationManager.addCallback((location) =>
  this.handleLocationData(location),
);

// NEW: Setup plan-based trainer control
this.setupPlanTrainerIntegration();
```

**Change 2: Add plan integration method**

**Location**: Add new method after `selectActivityFromPayload` (around line 380)

**Add new method**:
```typescript
/**
 * Setup automatic trainer control based on workout plan
 * Applies power/grade targets when steps change
 */
private setupPlanTrainerIntegration(): void {
  // Apply targets when step changes
  this.on('stepChanged', async ({ current }) => {
    if (!current || this.state !== 'recording') return;
    
    const trainer = this.sensorsManager.getControllableTrainer();
    if (!trainer) return;
    
    console.log('[Service] Applying step targets:', current.name);
    await this.applyStepTargets(current);
  });
  
  // Apply initial target when recording starts
  this.on('stateChanged', async (state) => {
    if (state !== 'recording') return;
    
    const step = this.currentStep;
    if (!step) return;
    
    const trainer = this.sensorsManager.getControllableTrainer();
    if (!trainer) return;
    
    console.log('[Service] Applying initial targets');
    await this.applyStepTargets(step);
  });
}

/**
 * Apply targets from a plan step to the trainer
 */
private async applyStepTargets(step: FlattenedStep): Promise<void> {
  if (!step.targets) {
    console.log('[Service] No targets for this step');
    return;
  }
  
  const trainer = this.sensorsManager.getControllableTrainer();
  if (!trainer) {
    console.log('[Service] No controllable trainer');
    return;
  }
  
  try {
    // Check for power targets (ERG mode)
    if (step.targets.power) {
      const powerTarget = this.resolvePowerTarget(step.targets.power);
      if (powerTarget) {
        console.log(`[Service] Applying power target: ${powerTarget}W`);
        const success = await this.sensorsManager.setPowerTarget(powerTarget);
        
        if (!success) {
          this.emit('error', `Failed to set power target: ${powerTarget}W`);
        }
      }
    }
    // Check for grade targets (SIM mode)
    else if (step.targets.grade !== undefined) {
      console.log(`[Service] Applying grade target: ${step.targets.grade}%`);
      const success = await this.sensorsManager.setSimulation({
        grade: step.targets.grade,
        windSpeed: 0,
        crr: 0.005,
        windResistance: 0.51,
      });
      
      if (!success) {
        this.emit('error', `Failed to set grade target: ${step.targets.grade}%`);
      }
    }
  } catch (error) {
    console.error('[Service] Failed to apply step targets:', error);
    this.emit('error', 'Failed to apply workout targets to trainer');
  }
}

/**
 * Resolve power target from plan step to absolute watts
 */
private resolvePowerTarget(target: any): number | null {
  // Handle absolute watts
  if (typeof target === 'number') {
    return Math.round(target);
  }
  
  // Handle percentage of FTP
  if (target.type === '%FTP' || target.type === 'ftp') {
    const ftp = this.profile.ftp || 200; // Fallback to 200W
    const percentage = target.intensity || target.value || 0;
    return Math.round((percentage / 100) * ftp);
  }
  
  // Handle watts object
  if (target.type === 'watts') {
    return Math.round(target.intensity || target.value || 0);
  }
  
  console.warn('[Service] Unable to resolve power target:', target);
  return null;
}
```

**Rationale**:
- Automatic target application when recording starts or step changes
- Handles both ERG mode (power targets) and SIM mode (grade targets)
- Resolves percentage-based targets (e.g., "90% FTP") to absolute watts
- Error handling with user notifications

---

### Phase 3: Database Schema & API

#### 3.1 Database Migration

**File**: `packages/supabase/migrations/20251212120000_ftms_support.sql` (CREATE NEW)

**Full migration**:
```sql
-- ==========================================
-- FTMS Support Migration
-- ==========================================
-- Purpose: Add trainer control tracking to activities
-- Date: 2025-12-12
-- ==========================================

-- Add trainer control columns to activities table
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS trainer_controlled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS control_mode text CHECK (control_mode IN ('erg', 'sim', 'resistance')),
  ADD COLUMN IF NOT EXISTS avg_target_adherence numeric(5,2) CHECK (avg_target_adherence >= 0 AND avg_target_adherence <= 100);

-- Create trainer control events table
CREATE TABLE IF NOT EXISTS trainer_control_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES activities(id) ON DELETE CASCADE NOT NULL,
  timestamp timestamptz NOT NULL,
  
  -- Control command details
  control_type text NOT NULL CHECK (control_type IN ('power_target', 'simulation', 'resistance')),
  target_value numeric NOT NULL,
  
  -- Response details
  actual_value numeric,
  success boolean DEFAULT true,
  error_message text,
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

-- Create index for efficient querying by activity
CREATE INDEX IF NOT EXISTS idx_trainer_events_activity 
  ON trainer_control_events(activity_id, timestamp);

-- Create index for analyzing control success rates
CREATE INDEX IF NOT EXISTS idx_trainer_events_success
  ON trainer_control_events(activity_id, success);

-- Add comment documentation
COMMENT ON TABLE trainer_control_events IS 'Tracks all trainer control commands sent during activities';
COMMENT ON COLUMN trainer_control_events.control_type IS 'Type of control: power_target (ERG), simulation (SIM), or resistance';
COMMENT ON COLUMN trainer_control_events.target_value IS 'Target value set (watts for power, percentage for grade/resistance)';
COMMENT ON COLUMN trainer_control_events.actual_value IS 'Measured value from trainer (optional)';

-- Grant permissions (adjust based on your RLS policies)
ALTER TABLE trainer_control_events ENABLE ROW LEVEL SECURITY;

-- Example RLS policy (users can only access their own control events)
CREATE POLICY "Users can view their own trainer control events"
  ON trainer_control_events
  FOR SELECT
  USING (
    activity_id IN (
      SELECT id FROM activities WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own trainer control events"
  ON trainer_control_events
  FOR INSERT
  WITH CHECK (
    activity_id IN (
      SELECT id FROM activities WHERE profile_id = auth.uid()
    )
  );
```

**Rationale**:
- Extends activities table with trainer control metadata
- Stores detailed control events for analysis
- Indexes optimize querying by activity
- RLS policies ensure data privacy

**Migration application**:
```bash
# From project root
cd packages/supabase
supabase migration new ftms_support
# Copy SQL above into generated migration file
supabase db push
```

---

#### 3.2 Update Database Types

**File**: `packages/supabase/database.types.ts`

**Note**: This file is auto-generated. Run the following command after applying migration:

```bash
cd packages/supabase
supabase gen types typescript --local > database.types.ts
```

This will automatically add:
- `trainer_control_events` table types
- Updated `activities` table with new columns

---

#### 3.3 Add tRPC Endpoints

**File**: `packages/trpc/src/routers/activities.ts`  
**Location**: Add new endpoints after existing mutations (around line 150)

**Add imports**:
```typescript
// Add to existing imports at top of file
import { z } from 'zod';
```

**Add new endpoints**:
```typescript
// Add after existing endpoints (around line 150)

/**
 * Upload trainer control events for an activity
 * Called when finishing a recording with FTMS control
 */
uploadTrainerEvents: protectedProcedure
  .input(z.object({
    activityId: z.string().uuid(),
    events: z.array(z.object({
      timestamp: z.number(),
      controlType: z.enum(['power_target', 'simulation', 'resistance']),
      targetValue: z.number(),
      actualValue: z.number().optional(),
      success: z.boolean(),
      errorMessage: z.string().optional(),
    }))
  }))
  .mutation(async ({ ctx, input }) => {
    console.log(`[tRPC] Uploading ${input.events.length} trainer control events`);
    
    // Verify activity belongs to user
    const { data: activity } = await ctx.supabase
      .from('activities')
      .select('id, profile_id')
      .eq('id', input.activityId)
      .single();
    
    if (!activity || activity.profile_id !== ctx.session.user.id) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Activity not found or access denied',
      });
    }
    
    // Batch insert control events
    const { data, error } = await ctx.supabase
      .from('trainer_control_events')
      .insert(input.events.map(e => ({
        activity_id: input.activityId,
        timestamp: new Date(e.timestamp).toISOString(),
        control_type: e.controlType,
        target_value: e.targetValue,
        actual_value: e.actualValue,
        success: e.success,
        error_message: e.errorMessage,
      })));
    
    if (error) {
      console.error('[tRPC] Failed to upload trainer events:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to save trainer control events',
      });
    }
    
    console.log('[tRPC] Successfully uploaded trainer control events');
    return { success: true, count: input.events.length };
  }),

/**
 * Get control adherence analysis for an activity
 * Shows how well actual power matched targets
 */
getControlAdherence: protectedProcedure
  .input(z.object({ 
    activityId: z.string().uuid() 
  }))
  .query(async ({ ctx, input }) => {
    // Verify activity belongs to user
    const { data: activity } = await ctx.supabase
      .from('activities')
      .select('id, profile_id, trainer_controlled, control_mode')
      .eq('id', input.activityId)
      .single();
    
    if (!activity || activity.profile_id !== ctx.session.user.id) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Activity not found or access denied',
      });
    }
    
    if (!activity.trainer_controlled) {
      return {
        hasControlData: false,
        adherencePercent: 0,
        events: [],
      };
    }
    
    // Fetch control events
    const { data: events } = await ctx.supabase
      .from('trainer_control_events')
      .select('*')
      .eq('activity_id', input.activityId)
      .order('timestamp', { ascending: true });
    
    if (!events || events.length === 0) {
      return {
        hasControlData: false,
        adherencePercent: 0,
        events: [],
      };
    }
    
    // Calculate adherence statistics
    const successfulEvents = events.filter(e => e.success);
    const eventsWithActual = events.filter(e => e.actual_value != null);
    
    let avgDeviation = 0;
    let adherencePercent = 100;
    
    if (eventsWithActual.length > 0) {
      const deviations = eventsWithActual.map(e => 
        Math.abs(e.target_value - (e.actual_value || 0))
      );
      avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
      
      // Calculate adherence percentage
      const avgTarget = eventsWithActual.reduce((a, e) => a + e.target_value, 0) / eventsWithActual.length;
      adherencePercent = Math.max(0, 100 - (avgDeviation / avgTarget * 100));
    }
    
    return {
      hasControlData: true,
      controlMode: activity.control_mode,
      totalEvents: events.length,
      successfulEvents: successfulEvents.length,
      avgDeviation,
      adherencePercent: Math.round(adherencePercent * 100) / 100,
      events: events.map(e => ({
        timestamp: e.timestamp,
        controlType: e.control_type,
        targetValue: e.target_value,
        actualValue: e.actual_value,
        success: e.success,
      })),
    };
  }),
```

**Rationale**:
- `uploadTrainerEvents`: Stores control events after activity finishes
- `getControlAdherence`: Analyzes target vs actual adherence
- Proper error handling and authentication
- Calculates meaningful adherence metrics

---

### Phase 4: UI Components

#### 4.1 Trainer Control Indicator

**File**: `apps/mobile/app/(internal)/record/index.tsx`  
**Location**: Line ~150 (inside main View, before RecordingCarousel)

**Add import**:
```typescript
import { Zap } from 'lucide-react-native';
```

**Add component** (before RecordingCarousel):
```typescript
{/* NEW: Trainer Control Indicator */}
{(() => {
  const trainer = service?.sensorsManager.getControllableTrainer();
  const currentStep = service?.currentStep;
  
  if (!trainer || !trainer.isControllable) return null;
  
  let targetDisplay = 'Connected';
  if (currentStep?.targets?.power) {
    const powerTarget = resolvePowerTarget(currentStep.targets.power, service.profile);
    if (powerTarget) {
      targetDisplay = `Target: ${powerTarget}W`;
    }
  } else if (currentStep?.targets?.grade !== undefined) {
    targetDisplay = `Target: ${currentStep.targets.grade}%`;
  }
  
  return (
    <View className="bg-primary/10 px-4 py-2 border-b border-primary/20">
      <View className="flex-row items-center gap-2">
        <Zap size={16} className="text-primary" />
        <Text className="text-xs text-primary font-medium">
          Trainer Control Active
        </Text>
        <Text className="text-xs text-primary ml-auto">
          {targetDisplay}
        </Text>
      </View>
    </View>
  );
})()}
```

**Add helper function** (at top level, outside component):
```typescript
function resolvePowerTarget(target: any, profile: any): number | null {
  if (typeof target === 'number') return Math.round(target);
  if (target.type === '%FTP' || target.type === 'ftp') {
    const ftp = profile.ftp || 200;
    return Math.round((target.intensity / 100) * ftp);
  }
  if (target.type === 'watts') return Math.round(target.intensity || 0);
  return null;
}
```

**Rationale**:
- Shows users when trainer control is active
- Displays current target for transparency
- Minimal UI footprint (single line banner)

---

#### 4.2 Sensor Connection Badge

**File**: `apps/mobile/app/(internal)/record/sensors.tsx`  
**Location**: Line ~80 (in device list item rendering)

**Add import**:
```typescript
import { Zap } from 'lucide-react-native';
```

**Current rendering** (around line 80):
```typescript
<View className="flex-row items-center gap-3">
  <Text className="text-base">{device.name}</Text>
  {/* Connection button */}
</View>
```

**Add badge** (after device name):
```typescript
<View className="flex-row items-center gap-3">
  <Text className="text-base">{device.name}</Text>
  
  {/* NEW: Controllable badge */}
  {device.isControllable && (
    <View className="bg-green-500/20 px-2 py-1 rounded flex-row items-center gap-1">
      <Zap size={12} className="text-green-600" />
      <Text className="text-xs text-green-600 font-medium">
        Control
      </Text>
    </View>
  )}
  
  {/* Connection button */}
</View>
```

**Rationale**:
- Visual indicator for trainers that support control
- Helps users identify compatible devices
- Consistent with "connected" badge styling

---

## Testing Strategy

### Unit Tests

**File**: `apps/mobile/lib/services/ActivityRecorder/__tests__/FTMSController.test.ts` (CREATE NEW)

```typescript
import { FTMSController } from '../FTMSController';
import { Device } from 'react-native-ble-plx';

describe('FTMSController', () => {
  let mockDevice: jest.Mocked<Device>;
  let controller: FTMSController;

  beforeEach(() => {
    mockDevice = {
      readCharacteristicForService: jest.fn(),
      writeCharacteristicWithResponseForService: jest.fn(),
      monitorCharacteristicForService: jest.fn(),
    } as any;

    controller = new FTMSController(mockDevice);
  });

  describe('setPowerTarget', () => {
    it('should encode power target correctly', async () => {
      // Mock feature read and control request
      mockDevice.readCharacteristicForService.mockResolvedValue({
        value: Buffer.from([0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).toString('base64'),
      } as any);
      
      mockDevice.writeCharacteristicWithResponseForService.mockResolvedValue(undefined as any);

      await controller.readFeatures();
      await controller.requestControl();
      await controller.setPowerTarget(250);

      // Verify write was called with correct buffer
      const calls = mockDevice.writeCharacteristicWithResponseForService.mock.calls;
      const lastCall = calls[calls.length - 1];
      const buffer = Buffer.from(lastCall[2], 'base64');

      expect(buffer[0]).toBe(0x05); // Op code
      expect(buffer[1]).toBe(250 & 0xFF); // Low byte
      expect(buffer[2]).toBe((250 >> 8) & 0xFF); // High byte
    });

    it('should clamp power to valid range', async () => {
      mockDevice.readCharacteristicForService.mockResolvedValue({
        value: Buffer.from([0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).toString('base64'),
      } as any);
      
      mockDevice.writeCharacteristicWithResponseForService.mockResolvedValue(undefined as any);

      await controller.readFeatures();
      await controller.requestControl();
      
      // Test negative value
      await controller.setPowerTarget(-10);
      let buffer = Buffer.from(
        mockDevice.writeCharacteristicWithResponseForService.mock.calls[2][2],
        'base64'
      );
      let power = buffer[1] | (buffer[2] << 8);
      expect(power).toBe(0);

      // Test excessive value
      await controller.setPowerTarget(5000);
      buffer = Buffer.from(
        mockDevice.writeCharacteristicWithResponseForService.mock.calls[3][2],
        'base64'
      );
      power = buffer[1] | (buffer[2] << 8);
      expect(power).toBe(4000);
    });
  });

  describe('setSimulation', () => {
    it('should encode simulation parameters correctly', async () => {
      mockDevice.readCharacteristicForService.mockResolvedValue({
        value: Buffer.from([0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00]).toString('base64'),
      } as any);
      
      mockDevice.writeCharacteristicWithResponseForService.mockResolvedValue(undefined as any);

      await controller.readFeatures();
      await controller.requestControl();
      await controller.setSimulation({
        windSpeed: 0,
        grade: 5.5,
        crr: 0.005,
        windResistance: 0.51,
      });

      const buffer = Buffer.from(
        mockDevice.writeCharacteristicWithResponseForService.mock.calls[2][2],
        'base64'
      );

      expect(buffer[0]).toBe(0x11); // Op code
      
      // Grade: 5.5% = 550 in 0.01% resolution
      const grade = buffer[3] | (buffer[4] << 8);
      expect(grade).toBe(550);
      
      // CRR: 0.005 = 50 in 0.0001 resolution
      expect(buffer[5]).toBe(50);
      
      // Wind resistance: 0.51 kg/m = 51 in 0.01 kg/m resolution
      expect(buffer[6]).toBe(51);
    });
  });
});
```

### Device Testing Matrix

| Trainer Model | FTMS | ERG Mode | SIM Mode | Resistance | Status |
|--------------|------|----------|----------|------------|---------|
| Wahoo KICKR | ✅ | ✅ | ✅ | ✅ | Priority |
| Tacx Neo 2T | ✅ | ✅ | ✅ | ✅ | Priority |
| Elite Direto XR | ✅ | ✅ | ✅ | ❌ | Priority |
| Saris H3 | ✅ | ✅ | ⚠️ | ✅ | Medium |
| Zwift Hub | ✅ | ✅ | ❌ | ✅ | Medium |

**Test Scenarios**:
1. ✅ Connect to trainer and gain control
2. ✅ Set power target (100W, 250W, 400W)
3. ✅ Execute 5-step workout with auto-targets
4. ✅ Rapid target changes (every 30 seconds)
5. ✅ Handle connection loss during workout
6. ✅ Multiple sensor setup (HRM + trainer)
7. ✅ App backgrounding during workout
8. ✅ Phone call interruption

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)

**Week 1: Protocol Implementation**
- [ ] Create FTMSController class
- [ ] Implement feature reading
- [ ] Implement control point writes
- [ ] Add protocol op code encoding
- [ ] Unit tests for encoding logic

**Week 2: SensorsManager Integration**
- [ ] Extend ConnectedSensor interface
- [ ] Add FTMS detection on connection
- [ ] Implement public control methods
- [ ] Add status monitoring
- [ ] Integration tests

**Success Criteria**:
- Can connect to FTMS trainer
- Can read features and request control
- Can send power target commands
- Control events are logged

### Phase 2: ERG Mode & Plan Integration (Week 3-4)

**Week 3: Automatic Target Application**
- [ ] Add plan integration to ActivityRecorderService
- [ ] Implement applyStepTargets method
- [ ] Add power target resolution logic
- [ ] Test with sample workout plan

**Week 4: UI & Polish**
- [ ] Add trainer control indicator
- [ ] Add controllable badge to sensor list
- [ ] Error handling and user feedback
- [ ] Test with real workout

**Success Criteria**:
- Workout starts, trainer sets to first target
- Step changes trigger automatic target updates
- UI shows control status
- Smooth 60-minute workout completion

### Phase 3: Database & Analytics (Week 5-6)

**Week 5: Backend Implementation**
- [ ] Create database migration
- [ ] Add tRPC endpoints
- [ ] Implement control event upload
- [ ] Add adherence calculation

**Week 6: Activity Submission Integration**
- [ ] Upload control events with activity
- [ ] Calculate adherence metrics
- [ ] Test end-to-end flow
- [ ] Beta testing with users

**Success Criteria**:
- Control events persist to database
- Adherence metrics displayed
- Activity detail shows control data
- 5+ successful beta test workouts

---

## Success Metrics

### Technical Metrics
- [ ] Successfully control 95%+ of FTMS-compatible trainers
- [ ] < 500ms latency from target change to trainer response
- [ ] < 5W average deviation in ERG mode
- [ ] Zero crashes during control sessions
- [ ] 99%+ success rate for control commands

### User Experience Metrics
- [ ] Automatic plan execution without manual intervention
- [ ] Clear visual feedback of control status
- [ ] Graceful degradation when control fails
- [ ] Intuitive connection flow
- [ ] Positive user feedback

---

## Troubleshooting Guide

### Issue: Trainer not detected
**Symptoms**: Device appears in scan but not marked as controllable  
**Diagnosis**: 
1. Check if device advertises FTMS service UUID (0x1826)
2. Verify trainer firmware is up to date
3. Ensure trainer is not connected to another app

**Solutions**:
- Disconnect trainer from all other apps
- Power cycle trainer
- Update trainer firmware via manufacturer app

### Issue: Control commands rejected
**Symptoms**: `setPowerTarget` returns false, status shows "control not permitted"  
**Diagnosis**:
1. Check if `requestControl()` was successful
2. Verify features indicate ERG support
3. Check for conflicting control sources

**Solutions**:
- Call `requestControl()` before sending commands
- Reset trainer and reconnect
- Ensure no other apps have control

### Issue: Target not applied
**Symptoms**: Trainer doesn't adjust resistance  
**Diagnosis**:
1. Check control events log for errors
2. Verify trainer is in correct mode (ERG/SIM/Resistance)
3. Check for control point blocking

**Solutions**:
- Reset control with `resetTrainerControl()`
- Check control point is not blocked
- Verify target is within trainer's range

---

## Performance Considerations

### Bluetooth Write Frequency
- **Recommendation**: Maximum 1 command per second
- **Implementation**: Control point blocking prevents command collision
- **Rationale**: Trainers need time to process and respond

### Battery Impact
- **FTMS overhead**: ~2-3% additional battery drain
- **Mitigation**: Efficient write patterns, no polling
- **Monitoring**: Include battery telemetry in beta testing

### Memory Usage
- **Control events**: ~50 bytes per event
- **Typical workout**: 10-50 events (500-2500 bytes)
- **Impact**: Negligible compared to GPS/sensor data

---

## Future Enhancements

### Phase 4: Advanced Features (Future)

**Multi-Protocol Support**:
- [ ] FE-C over BLE (Tacx-specific)
- [ ] Wahoo WCPS protocol
- [ ] Protocol auto-detection

**Enhanced Control**:
- [ ] Manual target adjustment (+/- controls)
- [ ] Target smoothing (gradual ramps)
- [ ] Custom ERG curves
- [ ] Workout preview with control simulation

**Analytics**:
- [ ] Target adherence visualization
- [ ] Control success rate trends
- [ ] Trainer-specific quirks database
- [ ] Workout quality scoring

**Integration**:
- [ ] .ZWO workout import
- [ ] Route-based grade control
- [ ] Real-time workout adjustment
- [ ] Coach-prescribed power adjustments

---

## Related Documents

- [BLUETOOTH_CONTROL_GAP.md](./BLUETOOTH_CONTROL_GAP.md) - Detailed gap analysis
- [FTMS_RECORDING_ENHANCEMENTS.md](./FTMS_RECORDING_ENHANCEMENTS.md) - Implementation guide
- [AUUKI_GRADIENTPEAK_COMPARISON.md](./AUUKI_GRADIENTPEAK_COMPARISON.md) - Architecture comparison

---

## Appendix A: FTMS Data Format Reference

### Control Point Write Format

**Set Target Power (Op Code 0x05)**:
```
Byte 0: 0x05 (op code)
Byte 1-2: Power in watts (sint16, little-endian)
```

**Set Indoor Bike Simulation (Op Code 0x11)**:
```
Byte 0: 0x11 (op code)
Byte 1-2: Wind speed in 0.001 m/s (sint16, little-endian)
Byte 3-4: Grade in 0.01% (sint16, little-endian)
Byte 5: CRR in 0.0001 (uint8)
Byte 6: Wind resistance in 0.01 kg/m (uint8)
```

**Set Target Resistance (Op Code 0x04)**:
```
Byte 0: 0x04 (op code)
Byte 1-2: Resistance level in 0.1 (sint16, little-endian)
```

### Response Format

**Response Code (Op Code 0x80)**:
```
Byte 0: 0x80 (response op code)
Byte 1: Original request op code
Byte 2: Result code (0x01 = success, 0x02-0x05 = errors)
```

---

## Appendix B: Trainer Compatibility Database

### Known Working Trainers

**Wahoo KICKR (all models)**:
- FTMS: ✅ Full support
- ERG: ✅ Excellent
- SIM: ✅ Excellent
- Quirks: Requires reset between mode switches

**Tacx Neo 2T/2**:
- FTMS: ✅ Full support
- ERG: ✅ Excellent
- SIM: ✅ Excellent (road feel simulation)
- Quirks: None

**Elite Direto XR**:
- FTMS: ✅ Full support
- ERG: ✅ Good
- SIM: ⚠️ Limited (grade only)
- Quirks: 1-second delay on commands

**Saris H3**:
- FTMS: ✅ Full support
- ERG: ✅ Good
- SIM: ⚠️ Basic
- Quirks: Maximum 2000W target

**Zwift Hub**:
- FTMS: ✅ Full support
- ERG: ✅ Good
- SIM: ❌ Not supported
- Quirks: Firmware updates required

---

**Document Version**: 2.0  
**Last Updated**: 2025-12-12  
**Status**: Ready for Implementation
