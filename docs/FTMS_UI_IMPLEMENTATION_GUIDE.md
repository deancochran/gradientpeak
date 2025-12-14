# FTMS UI Implementation Guide for GradientPeak
## How Auuki's FTMS Features Fit Into Your Recording Architecture

**Date**: 2025-12-13  
**Status**: Implementation Ready

---

## Executive Summary

Your app already has:
- ✅ Complete FTMS backend (`FTMSController.ts`)
- ✅ Automatic plan-based trainer control (`ActivityRecorderService.ts:L462-L508`)
- ✅ Carousel-based recording UI with swipeable cards
- ✅ Clean card architecture with consistent styling (`CARD_STYLES`, `ANIMATIONS`)
- ✅ Event-driven service architecture with hooks (`useActivityRecorder`)
- ✅ Battery monitoring support (`SensorsManager.ts`)

**What's Missing**: User-facing UI controls to expose FTMS features you've already built.

This guide shows how to add FTMS UI features as **new carousel cards** and **enhanced sensor management**, following your existing patterns exactly.

---

## Your Recording Architecture Analysis

### 1. Current User Flow

```
Start Recording → Sensor Screen → Record Screen (Carousel) → Submit
                      ↓                    ↓
                  Connect FTMS      Dashboard/Plan/Map Cards
```

### 2. Your Existing Components

**Main Recording Screen** (`apps/mobile/app/(internal)/record/index.tsx`):
- Uses `RecordingCarousel` for swipeable metric cards
- Shows trainer control indicator banner when trainer connected
- Bottom navigation with Start/Pause/Resume/Finish + Bluetooth button
- Dynamic card configuration based on activity type and plan

**Carousel System** (`apps/mobile/components/RecordingCarousel/`):
- Card-based UI with infinite scrolling
- Each card is full-screen with consistent styling
- Cards enabled/disabled based on context (`isOutdoorActivity`, `hasPlan`)
- Standard card types: Dashboard, Plan, Map, Power, HeartRate, etc.

**Sensor Screen** (`apps/mobile/app/(internal)/record/sensors.tsx`):
- Device scanning and connection
- Shows connected sensors with battery levels
- "Control" badge for FTMS-capable trainers
- Clean list-based UI with connection actions

### 3. Your Service Architecture

```typescript
ActivityRecorderService
├── sensorsManager (SensorsManager)
│   ├── FTMS trainer detection (isControllable)
│   ├── FTMSController integration
│   └── Auto-apply plan targets (setupPlanTrainerIntegration)
├── liveMetricsManager (LiveMetricsManager)
├── locationManager
└── Event system (stateChanged, stepChanged, sensorsChanged, etc.)
```

**Key Pattern**: Your service automatically applies plan targets to trainers via events:
```typescript
// From ActivityRecorderService.ts:462-508
this.on("stepChanged", async ({ current }) => {
  if (!current || this.state !== "recording") return;
  const trainer = this.sensorsManager.getControllableTrainer();
  if (!trainer) return;
  await this.applyStepTargets(current);
});
```

---

## How Auuki Features Map to Your Architecture

### Implementation Strategy

We'll add FTMS features through:
1. **New Carousel Card**: "Trainer Control Card" - primary FTMS interface
2. **Enhanced Sensor Screen**: Mode selection and battery levels (already partially done)
3. **Dashboard Card Enhancement**: Show target vs actual
4. **Service Enhancement**: Manual control override system

### Why This Approach Works for You

✅ **Follows your patterns**: New card in carousel, consistent styling, event-driven  
✅ **Non-breaking**: Doesn't modify existing auto-control behavior  
✅ **Context-aware**: Only shows when trainer connected  
✅ **Activity-specific**: Different features for planned vs free ride  

---

## Implementation Plan

### Phase 1: Trainer Control Card (Primary FTMS Interface)

This is the main UI for FTMS control. Add as a new carousel card.

#### When to Show This Card

```typescript
// In apps/mobile/app/(internal)/record/index.tsx
const cardsConfig = useMemo((): Record<CarouselCardType, CarouselCardConfig> => {
  const config = createDefaultCardsConfig();
  
  // Enable map card for outdoor activities
  config.map.enabled = isOutdoorActivity;
  
  // Enable plan card when a plan is active
  config.plan.enabled = plan.hasPlan;
  
  // NEW: Enable trainer card when controllable trainer connected
  const hasControllableTrainer = service?.sensorsManager.getControllableTrainer() !== undefined;
  config.trainer.enabled = hasControllableTrainer;
  
  return config;
}, [isOutdoorActivity, plan.hasPlan, service, sensorCount]); // Add sensorCount to deps
```

