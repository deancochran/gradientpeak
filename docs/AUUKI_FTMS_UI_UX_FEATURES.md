# Auuki FTMS UI/UX Features - Implementation Guide for GradientPeak

## Executive Summary

This document analyzes Auuki's FTMS UI/UX implementation to identify valuable patterns and features that can enhance GradientPeak's user experience. While you already have the `FTMSController` backend implemented, Auuki demonstrates several user-facing features that significantly improve the indoor training experience.

**Key Finding:** Auuki's strength lies in its **mode-based control interface**, **visual feedback systems**, and **intelligent automation**. These patterns work equally well for users with active plans, quick plans, or free ride sessions.

---

## 1. Control Mode Interface

### What Auuki Does

Auuki provides a prominent **mode selector** that gives users clear control over how their trainer behaves:

```html
<!-- From Auuki's index.html -->
<div id="mode-selector" class="mode-selector">
    <tab-btn id="erg-mode-btn" prop="mode" effect="mode-set" param="erg">ERG</tab-btn>
    <tab-btn id="resistance-mode-btn" prop="mode" effect="mode-set" param="resistance">Resistance</tab-btn>
    <tab-btn id="slope-mode-btn" prop="mode" effect="mode-set" param="sim">Slope</tab-btn>
    <mode-lock-toggle><!-- Lock icon --></mode-lock-toggle>
</div>
```

**Key UI Elements:**
1. **Three clearly labeled tabs**: ERG / Resistance / Slope
2. **Mode lock toggle**: Prevents accidental mode switching during intense intervals
3. **Active mode highlighting**: Visual indicator of current mode
4. **Persistent across sessions**: Mode preference saved in localStorage

### Implementation for GradientPeak

#### Mobile UI Component

Create a `TrainerControlModeSelector` component:

```typescript
// apps/mobile/components/TrainerControlModeSelector.tsx

import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Lock, Unlock } from 'lucide-react-native';
import { ControlMode } from '@/lib/services/ActivityRecorder/FTMSController';

interface Props {
  currentMode: ControlMode;
  onModeChange: (mode: ControlMode) => void;
  disabled?: boolean;
  showLock?: boolean; // Show for planned workouts where mode is automatic
}

export function TrainerControlModeSelector({ 
  currentMode, 
  onModeChange, 
  disabled = false,
  showLock = false 
}: Props) {
  const [isLocked, setIsLocked] = useState(false);
  
  const modes = [
    { value: ControlMode.ERG, label: 'ERG', description: 'Power Target' },
    { value: ControlMode.RESISTANCE, label: 'Resistance', description: 'Level' },
    { value: ControlMode.SIM, label: 'Slope', description: 'Grade %' },
  ];
  
  const handleModePress = (mode: ControlMode) => {
    if (disabled || isLocked) return;
    onModeChange(mode);
  };
  
  return (
    <View className="bg-card rounded-lg p-3 mb-4">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-sm font-medium text-foreground">Control Mode</Text>
        {showLock && (
          <Pressable onPress={() => setIsLocked(!isLocked)}>
            <View className="flex-row items-center gap-1">
              {isLocked ? (
                <Lock size={16} className="text-primary" />
              ) : (
                <Unlock size={16} className="text-muted-foreground" />
              )}
              <Text className="text-xs text-muted-foreground">
                {isLocked ? 'Locked' : 'Unlocked'}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
      
      <View className="flex-row gap-2">
        {modes.map((mode) => (
          <Pressable
            key={mode.value}
            onPress={() => handleModePress(mode.value)}
            disabled={disabled || isLocked}
            className={`
              flex-1 p-3 rounded-md border-2
              ${currentMode === mode.value 
                ? 'bg-primary border-primary' 
                : 'bg-background border-border'}
              ${(disabled || isLocked) && 'opacity-50'}
            `}
          >
            <Text className={`
              text-center font-semibold text-sm
              ${currentMode === mode.value ? 'text-primary-foreground' : 'text-foreground'}
            `}>
              {mode.label}
            </Text>
            <Text className={`
              text-center text-xs mt-1
              ${currentMode === mode.value ? 'text-primary-foreground/80' : 'text-muted-foreground'}
            `}>
              {mode.description}
            </Text>
          </Pressable>
        ))}
      </View>
      
      {disabled && (
        <Text className="text-xs text-muted-foreground mt-2 text-center">
          Mode automatically controlled by workout plan
        </Text>
      )}
    </View>
  );
}
```

