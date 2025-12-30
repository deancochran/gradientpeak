import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import {
  type DurationV2,
  type IntensityTargetV2,
  type PlanStepV2,
} from "@repo/core";
import { Copy, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

interface StepEditSheetProps {
  isVisible: boolean;
  step: PlanStepV2 | null;
  stepIndex: number | null;
  onClose: () => void;
  onSave: (updatedStep: PlanStepV2) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function StepEditSheet({
  isVisible,
  step,
  stepIndex,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
}: StepEditSheetProps) {
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  // Duration state
  const [durationType, setDurationType] = useState<
    "time" | "distance" | "repetitions" | "untilFinished"
  >("time");
  const [durationValue, setDurationValue] = useState("");
  const [durationUnit, setDurationUnit] = useState<
    "seconds" | "minutes" | "hours" | "meters" | "km"
  >("minutes");

  // Target state
  const [targetType, setTargetType] = useState<string>("%FTP");
  const [targetIntensity, setTargetIntensity] = useState("");

  // Sync form with step prop
  useEffect(() => {
    if (step) {
      setName(step.name || "");
      setDescription(step.description || "");
      setNotes(step.notes || "");

      // Set duration (V2 format)
      const duration = step.duration;
      setDurationType(duration.type);

      if (duration.type === "time") {
        // Convert seconds to appropriate unit
        if (duration.seconds >= 3600) {
          setDurationValue((duration.seconds / 3600).toString());
          setDurationUnit("hours");
        } else if (duration.seconds >= 60) {
          setDurationValue((duration.seconds / 60).toString());
          setDurationUnit("minutes");
        } else {
          setDurationValue(duration.seconds.toString());
          setDurationUnit("seconds");
        }
      } else if (duration.type === "distance") {
        // Convert meters to appropriate unit
        if (duration.meters >= 1000) {
          setDurationValue((duration.meters / 1000).toString());
          setDurationUnit("km");
        } else {
          setDurationValue(duration.meters.toString());
          setDurationUnit("meters");
        }
      } else if (duration.type === "repetitions") {
        setDurationValue(duration.count.toString());
        setDurationUnit("seconds"); // Placeholder, not used for reps
      } else if (duration.type === "untilFinished") {
        setDurationValue("");
        setDurationUnit("minutes");
      }

      // Set target
      if (step.targets && step.targets.length > 0) {
        const target = step.targets[0];
        setTargetType(target.type);
        setTargetIntensity(target.intensity.toString());
      } else {
        setTargetType("%FTP");
        setTargetIntensity("");
      }
    } else {
      // Reset for new step
      setName("");
      setDescription("");
      setNotes("");
      setDurationType("time");
      setDurationValue("");
      setDurationUnit("minutes");
      setTargetType("%FTP");
      setTargetIntensity("");
    }
  }, [step, isVisible]);

  const handleSave = () => {
    // Validation
    if (!name.trim()) {
      Alert.alert("Validation Error", "Please enter a step name");
      return;
    }

    // Build duration object (V2 format)
    let duration: DurationV2;

    if (durationType === "untilFinished") {
      duration = { type: "untilFinished" };
    } else {
      const durationVal = parseFloat(durationValue);
      if (!durationValue || isNaN(durationVal) || durationVal <= 0) {
        Alert.alert("Validation Error", "Please enter a valid duration");
        return;
      }

      if (durationType === "time") {
        // Convert to seconds
        let seconds = durationVal;
        if (durationUnit === "minutes") {
          seconds = durationVal * 60;
        } else if (durationUnit === "hours") {
          seconds = durationVal * 3600;
        }
        duration = { type: "time", seconds: Math.round(seconds) };
      } else if (durationType === "distance") {
        // Convert to meters
        let meters = durationVal;
        if (durationUnit === "km") {
          meters = durationVal * 1000;
        }
        duration = { type: "distance", meters: Math.round(meters) };
      } else if (durationType === "repetitions") {
        duration = { type: "repetitions", count: Math.round(durationVal) };
      } else {
        Alert.alert("Validation Error", "Invalid duration type");
        return;
      }
    }

    // Build target object (optional for V2)
    let targets: IntensityTargetV2[] | undefined;

    if (targetIntensity.trim()) {
      const intensityVal = parseFloat(targetIntensity);
      if (isNaN(intensityVal) || intensityVal <= 0) {
        Alert.alert(
          "Validation Error",
          "Please enter a valid target intensity",
        );
        return;
      }

      const target: IntensityTargetV2 = {
        type: targetType as any,
        intensity: intensityVal,
      };
      targets = [target];
    }

    // Build updated step (V2 format)
    const updatedStep: PlanStepV2 = {
      name: name.trim(),
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
      duration,
      targets,
      // Preserve existing metadata if editing
      segmentName: step?.segmentName,
      segmentIndex: step?.segmentIndex,
      originalRepetitionCount: step?.originalRepetitionCount,
    };

    onSave(updatedStep);
  };

  const handleDelete = () => {
    Alert.alert("Delete Step", "Are you sure you want to delete this step?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: onDelete,
      },
    ]);
  };

  const handleDurationTypeChange = (
    option: { value: string; label: string } | undefined,
  ) => {
    if (!option) return;
    const durType = option.value as
      | "time"
      | "distance"
      | "repetitions"
      | "untilFinished";
    setDurationType(durType);

    // Auto-adjust unit based on type
    if (durType === "time") {
      setDurationUnit("minutes");
    } else if (durType === "distance") {
      setDurationUnit("km");
    } else if (durType === "repetitions") {
      setDurationUnit("seconds"); // Placeholder
    } else if (durType === "untilFinished") {
      setDurationValue("");
      setDurationUnit("minutes");
    }
  };

  // Helper to convert durationType to Option
  const durationTypeOption = {
    value: durationType,
    label:
      durationType === "time"
        ? "Time"
        : durationType === "distance"
          ? "Distance"
          : durationType === "repetitions"
            ? "Repetitions"
            : "Until Finished",
  };

  // Helper to convert durationUnit to Option
  const durationUnitOption = {
    value: durationUnit,
    label:
      durationUnit === "seconds"
        ? "Seconds"
        : durationUnit === "minutes"
          ? "Minutes"
          : durationUnit === "hours"
            ? "Hours"
            : durationUnit === "meters"
              ? "Meters"
              : durationUnit === "km"
                ? "Kilometers"
                : "Reps",
  };

  // Helper to convert targetType to Option
  const targetTypeOption = {
    value: targetType,
    label:
      targetType === "%FTP"
        ? "% FTP (Power)"
        : targetType === "%MaxHR"
          ? "% Max HR"
          : targetType === "%ThresholdHR"
            ? "% Threshold HR"
            : targetType === "watts"
              ? "Watts"
              : targetType === "bpm"
                ? "BPM"
                : targetType === "speed"
                  ? "Speed (m/s)"
                  : targetType === "cadence"
                    ? "Cadence (rpm)"
                    : "RPE (1-10)",
  };

  return (
    <Dialog open={isVisible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-lg mx-4 max-h-[85%]">
        <DialogHeader>
          <DialogTitle>
            {step ? `Edit Step ${(stepIndex ?? 0) + 1}` : "Add New Step"}
          </DialogTitle>
          <DialogDescription>
            Configure the step duration and target intensity
          </DialogDescription>
        </DialogHeader>

        <ScrollView className="max-h-[500px]">
          <View className="flex flex-col gap-4 py-4">
            {/* Step Name */}
            <View className="gap-2">
              <Label>Step Name *</Label>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="e.g., Warm-up, Interval, Cool-down"
              />
            </View>

            {/* Description */}
            <View className="gap-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChangeText={setDescription}
                placeholder="Brief description of this step"
                numberOfLines={2}
              />
            </View>

            {/* Duration Section */}
            <View className="gap-3 p-3 bg-muted/30 rounded-lg">
              <Text className="font-semibold">Duration</Text>

              <View className="gap-2">
                <Label>Duration Type</Label>
                <Select
                  value={durationTypeOption}
                  onValueChange={handleDurationTypeChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem label="Time" value="time">
                      Time
                    </SelectItem>
                    <SelectItem label="Distance" value="distance">
                      Distance
                    </SelectItem>
                    <SelectItem label="Repetitions" value="repetitions">
                      Repetitions
                    </SelectItem>
                    <SelectItem label="Until Finished" value="untilFinished">
                      Until Finished
                    </SelectItem>
                  </SelectContent>
                </Select>
              </View>

              {durationType !== "untilFinished" && (
                <View className="flex-row gap-2">
                  <View className="flex-1 gap-2">
                    <Label>Value *</Label>
                    <Input
                      value={durationValue}
                      onChangeText={setDurationValue}
                      placeholder="e.g., 5"
                      keyboardType="numeric"
                    />
                  </View>

                  <View className="flex-1 gap-2">
                    <Label>Unit</Label>
                    <Select
                      value={durationUnitOption}
                      onValueChange={(option) =>
                        option && setDurationUnit(option.value as any)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {durationType === "time" && (
                          <>
                            <SelectItem label="Seconds" value="seconds">
                              Seconds
                            </SelectItem>
                            <SelectItem label="Minutes" value="minutes">
                              Minutes
                            </SelectItem>
                            <SelectItem label="Hours" value="hours">
                              Hours
                            </SelectItem>
                          </>
                        )}
                        {durationType === "distance" && (
                          <>
                            <SelectItem label="Meters" value="meters">
                              Meters
                            </SelectItem>
                            <SelectItem label="Kilometers" value="km">
                              Kilometers
                            </SelectItem>
                          </>
                        )}
                        {durationType === "repetitions" && (
                          <SelectItem label="Reps" value="reps">
                            Reps
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </View>
                </View>
              )}
            </View>

            {/* Target Section */}
            <View className="gap-3 p-3 bg-muted/30 rounded-lg">
              <Text className="font-semibold">Target Intensity (optional)</Text>

              <View className="gap-2">
                <Label>Target Type</Label>
                <Select
                  value={targetTypeOption}
                  onValueChange={(option) =>
                    option && setTargetType(option.value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select target type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem label="% FTP (Power)" value="%FTP">
                      % FTP (Power)
                    </SelectItem>
                    <SelectItem label="% Max HR" value="%MaxHR">
                      % Max HR
                    </SelectItem>
                    <SelectItem label="% Threshold HR" value="%ThresholdHR">
                      % Threshold HR
                    </SelectItem>
                    <SelectItem label="Watts" value="watts">
                      Watts
                    </SelectItem>
                    <SelectItem label="BPM" value="bpm">
                      BPM
                    </SelectItem>
                    <SelectItem label="Speed (m/s)" value="speed">
                      Speed (m/s)
                    </SelectItem>
                    <SelectItem label="Cadence (rpm)" value="cadence">
                      Cadence (rpm)
                    </SelectItem>
                    <SelectItem label="RPE (1-10)" value="RPE">
                      RPE (1-10)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </View>

              <View className="gap-2">
                <Label>Intensity Value</Label>
                <Input
                  value={targetIntensity}
                  onChangeText={setTargetIntensity}
                  placeholder={
                    targetType.includes("%")
                      ? "e.g., 85"
                      : targetType === "RPE"
                        ? "1-10"
                        : "e.g., 200"
                  }
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Notes */}
            <View className="gap-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional notes or instructions"
                numberOfLines={3}
              />
            </View>
          </View>
        </ScrollView>

        <DialogFooter className="flex flex-row gap-2">
          <Button variant="outline" onPress={onClose}>
            <Text>Cancel</Text>
          </Button>

          {step && (
            <>
              <Button variant="outline" onPress={onDuplicate}>
                <Icon as={Copy} size={16} className="text-foreground" />
                <Text>Duplicate</Text>
              </Button>

              <Button variant="destructive" onPress={handleDelete}>
                <Icon
                  as={Trash2}
                  size={16}
                  className="text-destructive-foreground"
                />
              </Button>
            </>
          )}

          <Button onPress={handleSave}>
            <Text className="text-primary-foreground">
              {step ? "Save Changes" : "Add Step"}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
