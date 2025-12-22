import { CARD_STYLES } from "@/components/RecordingCarousel/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useCurrentReadings, usePlan } from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { ControlMode } from "@/lib/services/ActivityRecorder/FTMSController";
import * as Haptics from "expo-haptics";
import {
  AlertCircle,
  Lock,
  Minus,
  Mountain,
  Plus,
  RefreshCw,
  Settings,
  TrendingUp,
  Unlock,
  Zap,
} from "lucide-react-native";
import { memo, useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";

// ================================
// Types
// ================================

interface TrainerControlCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

// Supported control modes (subset of ControlMode)
type SupportedControlMode =
  | ControlMode.ERG
  | ControlMode.SIM
  | ControlMode.RESISTANCE;

// Mode configuration for each control type
const MODE_CONFIG: Record<
  SupportedControlMode,
  {
    label: string;
    description: string;
    unit: string;
    increment: number;
    min: number;
    max: number;
    icon: typeof Zap;
    color: string;
  }
> = {
  [ControlMode.ERG]: {
    label: "ERG Mode",
    description: "Target Power (Watts)",
    unit: "W",
    increment: 5,
    min: 0,
    max: 600,
    icon: Zap,
    color: "text-yellow-500",
  },
  [ControlMode.SIM]: {
    label: "SIM Mode",
    description: "Target Grade",
    unit: "%",
    increment: 0.5,
    min: -10,
    max: 20,
    icon: Mountain,
    color: "text-green-500",
  },
  [ControlMode.RESISTANCE]: {
    label: "Resistance Mode",
    description: "Resistance Level",
    unit: "",
    increment: 1,
    min: 1,
    max: 20,
    icon: TrendingUp,
    color: "text-blue-500",
  },
};

// ================================
// Main Component
// ================================

export const TrainerControlCard = memo<TrainerControlCardProps>(
  ({ service, screenWidth }) => {
    // State
    const [currentMode, setCurrentMode] = useState<SupportedControlMode>(
      ControlMode.ERG,
    );
    const [targetValue, setTargetValue] = useState<number>(100);
    const [isLocked, setIsLocked] = useState<boolean>(false);
    const [isAutoMode, setIsAutoMode] = useState<boolean>(true);
    const [currentPower, setCurrentPower] = useState<number | undefined>();

    // Hold-to-repeat refs
    const holdTimerRef = useRef<number | null>(null);
    const repeatTimerRef = useRef<number | null>(null);
    const holdStartTimeRef = useRef<number>(0);
    const currentIntervalRef = useRef<number>(200); // Start interval

    // Hooks
    const trainer = service?.sensorsManager.getControllableTrainer();
    const hasPlan = usePlan(service).hasPlan;
    const currentStep = service?.currentStep;
    const current = useCurrentReadings(service);

    // Determine if this is a planned workout (has plan with targets)
    const isPlannedWorkout = hasPlan && !!currentStep?.targets;

    // Subscribe to power readings for ERG mode display
    useEffect(() => {
      if (!service) return undefined;

      const unsubscribe = service.sensorsManager.subscribe((reading) => {
        if (reading.metric === "power" && typeof reading.value === "number") {
          setCurrentPower(reading.value);
        }
      });

      return () => {
        unsubscribe();
      };
    }, [service]);

    // Handle mode change
    const handleModeChange = async (newMode: SupportedControlMode) => {
      if (isLocked) {
        Alert.alert(
          "Mode Locked",
          "Unlock the mode selector to change control modes",
        );
        return;
      }

      setCurrentMode(newMode);

      // Reset target to reasonable default for new mode
      if (newMode === ControlMode.ERG) setTargetValue(100);
      else if (newMode === ControlMode.SIM) setTargetValue(0);
      else if (newMode === ControlMode.RESISTANCE) setTargetValue(5);
    };

    // Adjust target value
    const adjustTarget = async (delta: number) => {
      if (!trainer || !service) return;

      const config = MODE_CONFIG[currentMode];
      const newValue = Math.max(
        config.min,
        Math.min(config.max, targetValue + delta),
      );

      setTargetValue(newValue);

      // Apply the change based on mode
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
        console.error("[TrainerControl] Failed to apply target:", error);
        Alert.alert("Error", "Failed to apply target to trainer");
      }
    };

    // Reset trainer
    const handleReset = async () => {
      if (!trainer || !service) return;

      Alert.alert(
        "Reset Trainer",
        "This will reset the trainer to its default state. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reset",
            style: "destructive",
            onPress: async () => {
              try {
                await service.sensorsManager.resetTrainerControl();
                Alert.alert("Success", "Trainer has been reset");
              } catch (error) {
                console.error("[TrainerControl] Failed to reset:", error);
                Alert.alert("Error", "Failed to reset trainer");
              }
            },
          },
        ],
      );
    };

    // Toggle between Auto and Manual mode
    const toggleAutoMode = (enabled: boolean) => {
      if (!service) return;

      setIsAutoMode(enabled);
      service.setManualControlMode(!enabled);

      if (!enabled) {
        // Switched to manual mode - user can now control freely
        console.log("[TrainerControl] Manual mode activated");
      } else {
        // Switched to auto mode - reapply plan targets
        console.log(
          "[TrainerControl] Auto mode activated - reapplying targets",
        );
      }
    };

    // Clean up timers
    const clearHoldTimers = () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (repeatTimerRef.current) {
        clearTimeout(repeatTimerRef.current);
        repeatTimerRef.current = null;
      }
    };

    // Calculate accelerated interval based on hold duration
    const calculateInterval = (holdDuration: number): number => {
      const INITIAL_INTERVAL = 200; // Start at 200ms
      const MIN_INTERVAL = 50; // Max speed at 50ms
      const ACCELERATION_TIME = 2000; // Reach max speed in 2 seconds

      if (holdDuration < INITIAL_INTERVAL) {
        return INITIAL_INTERVAL;
      }

      // Linear acceleration from INITIAL_INTERVAL to MIN_INTERVAL over ACCELERATION_TIME
      const progress = Math.min(
        (holdDuration - INITIAL_INTERVAL) / ACCELERATION_TIME,
        1,
      );
      return Math.round(
        INITIAL_INTERVAL - (INITIAL_INTERVAL - MIN_INTERVAL) * progress,
      );
    };

    // Repeat adjustment function with acceleration
    const repeatAdjustment = (delta: number) => {
      adjustTarget(delta);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const holdDuration = Date.now() - holdStartTimeRef.current;
      const nextInterval = calculateInterval(holdDuration);
      currentIntervalRef.current = nextInterval;

      // Schedule next repeat
      repeatTimerRef.current = setTimeout(() => {
        repeatAdjustment(delta);
      }, nextInterval);
    };

    // Handle press in (start hold-to-repeat)
    const handlePressIn = (delta: number) => {
      // Initial adjustment with medium haptic
      adjustTarget(delta);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Record start time for acceleration calculation
      holdStartTimeRef.current = Date.now();
      currentIntervalRef.current = 200;

      // Start hold timer (delay before repeat starts)
      holdTimerRef.current = setTimeout(() => {
        repeatAdjustment(delta);
      }, 400); // 400ms delay before repeat starts
    };

    // Handle press out (stop hold-to-repeat)
    const handlePressOut = () => {
      clearHoldTimers();
    };

    // Clean up on unmount
    useEffect(() => {
      return () => {
        clearHoldTimers();
      };
    }, []);

    // No trainer connected
    if (!trainer || !trainer.isControllable) {
      return (
        <View style={{ width: screenWidth }} className="flex-1 p-4">
          <Card className={CARD_STYLES.wrapper}>
            <CardContent className={CARD_STYLES.content}>
              {/* Header */}
              <View className={CARD_STYLES.header}>
                <View className="flex-row items-center">
                  <Icon
                    as={Settings}
                    size={CARD_STYLES.iconSize}
                    className="text-muted-foreground mr-2"
                  />
                  <Text className="text-lg font-semibold">Trainer Control</Text>
                </View>
              </View>

              {/* No Trainer Message */}
              <View className="flex-1 items-center justify-center gap-4 py-8">
                <View className="w-16 h-16 bg-muted/20 rounded-full items-center justify-center">
                  <Icon
                    as={AlertCircle}
                    size={32}
                    className="text-muted-foreground"
                  />
                </View>
                <Text className="text-base font-medium text-center">
                  No Controllable Trainer
                </Text>
                <Text className="text-center text-sm text-muted-foreground px-8">
                  Connect an FTMS-capable smart trainer to access control
                  features
                </Text>
              </View>
            </CardContent>
          </Card>
        </View>
      );
    }

    // Get current mode config
    const config = MODE_CONFIG[currentMode];

    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className={CARD_STYLES.wrapper}>
          <CardContent className={CARD_STYLES.content}>
            {/* Header */}
            <View className={CARD_STYLES.header}>
              <View className="flex-row items-center">
                <Icon
                  as={Settings}
                  size={CARD_STYLES.iconSize}
                  className="text-primary mr-2"
                />
                <Text className="text-lg font-semibold">Trainer Control</Text>
              </View>
              <Text className="text-sm text-muted-foreground">
                {trainer.name}
              </Text>
            </View>

            <View className="gap-4">
              {/* Auto/Manual Mode Toggle (only for planned workouts) */}
              {isPlannedWorkout && (
                <View className="p-3 bg-muted/20 rounded-lg border border-muted/20">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold">
                        {isAutoMode ? "Auto Mode" : "Manual Mode"}
                      </Text>
                      <Text className="text-xs text-muted-foreground mt-0.5">
                        {isAutoMode
                          ? "Following workout plan targets"
                          : "Manual control override active"}
                      </Text>
                    </View>
                    <Switch
                      checked={isAutoMode}
                      onCheckedChange={toggleAutoMode}
                    />
                  </View>
                </View>
              )}

              {/* Mode Selector */}
              <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Control Mode
                  </Text>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setIsLocked(!isLocked)}
                  >
                    <Icon
                      as={isLocked ? Lock : Unlock}
                      size={14}
                      className={
                        isLocked ? "text-primary" : "text-muted-foreground"
                      }
                    />
                    <Text className="text-xs ml-1">
                      {isLocked ? "Locked" : "Unlocked"}
                    </Text>
                  </Button>
                </View>

                <View className="flex-row gap-2">
                  {(
                    [
                      ControlMode.ERG,
                      ControlMode.SIM,
                      ControlMode.RESISTANCE,
                    ] as const
                  ).map((mode) => {
                    const modeConfig =
                      MODE_CONFIG[mode as SupportedControlMode];
                    const isActive = currentMode === mode;

                    return (
                      <Button
                        key={mode}
                        variant={isActive ? "default" : "outline"}
                        onPress={() =>
                          handleModeChange(mode as SupportedControlMode)
                        }
                        className="flex-1"
                        disabled={isLocked || (isAutoMode && isPlannedWorkout)}
                      >
                        <Icon
                          as={modeConfig.icon}
                          size={16}
                          className={
                            isActive ? "text-background" : modeConfig.color
                          }
                        />
                        <Text
                          className={`text-xs ml-1 ${isActive ? "text-background" : ""}`}
                        >
                          {mode}
                        </Text>
                      </Button>
                    );
                  })}
                </View>
              </View>

              {/* Current Target Display for ERG Mode */}
              {currentMode === ControlMode.ERG && (
                <View className="gap-2">
                  <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Current vs Target
                  </Text>
                  <View className="flex-row gap-2">
                    {/* Current Power */}
                    <View className="flex-1 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                      <Text className="text-xs text-yellow-600 font-medium uppercase">
                        Current
                      </Text>
                      <Text className="text-2xl font-bold text-yellow-500 mt-1">
                        {currentPower !== undefined
                          ? Math.round(currentPower)
                          : "--"}
                      </Text>
                      <Text className="text-xs text-muted-foreground mt-0.5">
                        watts
                      </Text>
                    </View>

                    {/* Target Power */}
                    <View className="flex-1 p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <Text className="text-xs text-primary font-medium uppercase">
                        Target
                      </Text>
                      <Text className="text-2xl font-bold text-primary mt-1">
                        {Math.round(targetValue)}
                      </Text>
                      <Text className="text-xs text-muted-foreground mt-0.5">
                        watts
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Target Adjustment */}
              <View className="gap-2">
                <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {config.description}
                </Text>

                <View className="p-3 bg-muted/20 rounded-lg border border-muted/20">
                  {/* Current Value Display */}
                  <View className="items-center mb-3">
                    <Icon as={config.icon} size={28} className={config.color} />
                    <Text className="text-4xl font-bold mt-1.5">
                      {currentMode === ControlMode.SIM
                        ? targetValue.toFixed(1)
                        : Math.round(targetValue)}
                    </Text>
                    <Text className="text-sm text-muted-foreground mt-0.5">
                      {config.unit}
                    </Text>
                  </View>

                  {/* Adjustment Buttons */}
                  <View className="flex-row gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-12"
                      onPress={() => adjustTarget(-config.increment)}
                      onPressIn={() => handlePressIn(-config.increment)}
                      onPressOut={handlePressOut}
                      disabled={isAutoMode && isPlannedWorkout}
                    >
                      <Icon as={Minus} size={20} />
                      <Text className="ml-1.5 font-semibold text-sm">
                        {config.increment}
                      </Text>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-12"
                      onPress={() => adjustTarget(config.increment)}
                      onPressIn={() => handlePressIn(config.increment)}
                      onPressOut={handlePressOut}
                      disabled={isAutoMode && isPlannedWorkout}
                    >
                      <Icon as={Plus} size={20} />
                      <Text className="ml-1.5 font-semibold text-sm">
                        {config.increment}
                      </Text>
                    </Button>
                  </View>

                  {/* Quick Adjustment Presets (for ERG mode) */}
                  {currentMode === ControlMode.ERG && (
                    <View className="flex-row gap-1.5 mt-2">
                      {[50, 100, 150, 200, 250].map((watts) => (
                        <Button
                          key={watts}
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-8"
                          onPress={() => {
                            setTargetValue(watts);
                            service?.sensorsManager.setPowerTarget(watts);
                          }}
                          disabled={isAutoMode && isPlannedWorkout}
                        >
                          <Text className="text-xs">{watts}W</Text>
                        </Button>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* Reset Trainer */}
              <Button
                variant="outline"
                onPress={handleReset}
                className="w-full"
              >
                <Icon as={RefreshCw} size={16} />
                <Text className="ml-2">Reset Trainer</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </View>
    );
  },
);

TrainerControlCard.displayName = "TrainerControlCard";