#### Usage Scenarios

**1. Planned Workout (Automatic Mode)**
```typescript
// In recording screen for structured workout
<TrainerControlModeSelector 
  currentMode={currentControlMode}
  onModeChange={handleModeChange}
  disabled={true} // Locked during planned workouts
  showLock={false}
/>
```

**2. Quick Plan / Free Ride (Manual Control)**
```typescript
// In recording screen for free ride
<TrainerControlModeSelector 
  currentMode={currentControlMode}
  onModeChange={handleModeChange}
  disabled={false}
  showLock={true} // User can lock to prevent accidental changes
/>
```

**3. Outdoor Activity (Hidden)**
```typescript
// Only show if FTMS trainer is connected
{controllableTrainer && !isOutdoor && (
  <TrainerControlModeSelector {...props} />
)}
```

---

## 2. Target Control Inputs

### What Auuki Does

For each control mode, Auuki provides dedicated input controls with increment/decrement buttons:

**ERG Mode:**
```html
<power-target-control class="target-input">
    <btn effect="power-target-decrement">-</btn>
    <number-input prop="powerTarget" />
    <btn effect="power-target-increment">+</btn>
    <unit>W</unit>
</power-target-control>
```

**Increments:**
- Power: ±10W per tap
- Resistance: ±10 levels per tap
- Slope: ±0.5% per tap

**Range Validation:**
- Power: 0-4000W
- Resistance: -100 to +100
- Slope: -40% to +40%

### Implementation for GradientPeak

#### Unified Target Control Component

```typescript
// apps/mobile/components/TrainerTargetControl.tsx

import { View, Text, Pressable, TextInput } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { ControlMode } from '@/lib/services/ActivityRecorder/FTMSController';

interface Props {
  mode: ControlMode;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  showTargetFromPlan?: boolean; // Show what plan specifies
  planTarget?: number;
}

const CONFIG = {
  [ControlMode.ERG]: {
    label: 'Power Target',
    unit: 'W',
    increment: 10,
    min: 0,
    max: 4000,
    decimals: 0,
  },
  [ControlMode.RESISTANCE]: {
    label: 'Resistance',
    unit: '',
    increment: 10,
    min: -100,
    max: 100,
    decimals: 0,
  },
  [ControlMode.SIM]: {
    label: 'Grade',
    unit: '%',
    increment: 0.5,
    min: -40,
    max: 40,
    decimals: 1,
  },
};

export function TrainerTargetControl({ 
  mode, 
  value, 
  onChange, 
  disabled = false,
  showTargetFromPlan = false,
  planTarget 
}: Props) {
  const config = CONFIG[mode];
  
  const handleIncrement = () => {
    const newValue = Math.min(config.max, value + config.increment);
    onChange(Number(newValue.toFixed(config.decimals)));
  };
  
  const handleDecrement = () => {
    const newValue = Math.max(config.min, value - config.increment);
    onChange(Number(newValue.toFixed(config.decimals)));
  };
  
  const handleTextChange = (text: string) => {
    const parsed = parseFloat(text);
    if (!isNaN(parsed)) {
      const clamped = Math.max(config.min, Math.min(config.max, parsed));
      onChange(Number(clamped.toFixed(config.decimals)));
    }
  };
  
  return (
    <View className="bg-card rounded-lg p-4">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-sm font-medium text-foreground">{config.label}</Text>
        {showTargetFromPlan && planTarget && (
          <Text className="text-xs text-muted-foreground">
            Plan: {planTarget}{config.unit}
          </Text>
        )}
      </View>
      
      <View className="flex-row items-center gap-3">
        {/* Decrement Button */}
        <Pressable
          onPress={handleDecrement}
          disabled={disabled || value <= config.min}
          className={`
            w-12 h-12 rounded-lg bg-secondary items-center justify-center
            ${(disabled || value <= config.min) && 'opacity-50'}
          `}
        >
          <Minus size={20} className="text-secondary-foreground" />
        </Pressable>
        
        {/* Value Input */}
        <View className="flex-1 relative">
          <TextInput
            value={value.toFixed(config.decimals)}
            onChangeText={handleTextChange}
            keyboardType="numeric"
            editable={!disabled}
            className={`
              text-center text-3xl font-bold bg-background rounded-lg p-3
              ${disabled && 'opacity-50'}
            `}
          />
          <Text className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
            {config.unit}
          </Text>
        </View>
        
        {/* Increment Button */}
        <Pressable
          onPress={handleIncrement}
          disabled={disabled || value >= config.max}
          className={`
            w-12 h-12 rounded-lg bg-secondary items-center justify-center
            ${(disabled || value >= config.max) && 'opacity-50'}
          `}
        >
          <Plus size={20} className="text-secondary-foreground" />
        </Pressable>
      </View>
      
      {/* Range Indicator */}
      <View className="flex-row justify-between mt-3">
        <Text className="text-xs text-muted-foreground">
          Min: {config.min}{config.unit}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Max: {config.max}{config.unit}
        </Text>
      </View>
    </View>
  );
}
```