#### Component Structure

**Location**: `apps/mobile/components/RecordingCarousel/cards/TrainerControlCard.tsx`

```typescript
import { CARD_STYLES, ANIMATIONS } from "@/components/RecordingCarousel/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { ActivityRecorderService, ControlMode } from "@/lib/services/ActivityRecorder";
import { Zap, Lock, Unlock, RotateCcw, ChevronUp, ChevronDown } from "lucide-react-native";
import React, { useState, useEffect, useCallback } from "react";
import { View, Alert } from "react-native";

interface TrainerControlCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

// Control mode configuration
const MODE_CONFIG = {
  [ControlMode.ERG]: {
    label: "ERG",
    description: "Power Target",
    unit: "W",
    increment: 10,
    min: 0,
    max: 1000,
    icon: Zap,
    color: "text-yellow-500",
  },
  [ControlMode.SIM]: {
    label: "Slope",
    description: "Grade",
    unit: "%",
    increment: 0.5,
    min: -10,
    max: 20,
    icon: Zap,
    color: "text-blue-500",
  },
  [ControlMode.RESISTANCE]: {
    label: "Resistance",
    description: "Level",
    unit: "",
    increment: 5,
    min: 0,
    max: 100,
    icon: Zap,
    color: "text-green-500",
  },
};

export const TrainerControlCard: React.FC<TrainerControlCardProps> = ({
  service,
  screenWidth,
}) => {
  const [currentMode, setCurrentMode] = useState<ControlMode>(ControlMode.ERG);
  const [targetValue, setTargetValue] = useState<number>(100);
  const [isLocked, setIsLocked] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [currentPower, setCurrentPower] = useState<number | undefined>();

  // Get trainer info
  const trainer = service?.sensorsManager.getControllableTrainer();
  const hasPlan = service?.hasPlan;
  const currentStep = service?.currentStep;

  // Determine if we're in a planned workout
  const isPlannedWorkout = hasPlan && currentStep;

  // Subscribe to sensor updates for current power
  useEffect(() => {
    if (!service) return;

    const unsubscribe = service.sensorsManager.subscribe((reading) => {
      if (reading.metric === "power" && typeof reading.value === "number") {
        setCurrentPower(reading.value);
      }
    });

    return unsubscribe;
  }, [service]);

  // Handle mode change
  const handleModeChange = useCallback(async (mode: ControlMode) => {
    if (isLocked) return;
    
    setCurrentMode(mode);
    
    // Reset to reasonable defaults
    if (mode === ControlMode.ERG) {
      setTargetValue(150);
    } else if (mode === ControlMode.SIM) {
      setTargetValue(0);
    } else {
      setTargetValue(50);
    }
    
    // Disable auto mode when manually changing modes
    setIsAutoMode(false);
  }, [isLocked]);

  // Handle target adjustment
  const adjustTarget = useCallback(async (delta: number) => {
    if (isLocked || isAutoMode) return;

    const config = MODE_CONFIG[currentMode];
    const newValue = Math.max(
      config.min,
      Math.min(config.max, targetValue + delta)
    );
    
    setTargetValue(newValue);

    // Apply to trainer
    if (!service) return;

    try {
      if (currentMode === ControlMode.ERG) {
        await service.sensorsManager.setPowerTarget(newValue);
      } else if (currentMode === ControlMode.SIM) {
        await service.sensorsManager.setSimulation({
          grade: newValue,
          windSpeed: 0,
          crr: 0.005,
          windResistance: 0.51,
        });
      } else if (currentMode === ControlMode.RESISTANCE) {
        await service.sensorsManager.setResistanceTarget(newValue);
      }
    } catch (error) {
      console.error("[TrainerCard] Failed to apply target:", error);
      Alert.alert("Control Error", "Failed to update trainer target");
    }
  }, [isLocked, isAutoMode, currentMode, targetValue, service]);

  // Handle reset
  const handleReset = useCallback(async () => {
    if (!service) return;

    Alert.alert(
      "Reset Trainer",
      "This will reset the trainer to neutral state. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            const trainer = service.sensorsManager.getControllableTrainer();
            if (trainer?.ftmsController) {
              await trainer.ftmsController.reset();
            }
          },
        },
      ]
    );
  }, [service]);

  // Toggle auto mode
  const toggleAutoMode = useCallback(() => {
    if (!hasPlan) {
      Alert.alert(
        "No Plan Active",
        "Auto mode requires an active workout plan. Switch to manual control to adjust targets yourself."
      );
      return;
    }
    setIsAutoMode(!isAutoMode);
  }, [hasPlan, isAutoMode]);

  if (!trainer) {
    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className={CARD_STYLES.wrapper}>
          <CardContent className={CARD_STYLES.content}>
            <View className="flex-1 items-center justify-center">
              <Icon as={Zap} size={48} className="text-muted-foreground/40 mb-4" />
              <Text className="text-lg font-semibold mb-2">No Trainer Connected</Text>
              <Text className="text-sm text-muted-foreground text-center">
                Connect a smart trainer to access control features
              </Text>
            </View>
          </CardContent>
        </Card>
      </View>
    );
  }

  const config = MODE_CONFIG[currentMode];

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className={CARD_STYLES.wrapper}>
        <CardContent className={CARD_STYLES.content}>
          {/* Header */}
          <View className={CARD_STYLES.header}>
            <View className="flex-row items-center justify-between w-full">
              <View className="flex-row items-center">
                <Icon
                  as={config.icon}
                  size={CARD_STYLES.iconSize}
                  className={config.color}
                />
                <Text className="text-lg font-semibold ml-2">Trainer Control</Text>
              </View>
              
              {/* Auto/Manual Toggle */}
              {isPlannedWorkout && (
                <Button
                  size="sm"
                  variant={isAutoMode ? "default" : "outline"}
                  onPress={toggleAutoMode}
                  className="h-8"
                >
                  <Text className="text-xs">
                    {isAutoMode ? "Auto" : "Manual"}
                  </Text>
                </Button>
              )}
            </View>
          </View>

          {/* Auto Mode Info */}
          {isAutoMode && isPlannedWorkout && (
            <View className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/20 mb-4">
              <Text className="text-sm text-blue-600 font-medium">
                Auto Mode Active
              </Text>
              <Text className="text-xs text-blue-600 mt-1">
                Trainer targets automatically set by workout plan. Switch to Manual to control directly.
              </Text>
            </View>
          )}

          {/* Mode Selector */}
          {!isAutoMode && (
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs font-semibold text-muted-foreground uppercase">
                  Control Mode
                </Text>
                <Button
                  size="icon"
                  variant="ghost"
                  onPress={() => setIsLocked(!isLocked)}
                  className="h-8 w-8"
                >
                  <Icon
                    as={isLocked ? Lock : Unlock}
                    size={16}
                    className={isLocked ? "text-red-500" : "text-muted-foreground"}
                  />
                </Button>
              </View>

              <View className="flex-row gap-2">
                {Object.entries(MODE_CONFIG).map(([mode, cfg]) => (
                  <Button
                    key={mode}
                    variant={currentMode === mode ? "default" : "outline"}
                    onPress={() => handleModeChange(mode as ControlMode)}
                    disabled={isLocked}
                    className="flex-1 h-14"
                  >
                    <View className="items-center">
                      <Text className="text-sm font-semibold">{cfg.label}</Text>
                      <Text className="text-xs opacity-70">{cfg.description}</Text>
                    </View>
                  </Button>
                ))}
              </View>
            </View>
          )}

          {/* Target Control */}
          <View className="mb-6">
            <Text className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              {isAutoMode ? "Current Target" : "Target Control"}
            </Text>
            
            <View className="bg-muted/20 p-6 rounded-lg">
              <View className="items-center mb-4">
                <Text className={`text-6xl font-bold ${config.color}`}>
                  {targetValue}
                </Text>
                <Text className="text-lg text-muted-foreground">
                  {config.unit}
                </Text>
              </View>

              {/* Increment/Decrement Buttons */}
              {!isAutoMode && (
                <View className="flex-row gap-3">
                  <Button
                    variant="outline"
                    onPress={() => adjustTarget(-config.increment)}
                    disabled={isLocked || isAutoMode}
                    className="flex-1 h-14"
                  >
                    <Icon as={ChevronDown} size={24} />
                    <Text className="ml-2 font-semibold">-{config.increment}</Text>
                  </Button>

                  <Button
                    variant="outline"
                    onPress={() => adjustTarget(config.increment)}
                    disabled={isLocked || isAutoMode}
                    className="flex-1 h-14"
                  >
                    <Icon as={ChevronUp} size={24} />
                    <Text className="ml-2 font-semibold">+{config.increment}</Text>
                  </Button>
                </View>
              )}
            </View>
          </View>

          {/* Current vs Target (ERG mode only) */}
          {currentMode === ControlMode.ERG && currentPower !== undefined && (
            <View className="mb-4">
              <Text className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Performance
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1 bg-muted/20 p-3 rounded-lg">
                  <Text className="text-xs text-muted-foreground mb-1">Current</Text>
                  <Text className="text-2xl font-bold">{Math.round(currentPower)}W</Text>
                </View>
                <View className="flex-1 bg-muted/20 p-3 rounded-lg">
                  <Text className="text-xs text-muted-foreground mb-1">Target</Text>
                  <Text className="text-2xl font-bold text-primary">{targetValue}W</Text>
                </View>
                <View className="flex-1 bg-muted/20 p-3 rounded-lg">
                  <Text className="text-xs text-muted-foreground mb-1">Delta</Text>
                  <Text 
                    className={`text-2xl font-bold ${
                      currentPower >= targetValue ? "text-green-500" : "text-orange-500"
                    }`}
                  >
                    {currentPower - targetValue > 0 ? "+" : ""}
                    {Math.round(currentPower - targetValue)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Reset Button */}
          <Button
            variant="outline"
            onPress={handleReset}
            className="w-full h-12"
          >
            <Icon as={RotateCcw} size={20} />
            <Text className="ml-2 font-medium">Reset Trainer</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
};
```

