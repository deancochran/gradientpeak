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
    type Duration,
    type IntensityTarget,
    type Step
} from "@repo/core/schemas/activity_plan_structure";
import { Copy, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

interface StepEditSheetProps {
  isVisible: boolean;
  step: Step | null;
  stepIndex: number | null;
  onClose: () => void;
  onSave: (updatedStep: Step) => void;
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
  const [durationType, setDurationType] = useState<"time" | "distance" | "repetitions">("time");
  const [durationValue, setDurationValue] = useState("");
  const [durationUnit, setDurationUnit] = useState<"seconds" | "minutes" | "meters" | "km" | "reps">("minutes");

  // Target state
  const [targetType, setTargetType] = useState<string>("%FTP");
  const [targetIntensity, setTargetIntensity] = useState("");

  // Sync form with step prop
  useEffect(() => {
    if (step) {
      setName(step.name || "");
      setDescription(step.description || "");
      setNotes(step.notes || "");

      // Set duration
      if (step.duration && step.duration !== "untilFinished") {
        setDurationType(step.duration.type);
        setDurationValue(step.duration.value.toString());
        setDurationUnit(step.duration.unit);
      } else {
        setDurationType("time");
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

    const durationVal = parseFloat(durationValue);
    if (!durationValue || isNaN(durationVal) || durationVal <= 0) {
      Alert.alert("Validation Error", "Please enter a valid duration");
      return;
    }

    const intensityVal = parseFloat(targetIntensity);
    if (!targetIntensity || isNaN(intensityVal) || intensityVal <= 0) {
      Alert.alert("Validation Error", "Please enter a valid target intensity");
      return;
    }

    // Build duration object
    const duration: Duration = {
      type: durationType,
      value: durationVal,
      unit: durationUnit as any,
    };

    // Build target object
    const target: IntensityTargetV2 = {
      type: targetType as any,
      intensity: intensityVal,
    };

    // Build updated step
    const updatedStep: Step = {
      type: "step",
      name: name.trim(),
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
      duration,
      targets: [target],
    };

    onSave(updatedStep);
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Step",
      "Are you sure you want to delete this step?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: onDelete,
        },
      ],
    );
  };

  const handleDurationTypeChange = (type: string) => {
    const durType = type as "time" | "distance" | "repetitions";
    setDurationType(durType);

    // Auto-adjust unit based on type
    if (durType === "time") {
      setDurationUnit("minutes");
    } else if (durType === "distance") {
      setDurationUnit("km");
    } else if (durType === "repetitions") {
      setDurationUnit("reps");
    }
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
                <Select value={durationType} onValueChange={handleDurationTypeChange}>
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
                  </SelectContent>
                </Select>
              </View>

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
                  <Select value={durationUnit} onValueChange={(val) => setDurationUnit(val as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {durationType === "time" && (
                        <>
                          <SelectItem label="Minutes" value="minutes">
                            Minutes
                          </SelectItem>
                          <SelectItem label="Seconds" value="seconds">
                            Seconds
                          </SelectItem>
                        </>
                      )}
                      {durationType === "distance" && (
                        <>
                          <SelectItem label="Kilometers" value="km">
                            Kilometers
                          </SelectItem>
                          <SelectItem label="Meters" value="meters">
                            Meters
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
            </View>

            {/* Target Section */}
            <View className="gap-3 p-3 bg-muted/30 rounded-lg">
              <Text className="font-semibold">Target Intensity</Text>

              <View className="gap-2">
                <Label>Target Type</Label>
                <Select value={targetType} onValueChange={setTargetType}>
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
                    <SelectItem label="RPE (1-10)" value="RPE">
                      RPE (1-10)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </View>

              <View className="gap-2">
                <Label>Intensity Value *</Label>
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
                <Icon as={Trash2} size={16} className="text-destructive-foreground" />
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