#### Usage in Recording Screen

```typescript
// apps/mobile/app/(internal)/record/index.tsx

export default function RecordScreen() {
  const [controlMode, setControlMode] = useState(ControlMode.ERG);
  const [powerTarget, setPowerTarget] = useState(200);
  const [resistanceTarget, setResistanceTarget] = useState(50);
  const [gradeTarget, setGradeTarget] = useState(0);
  
  const currentStep = service.plan?.getCurrentStep();
  const hasPlan = !!service.plan;
  
  const handleTargetChange = async (value: number) => {
    switch (controlMode) {
      case ControlMode.ERG:
        setPowerTarget(value);
        await service.sensorsManager.ftmsController?.setPowerTarget(value);
        break;
      case ControlMode.RESISTANCE:
        setResistanceTarget(value);
        await service.sensorsManager.ftmsController?.setResistanceTarget(value);
        break;
      case ControlMode.SIM:
        setGradeTarget(value);
        await service.sensorsManager.ftmsController?.setSimulation({
          grade: value,
          windSpeed: 0,
          crr: 0.005,
          windResistance: 0.51,
        });
        break;
    }
  };
  
  return (
    <ScrollView>
      {/* Mode Selector */}
      <TrainerControlModeSelector 
        currentMode={controlMode}
        onModeChange={setControlMode}
        disabled={hasPlan} // Auto mode during workouts
        showLock={!hasPlan}
      />
      
      {/* Target Control */}
      <TrainerTargetControl 
        mode={controlMode}
        value={controlMode === ControlMode.ERG ? powerTarget : 
               controlMode === ControlMode.RESISTANCE ? resistanceTarget : 
               gradeTarget}
        onChange={handleTargetChange}
        disabled={hasPlan} // Auto-controlled during workouts
        showTargetFromPlan={hasPlan}
        planTarget={currentStep?.targets?.power}
      />
      
      {/* Rest of recording UI */}
    </ScrollView>
  );
}
```

---

## 3. Connection Status & Feedback

### What Auuki Does

Auuki provides rich visual feedback for device connection status:

```html
<connection-switch for="ble:controllable" class="connection-switch">
    <div class="connection-switch--indicator off"></div>
    <div class="connection-switch--label">Controllable</div>
    <div class="connection-switch--device-name">Wahoo KICKR 1A2B</div>
</connection-switch>
```

**States:**
- `off` - Gray indicator, "Not Connected"
- `loading` - Animated pulse, "Connecting..."
- `on` - Green indicator, shows device name

**Battery Monitoring:**
```javascript
// Auuki monitors battery level characteristic
service.batteryLevel?.startNotifications();
// Updates UI with battery percentage
```

### Implementation for GradientPeak

#### Connection Status Component