---

### Phase 2: Enhanced Sensor Screen

Your sensor screen already shows:
- ✅ Battery levels
- ✅ "Control" badge for FTMS trainers
- ✅ Connection management

**Enhancement needed**: Show control mode and current status for connected FTMS trainers.

#### Add to Sensor Screen

**Location**: `apps/mobile/app/(internal)/record/sensors.tsx:L268-L291` (in connected sensors section)

```typescript
// After the existing battery and control badge
{sensor.isControllable && (
  <View className="mt-2 pt-2 border-t border-border">
    <View className="flex-row items-center justify-between">
      <Text className="text-xs text-muted-foreground">Mode</Text>
      <Text className="text-xs font-medium">
        {(() => {
          const controller = (sensor as any).ftmsController;
          const mode = controller?.getCurrentMode();
          return mode ? mode.toUpperCase() : "Not Set";
        })()}
      </Text>
    </View>
  </View>
)}
```

---

### Phase 3: Service Enhancement - Manual Override System

Your service already does automatic plan-based control. We need to add a manual override system.

#### Add to ActivityRecorderService

**Location**: `apps/mobile/lib/services/ActivityRecorder/index.ts`

```typescript
// Add to class properties (around line 70)
private manualControlOverride: boolean = false;

// Add public method to enable/disable manual control
public setManualControlMode(enabled: boolean): void {
  this.manualControlOverride = enabled;
  console.log(`[Service] Manual control: ${enabled ? "enabled" : "disabled"}`);
  
  if (!enabled && this.state === "recording" && this.currentStep) {
    // Re-apply plan targets when switching back to auto
    this.applyStepTargets(this.currentStep);
  }
}

public isManualControlActive(): boolean {
  return this.manualControlOverride;
}

// Modify setupPlanTrainerIntegration to respect manual override (line 462)
private setupPlanTrainerIntegration(): void {
  this.on("stepChanged", async ({ current }) => {
    // Skip if manual control is active
    if (this.manualControlOverride) {
      console.log("[Service] Manual control active, skipping auto target");
      return;
    }
    
    if (!current || this.state !== "recording") return;
    const trainer = this.sensorsManager.getControllableTrainer();
    if (!trainer) return;

    console.log("[Service] Applying step targets:", current.name);
    await this.applyStepTargets(current);
  });

  this.on("stateChanged", async (state) => {
    // Skip if manual control is active
    if (this.manualControlOverride) return;
    
    if (state !== "recording") return;
    const step = this.currentStep;
    if (!step) return;

    const trainer = this.sensorsManager.getControllableTrainer();
    if (!trainer) return;

    console.log("[Service] Applying initial targets");
    await this.applyStepTargets(step);
  });
}
```