```typescript
// apps/mobile/components/TrainerConnectionStatus.tsx

import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Bluetooth, BluetoothConnected, Battery } from 'lucide-react-native';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface Props {
  state: ConnectionState;
  deviceName?: string;
  batteryLevel?: number;
  onConnect: () => void;
  onDisconnect: () => void;
  features?: {
    supportsERG: boolean;
    supportsSIM: boolean;
    supportsResistance: boolean;
  };
}

export function TrainerConnectionStatus({ 
  state, 
  deviceName, 
  batteryLevel,
  onConnect, 
  onDisconnect,
  features 
}: Props) {
  const isConnected = state === 'connected';
  const isConnecting = state === 'connecting';
  
  return (
    <View className="bg-card rounded-lg p-4 mb-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          {isConnected ? (
            <BluetoothConnected size={20} className="text-green-500" />
          ) : (
            <Bluetooth size={20} className="text-muted-foreground" />
          )}
          <Text className="text-sm font-medium text-foreground">
            Smart Trainer
          </Text>
        </View>
        
        {/* Connection Toggle */}
        <Pressable
          onPress={isConnected ? onDisconnect : onConnect}
          disabled={isConnecting}
          className={`
            px-3 py-1.5 rounded-md
            ${isConnected ? 'bg-green-500' : 'bg-secondary'}
          `}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text className={`
              text-xs font-medium
              ${isConnected ? 'text-white' : 'text-secondary-foreground'}
            `}>
              {isConnected ? 'Connected' : 'Connect'}
            </Text>
          )}
        </Pressable>
      </View>
      
      {/* Device Info */}
      {isConnected && deviceName && (
        <View className="space-y-2">
          <Text className="text-sm text-foreground font-medium">
            {deviceName}
          </Text>
          
          {/* Battery Level */}
          {batteryLevel !== undefined && (
            <View className="flex-row items-center gap-2">
              <Battery size={16} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">
                Battery: {batteryLevel}%
              </Text>
            </View>
          )}
          
          {/* Capabilities */}
          {features && (
            <View className="flex-row gap-2 mt-2">
              {features.supportsERG && (
                <View className="bg-primary/10 px-2 py-1 rounded">
                  <Text className="text-xs text-primary">ERG</Text>
                </View>
              )}
              {features.supportsSIM && (
                <View className="bg-primary/10 px-2 py-1 rounded">
                  <Text className="text-xs text-primary">SIM</Text>
                </View>
              )}
              {features.supportsResistance && (
                <View className="bg-primary/10 px-2 py-1 rounded">
                  <Text className="text-xs text-primary">Resistance</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
      
      {/* Connection Prompt */}
      {!isConnected && !isConnecting && (
        <Text className="text-xs text-muted-foreground mt-2">
          Connect your FTMS-compatible trainer for automatic control
        </Text>
      )}
    </View>
  );
}
```

#### Integration with SensorsManager

```typescript
// apps/mobile/lib/services/ActivityRecorder/sensors.ts

class SensorsManager extends EventEmitter {
  
  // Add battery monitoring
  private async monitorBatteryLevel(sensor: ConnectedSensor) {
    const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
    const BATTERY_LEVEL = '00002a19-0000-1000-8000-00805f9b34fb';
    
    try {
      sensor.device.monitorCharacteristicForService(
        BATTERY_SERVICE,
        BATTERY_LEVEL,
        (error, characteristic) => {
          if (error || !characteristic?.value) return;
          
          const buffer = Buffer.from(characteristic.value, 'base64');
          const batteryLevel = buffer[0]; // 0-100%
          
          sensor.batteryLevel = batteryLevel;
          this.emit('batteryLevelUpdate', { sensorId: sensor.id, level: batteryLevel });
          
          // Warn if low battery
          if (batteryLevel < 20) {
            console.warn(`Low battery: ${sensor.name} at ${batteryLevel}%`);
          }
        }
      );
    } catch (error) {
      console.log('Battery monitoring not supported');
    }
  }
}
```

---

## 4. Workout Graph with Target Visualization

### What Auuki Does

Auuki displays a **visual workout graph** that shows:
- All intervals and steps
- Color-coded by power zones (FTP-based)
- Current position marker
- Hover tooltips with step details
- Progress bar overlay

**Key Features:**
```javascript
// From Auuki's workout-graph.js
class WorkoutGraph extends HTMLElement {
  render() {
    // Draw each step as colored rectangle
    steps.forEach(step => {
      const height = (step.power / maxPower) * graphHeight;
      const color = this.getZoneColor(step.power, ftp);
      // Draw rectangle...
    });
    
    // Draw current position marker
    const currentX = (elapsedTime / totalDuration) * graphWidth;
    // Draw vertical line at currentX...
  }
  
  getZoneColor(power, ftp) {
    const zones = {
      1: '#6b7280', // Recovery - Gray
      2: '#3b82f6', // Endurance - Blue
      3: '#10b981', // Tempo - Green
      4: '#f59e0b', // Threshold - Orange
      5: '#ef4444', // VO2 Max - Red
      6: '#a855f7', // Anaerobic - Purple
    };
    return zones[calculateZone(power, ftp)];
  }
}
```

### Implementation for GradientPeak

#### Workout Graph Component

```typescript
// apps/mobile/components/WorkoutGraph.tsx

import { View, Dimensions } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useMemo } from 'react';

interface Step {
  duration: number; // seconds
  targets?: {
    power?: number | { type: 'ftp', value: number };
  };
}

interface Props {
  steps: Step[];
  currentStepIndex: number;
  elapsedTimeInStep: number; // seconds
  ftp: number;
  height?: number;
}

const ZONE_COLORS = {
  1: '#6b7280', // Recovery
  2: '#3b82f6', // Endurance
  3: '#10b981', // Tempo
  4: '#f59e0b', // Threshold
  5: '#ef4444', // VO2 Max
  6: '#a855f7', // Anaerobic
};

function getZone(power: number, ftp: number): number {
  const percentage = power / ftp;
  if (percentage < 0.55) return 1;
  if (percentage < 0.75) return 2;
  if (percentage < 0.90) return 3;
  if (percentage < 1.05) return 4;
  if (percentage < 1.20) return 5;
  return 6;
}

export function WorkoutGraph({ 
  steps, 
  currentStepIndex, 
  elapsedTimeInStep, 
  ftp, 
  height = 120 
}: Props) {
  const { width } = Dimensions.get('window');
  const graphWidth = width - 32; // padding
  
  const { totalDuration, maxPower, stepRects, currentPosition } = useMemo(() => {
    const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
    const maxPower = Math.max(
      ...steps.map(step => {
        const target = step.targets?.power;
        if (typeof target === 'number') return target;
        if (target?.type === 'ftp') return ftp * target.value;
        return 0;
      })
    );
    
    let xOffset = 0;
    const stepRects = steps.map((step, index) => {
      const stepWidth = (step.duration / totalDuration) * graphWidth;
      const target = step.targets?.power;
      const power = typeof target === 'number' ? target : 
                    target?.type === 'ftp' ? ftp * target.value : 0;
      
      const stepHeight = (power / maxPower) * height;
      const zone = getZone(power, ftp);
      const color = ZONE_COLORS[zone];
      
      const rect = {
        x: xOffset,
        y: height - stepHeight,
        width: stepWidth,
        height: stepHeight,
        color,
        power,
        duration: step.duration,
      };
      
      xOffset += stepWidth;
      return rect;
    });
    
    // Calculate current position
    const elapsedTotal = steps
      .slice(0, currentStepIndex)
      .reduce((sum, step) => sum + step.duration, 0) + elapsedTimeInStep;
    const currentPosition = (elapsedTotal / totalDuration) * graphWidth;
    
    return { totalDuration, maxPower, stepRects, currentPosition };
  }, [steps, currentStepIndex, elapsedTimeInStep, ftp, graphWidth, height]);
  
  return (
    <View className="bg-card rounded-lg p-4 mb-4">
      <Text className="text-sm font-medium text-foreground mb-3">
        Workout Overview
      </Text>
      
      <Svg width={graphWidth} height={height}>
        {/* Draw step rectangles */}
        {stepRects.map((rect, index) => (
          <Rect
            key={index}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill={rect.color}
            opacity={index === currentStepIndex ? 1 : 0.6}
          />
        ))}
        
        {/* Draw current position marker */}
        <Line
          x1={currentPosition}
          y1={0}
          x2={currentPosition}
          y2={height}
          stroke="white"
          strokeWidth={2}
        />
      </Svg>
      
      {/* Legend */}
      <View className="flex-row flex-wrap gap-2 mt-3">
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-3 rounded-full bg-[#6b7280]" />
          <Text className="text-xs text-muted-foreground">Z1</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-3 rounded-full bg-[#3b82f6]" />
          <Text className="text-xs text-muted-foreground">Z2</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-3 rounded-full bg-[#10b981]" />
          <Text className="text-xs text-muted-foreground">Z3</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-3 rounded-full bg-[#f59e0b]" />
          <Text className="text-xs text-muted-foreground">Z4</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-3 rounded-full bg-[#ef4444]" />
          <Text className="text-xs text-muted-foreground">Z5</Text>
        </View>
      </View>
    </View>
  );
}
```