---

### Phase 4: Type Definitions

Add trainer card to carousel types.

**Location**: `apps/mobile/types/carousel.ts`

```typescript
export type CarouselCardType =
  | "dashboard"
  | "plan"
  | "map"
  | "power"
  | "heartRate"
  | "elevation"
  | "analysis"
  | "trainer"; // NEW

export function createDefaultCardsConfig(): Record<
  CarouselCardType,
  CarouselCardConfig
> {
  return {
    // ... existing cards
    trainer: {
      id: "trainer",
      label: "Trainer",
      enabled: false,
      order: 8, // After analysis
    },
  };
}
```

---

## Usage Scenarios: How Features Work Per Activity Type

### 1. Planned Workout (Structured Training)

**Default Behavior**: Auto mode enabled
- Service automatically applies power/grade targets from plan steps
- Trainer Control Card shows current target with "Auto Mode Active" banner
- User can switch to Manual mode to override temporarily
- When manual override disabled, service re-applies plan targets

**User Experience**:
```
1. Start planned workout
2. Trainer Control Card shows in carousel
3. Card displays "Auto Mode Active" banner
4. Target updates automatically as steps advance
5. User can tap "Manual" to adjust if needed
6. User can tap "Auto" to resume plan control
```

### 2. Quick Plan / Free Ride (No Plan)