---

## 5. Auto-Start and Auto-Pause

### What Auuki Does

Auuki implements intelligent **auto-start** and **auto-pause** features:

**Auto-Start:**
```javascript
// From watch.js
if (power > POWER_THRESHOLD && !isStarted) {
  startCountdown(); // 3-2-1 countdown
  setTimeout(() => {
    start(); // Begin workout
  }, 3000);
}
```

**Auto-Pause:**
```javascript
if (power === 0 && isStarted && !isPaused) {
  setTimeout(() => {
    if (power === 0) { // Still zero after 4 seconds
      pause();
    }
  }, 4000);
}

if (power > POWER_THRESHOLD && isPaused) {
  resume();
}
```

**Settings:**
- User can enable/disable auto-start
- User can enable/disable auto-pause
- Auto-pause automatically disabled for "Test" category workouts (e.g., FTP tests)

### Implementation for GradientPeak

#### Auto-Start/Pause Logic

```typescript
// apps/mobile/lib/services/ActivityRecorder/index.ts

class ActivityRecorderService extends EventEmitter {
  private autoStartThreshold = 40; // watts
  private autoPauseDelay = 4000; // ms
  private autoPauseTimer?: NodeJS.Timeout;
  private autoStartTimer?: NodeJS.Timeout;
  private autoStartCountdown = 0;
  
  private settings = {
    autoStart: true,
    autoPause: true,
  };
  
  // Call this when new power data arrives
  private handlePowerUpdate(power: number) {
    // Auto-start logic
    if (
      this.settings.autoStart &&
      this.state === 'pending' &&
      power > this.autoStartThreshold
    ) {
      this.triggerAutoStart();
    }
    
    // Auto-pause logic
    if (this.settings.autoPause && this.state === 'recording') {
      if (power === 0) {
        this.scheduleAutoPause();
      } else {
        this.cancelAutoPause();
      }
    }
    
    // Auto-resume logic
    if (
      this.settings.autoPause &&
      this.state === 'paused' &&
      power > this.autoStartThreshold
    ) {
      this.resumeRecording();
    }
  }
  
  private triggerAutoStart() {
    if (this.autoStartTimer) return;
    
    this.autoStartCountdown = 3;
    this.emit('autoStartCountdown', 3);
    
    const countdownInterval = setInterval(() => {
      this.autoStartCountdown--;
      this.emit('autoStartCountdown', this.autoStartCountdown);
      
      if (this.autoStartCountdown === 0) {
        clearInterval(countdownInterval);
        this.startRecording();
      }
    }, 1000);
    
    this.autoStartTimer = countdownInterval;
  }
  
  private scheduleAutoPause() {
    if (this.autoPauseTimer) return;
    
    this.autoPauseTimer = setTimeout(() => {
      this.pauseRecording();
      this.emit('autoPaused');
    }, this.autoPauseDelay);
  }
  
  private cancelAutoPause() {
    if (this.autoPauseTimer) {
      clearTimeout(this.autoPauseTimer);
      this.autoPauseTimer = undefined;
    }
  }
}
```

#### Settings UI

```typescript
// apps/mobile/components/RecordingSettings.tsx

export function RecordingSettings({ service }) {
  const [autoStart, setAutoStart] = useState(true);
  const [autoPause, setAutoPause] = useState(true);
  
  return (
    <View className="bg-card rounded-lg p-4">
      <Text className="text-sm font-medium text-foreground mb-4">
        Recording Settings
      </Text>
      
      <View className="space-y-3">
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-sm text-foreground">Auto-Start</Text>
            <Text className="text-xs text-muted-foreground">
              Start recording when power exceeds 40W
            </Text>
          </View>
          <Switch value={autoStart} onValueChange={setAutoStart} />
        </View>
        
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-sm text-foreground">Auto-Pause</Text>
            <Text className="text-xs text-muted-foreground">
              Pause when power drops to 0W for 4+ seconds
            </Text>
          </View>
          <Switch value={autoPause} onValueChange={setAutoPause} />
        </View>
      </View>
    </View>
  );
}
```

#### Countdown Overlay

```typescript
// apps/mobile/components/AutoStartCountdown.tsx

import { View, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface Props {
  countdown: number;
  visible: boolean;
}

export function AutoStartCountdown({ countdown, visible }: Props) {
  if (!visible || countdown === 0) return null;
  
  return (
    <Animated.View 
      entering={FadeIn}
      exiting={FadeOut}
      className="absolute inset-0 bg-black/50 items-center justify-center"
    >
      <View className="bg-card rounded-2xl p-8 items-center">
        <Text className="text-6xl font-bold text-primary mb-2">
          {countdown}
        </Text>
        <Text className="text-sm text-muted-foreground">
          Starting workout...
        </Text>
      </View>
    </Animated.View>
  );
}
```

---

## 6. Target vs. Actual Display

### What Auuki Does

Auuki shows both **target** and **actual** values side-by-side for key metrics:

```html
<data-tile class="tile-power">
    <div class="tile-primary">248 W</div>
    <div class="tile-secondary">Target: 250 W</div>
</data-tile>
```

Color coding:
- Green: Within 5% of target
- Yellow: Within 10% of target
- Red: More than 10% off target

### Implementation for GradientPeak

#### Target Tracking Tile

```typescript
// apps/mobile/components/TargetTrackingTile.tsx

import { View, Text } from 'react-native';

interface Props {
  metric: 'power' | 'heartRate' | 'cadence';
  actual: number;
  target?: number;
  unit: string;
  tolerance?: number; // percentage (default 5%)
}

export function TargetTrackingTile({ 
  metric, 
  actual, 
  target, 
  unit,
  tolerance = 5 
}: Props) {
  const getStatusColor = () => {
    if (!target) return 'text-foreground';
    
    const difference = Math.abs(actual - target);
    const percentDiff = (difference / target) * 100;
    
    if (percentDiff <= tolerance) return 'text-green-500';
    if (percentDiff <= tolerance * 2) return 'text-yellow-500';
    return 'text-red-500';
  };
  
  const getLabel = () => {
    const labels = {
      power: 'Power',
      heartRate: 'Heart Rate',
      cadence: 'Cadence',
    };
    return labels[metric];
  };
  
  return (
    <View className="bg-card rounded-lg p-4">
      <Text className="text-xs text-muted-foreground mb-1">
        {getLabel()}
      </Text>
      
      <Text className={`text-4xl font-bold ${getStatusColor()}`}>
        {actual}
        <Text className="text-lg"> {unit}</Text>
      </Text>
      
      {target && (
        <View className="flex-row items-center gap-2 mt-2">
          <View className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <View 
              className={`h-full ${getStatusColor().replace('text', 'bg')}`}
              style={{ width: `${Math.min((actual / target) * 100, 100)}%` }}
            />
          </View>
          <Text className="text-xs text-muted-foreground">
            Target: {target}{unit}
          </Text>
        </View>
      )}
    </View>
  );
}
```

---

## 7. Trainer Reset Button

### What Auuki Does

Auuki provides a **Reset** button in settings that sends the FTMS reset command:

```javascript
xf.sub('ui:trainer:reset', onTrainerReset, signal);

function onTrainerReset() {
  if (connectable.isConnected() && exists(connectable.services?.trainer?.reset)) {
    connectable.services.trainer.reset();
  }
}
```

This is useful when:
- Trainer is stuck in a weird state
- Switching between apps
- Starting a new workout type
- Troubleshooting connection issues

### Implementation for GradientPeak