**Default Behavior**: Manual mode (auto mode unavailable)
- User selects control mode (ERG/SIM/Resistance)
- User adjusts targets with +/- buttons
- Service sends control commands to trainer
- No plan integration

**User Experience**:
```
1. Start free ride
2. Trainer Control Card shows in carousel
3. Select ERG mode → Set 200W target
4. Adjust target during ride with buttons
5. Switch to SIM mode → Set 5% grade
```

### 3. Outdoor Activity

**Behavior**: Trainer Control Card hidden
- Card not shown in carousel (FTMS not useful outdoors)
- Sensor screen still shows connected trainer
- No automatic control

---

## Key Differences from Auuki

### What You DON'T Need

1. **Auto-start/Auto-pause**: You have manual Start/Pause buttons
2. **Workout graph in control card**: You already have this in EnhancedPlanCard
3. **Connection status in card**: You have dedicated sensor screen and banner
4. **Settings for auto features**: Not needed for your UX model

### What You're Adding

1. **Manual control UI**: For free ride activities
2. **Auto/Manual toggle**: For planned workouts
3. **Visual control mode selector**: Clear mode indication
4. **Target adjustment controls**: Simple +/- buttons

### Your Advantages

✅ **Better separation of concerns**: Dedicated sensor screen vs control in workout cards  
✅ **Cleaner UX**: Carousel cards for different metric views, not cluttered control panel  
✅ **Simpler state management**: Service already has event system, just add manual override flag  
✅ **Better plan integration**: Automatic target application already built  

---

## Implementation Priority

### Week 1: Core Functionality
1. Add `TrainerControlCard` component
2. Update carousel types and card config logic
3. Add manual override system to service
4. Test with planned workout

### Week 2: Polish & Edge Cases
1. Add mode lock toggle
2. Enhance sensor screen with mode display
3. Add error handling and user feedback
4. Test auto/manual mode switching

### Week 3: Testing & Refinement
1. Test across all activity types
2. Test mode transitions during active recording
3. Polish animations and transitions
4. Add user documentation

---

## Testing Checklist

### Planned Workout
- [ ] Auto mode enabled by default
- [ ] Targets update when step changes
- [ ] Manual mode can be enabled mid-workout
- [ ] Switching back to auto re-applies plan targets
- [ ] Lock toggle prevents accidental mode changes

### Free Ride
- [ ] Manual mode only (auto toggle hidden)
- [ ] All three modes work (ERG/SIM/Resistance)
- [ ] Target adjustments apply immediately
- [ ] Mode switching resets trainer correctly

### Sensor Management
- [ ] FTMS trainers show "Control" badge
- [ ] Battery levels display correctly
- [ ] Connection/disconnection handled gracefully
- [ ] Trainer Control Card appears/disappears when trainer connects/disconnects

### Edge Cases
- [ ] Switching modes during active recording
- [ ] Trainer disconnect during manual control
- [ ] App backgrounding during FTMS control
- [ ] Multiple recordings in same session

---

## Code Quality Checklist

✅ **Follows your patterns**: Uses `CARD_STYLES`, `ANIMATIONS`, Card/CardContent  
✅ **Event-driven**: Subscribes to service events, doesn't poll  
✅ **TypeScript**: Properly typed with interfaces  
✅ **Error handling**: Alert dialogs for user feedback  
✅ **Memoization**: Uses `useCallback` to prevent re-renders  
✅ **Cleanup**: Unsubscribes from events in `useEffect` cleanup  
✅ **Responsive**: Adapts to `screenWidth` prop like other cards  

---

## Summary

This implementation gives your users:

1. **Automatic control** for structured workouts (what you already built)
2. **Manual control** for free rides (new Trainer Control Card)
3. **Flexibility** to override auto mode during workouts
4. **Clear feedback** on current mode and targets
5. **Consistent UX** matching your existing carousel and card patterns

The best part: Your hardest work (FTMSController, auto-control integration) is already done. This is just exposing it through UI that matches your app's characteristic style.