```typescript
// In trainer settings or sensor management screen

<Button 
  onPress={async () => {
    await service.sensorsManager.ftmsController?.reset();
    Alert.alert('Trainer Reset', 'Your trainer has been reset to neutral state');
  }}
  variant="outline"
>
  Reset Trainer
</Button>
```

---

## 8. Usage Across Activity Types

### How These Features Apply to Different Scenarios

#### 1. Planned Workout (Structured Training)

**Features Used:**
- ✅ Mode selector (locked, auto-controlled)
- ✅ Target display (auto-updated per step)
- ✅ Workout graph (visual progress)
- ✅ Target vs. actual comparison
- ✅ Auto-start/pause (optional)
- ✅ Connection status

**User Experience:**
```
1. User selects "Sweet Spot Intervals" workout
2. Connects FTMS trainer
3. Mode locked to ERG (automatic)
4. Workout graph shows all intervals
5. Press "Start" (or auto-start kicks in)
6. Trainer automatically adjusts to each step's power target
7. User just pedals and maintains cadence
8. Graph shows progress through workout
9. Finish when done
```

#### 2. Quick Plan (Semi-Structured)

**Features Used:**
- ✅ Mode selector (unlocked, user choice)
- ✅ Target control (user sets targets)
- ⚠️ Workout graph (optional, if plan has structure)
- ✅ Target vs. actual comparison
- ✅ Auto-start/pause
- ✅ Connection status

**User Experience:**
```
1. User selects "Quick Plan" for 30-minute ride
2. Connects FTMS trainer
3. Chooses ERG mode manually
4. Sets initial power target (e.g., 200W)
5. Starts recording
6. Adjusts power target during ride as desired
7. Trainer responds to changes immediately
8. Finish when done
```

#### 3. Free Ride (No Plan)

**Features Used:**
- ✅ Mode selector (fully manual)
- ✅ Target control (full user control)
- ❌ Workout graph (no structure)
- ✅ Target vs. actual comparison
- ✅ Auto-start/pause
- ✅ Connection status

**User Experience:**
```
1. User selects "Indoor Ride" activity
2. Connects FTMS trainer
3. Chooses control mode (ERG/SIM/Resistance)
4. Sets initial target
5. Starts recording
6. Changes targets whenever desired
7. Mode lock prevents accidental switches
8. Finish when done
```

#### 4. Outdoor Activity

**Features Used:**
- ❌ All FTMS features hidden (no trainer)
- Standard GPS and sensor recording

**User Experience:**
```
No FTMS features displayed - normal outdoor recording
```

---

## Summary: Priority Implementation Order

### Phase 1: Essential Features (Weeks 1-2)

1. **Connection Status Component**
   - Shows trainer connection state
   - Displays device name and capabilities
   - Battery level monitoring

2. **Mode Selector**
   - Three-tab interface (ERG/Resistance/SIM)
   - Lock toggle for planned workouts
   - Clear visual feedback

3. **Target Control**
   - Increment/decrement buttons
   - Direct input
   - Range validation

### Phase 2: Enhanced UX (Weeks 3-4)

4. **Target vs. Actual Display**
   - Color-coded status
   - Progress bar
   - Clear deviation indicators

5. **Workout Graph**
   - Visual representation of plan structure
   - Current position marker
   - Zone-based coloring

### Phase 3: Intelligence (Weeks 5-6)

6. **Auto-Start/Pause**
   - Smart recording triggers
   - Countdown overlay
   - User settings

7. **Trainer Reset**
   - Settings option
   - Error recovery
   - Troubleshooting tool

---

## Key Takeaways

1. **Mode-Based Interface**: Clear separation between ERG, Resistance, and SIM modes helps users understand and control trainer behavior

2. **Visual Feedback**: Rich connection status, target displays, and workout graphs make FTMS control feel tangible and reliable

3. **Progressive Enhancement**: Features gracefully adapt to activity type (planned vs. unplanned, indoor vs. outdoor)

4. **User Control**: Even in automatic modes, users should have override capabilities and clear visibility into what's happening

5. **Intelligent Automation**: Auto-start/pause reduces friction while remaining user-controllable via settings

These patterns from Auuki represent battle-tested UX for FTMS trainer control and will significantly enhance GradientPeak's indoor training experience across all activity types.
