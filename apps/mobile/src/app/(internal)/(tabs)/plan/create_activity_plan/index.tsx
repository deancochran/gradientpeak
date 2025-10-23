import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Play,
  Plus,
  Repeat,
  Save,
  Trash2,
  X,
} from "lucide-react-native";
import React, { memo, useCallback, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";

import {
  createActivityPlanSchema,
  intensityTypeEnum,
  repetitionSchema,
  stepSchema,
  type Duration,
  type Repetition,
  type Step,
  type StepOrRepetition as StructureItem,
  type IntensityTarget as Target,
} from "@repo/core";
import { z } from "zod";

// Types
type IntensityType = z.infer<typeof intensityTypeEnum>;

// Utilities
const generateId = () => Math.random().toString(36).substr(2, 9);

const DURATION_UNITS: Record<DurationType, string[]> = {
  time: ["seconds", "minutes"],
  distance: ["meters", "km"],
  repetitions: ["reps"],
  untilFinished: [],
};

// Step Dialog Component
const StepDialog = memo(({ visible, onSave, onClose, editItem }: any) => {
  const [stepData, setStepData] = useState<Partial<Step>>(
    editItem || {
      name: "",
      duration: { type: "time", value: 5, unit: "minutes" },
      targets: [{ type: "%FTP", intensity: 65 }],
    },
  );

  const handleSave = () => {
    const dataToSave = {
      ...stepData,
      id: stepData.id || generateId(),
      type: "step",
    };

    const result = stepSchema.safeParse(dataToSave);

    if (!result.success) {
      console.error("Validation errors:", result.error.flatten());
      return;
    }
    onSave(result.data);
  };

  const updateDuration = (field: string, value: any) => {
    if (value === "untilFinished") {
      setStepData((prev) => ({ ...prev, duration: "untilFinished" }));
    } else if (field === "type") {
      const units = DURATION_UNITS[value as DurationType];
      setStepData((prev) => ({
        ...prev,
        duration: { type: value, value: 5, unit: units[0] },
      }));
    } else {
      setStepData((prev) => ({
        ...prev,
        duration: { ...(prev.duration as Duration), [field]: value },
      }));
    }
  };

  const addTarget = () => {
    setStepData((prev) => ({
      ...prev,
      targets: [...(prev.targets || []), { type: "%FTP", intensity: 65 }],
    }));
  };

  const updateTarget = (index: number, field: string, value: any) => {
    setStepData((prev) => ({
      ...prev,
      targets: prev.targets?.map((t, i) =>
        i === index ? { ...t, [field]: value } : t,
      ),
    }));
  };

  const removeTarget = (index: number) => {
    setStepData((prev) => ({
      ...prev,
      targets: prev.targets?.filter((_, i) => i !== index),
    }));
  };

  const duration =
    stepData.duration !== "untilFinished" ? stepData.duration : null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-background rounded-t-3xl max-h-[90%]">
          <View className="border-b border-border px-4 py-4 flex-row items-center justify-between">
            <Text className="font-semibold text-lg">
              {editItem ? "Edit Step" : "Add Step"}
            </Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Icon as={X} size={20} />
            </TouchableOpacity>
          </View>

          <ScrollView className="px-4 py-4">
            <View className="gap-4">
              <View>
                <Label>Step Name</Label>
                <Input
                  value={stepData.name || ""}
                  onChangeText={(text) =>
                    setStepData((prev) => ({ ...prev, name: text }))
                  }
                  placeholder="e.g., Warm-up"
                />
              </View>

              <View>
                <Label>Duration Type</Label>
                <Select
                  value={
                    stepData.duration === "untilFinished"
                      ? "untilFinished"
                      : duration?.type
                  }
                  onValueChange={(value) => updateDuration("type", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time" label="Time-based">
                      <Text>Time-based</Text>
                    </SelectItem>
                    <SelectItem value="distance" label="Distance-based">
                      <Text>Distance-based</Text>
                    </SelectItem>
                    <SelectItem value="repetitions" label="Rep-based">
                      <Text>Rep-based</Text>
                    </SelectItem>
                    <SelectItem value="untilFinished" label="Until Finished">
                      <Text>Until Finished</Text>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </View>

              {duration && (
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Label>Value</Label>
                    <Input
                      value={duration.value.toString()}
                      onChangeText={(text) =>
                        updateDuration("value", parseFloat(text) || 0)
                      }
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="w-32">
                    <Label>Unit</Label>
                    <Select
                      value={duration.unit}
                      onValueChange={(value) => updateDuration("unit", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_UNITS[duration.type].map((u) => (
                          <SelectItem key={u} value={u} label={u}>
                            <Text>{u}</Text>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </View>
                </View>
              )}

              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Label>Targets</Label>
                  <TouchableOpacity
                    onPress={addTarget}
                    disabled={(stepData.targets?.length || 0) >= 5}
                    className="p-1"
                  >
                    <Icon
                      as={Plus}
                      size={16}
                      className={
                        (stepData.targets?.length || 0) >= 5
                          ? "text-muted"
                          : "text-primary"
                      }
                    />
                  </TouchableOpacity>
                </View>
                {stepData.targets?.map((target, i) => (
                  <View key={i} className="flex-row gap-2 items-center mb-2">
                    <View className="flex-1">
                      <Select
                        value={target.type}
                        onValueChange={(type) => updateTarget(i, "type", type)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="%FTP" label="% FTP">
                            <Text>% FTP</Text>
                          </SelectItem>
                          <SelectItem value="%MaxHR" label="% Max HR">
                            <Text>% Max HR</Text>
                          </SelectItem>
                          <SelectItem value="watts" label="Watts">
                            <Text>Watts</Text>
                          </SelectItem>
                          <SelectItem value="bpm" label="BPM">
                            <Text>BPM</Text>
                          </SelectItem>
                          <SelectItem value="RPE" label="RPE">
                            <Text>RPE</Text>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </View>
                    <Input
                      value={target.intensity.toString()}
                      onChangeText={(text) =>
                        updateTarget(i, "intensity", parseFloat(text) || 0)
                      }
                      keyboardType="numeric"
                      className="w-20"
                    />
                    <TouchableOpacity
                      onPress={() => removeTarget(i)}
                      className="p-1"
                    >
                      <Icon
                        as={Trash2}
                        size={16}
                        className="text-destructive"
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View className="border-t border-border px-4 py-3 flex-row gap-2">
            <Button variant="outline" onPress={onClose} className="flex-1">
              <Text>Cancel</Text>
            </Button>
            <Button onPress={handleSave} className="flex-1">
              <Text className="text-primary-foreground">
                {editItem ? "Update" : "Add"}
              </Text>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
});

// Repetition Dialog Component
const RepetitionDialog = memo(({ visible, onSave, onClose, editItem }: any) => {
  const [repData, setRepData] = useState<Partial<Repetition>>(
    editItem || {
      repeat: 3,
      steps: [],
    },
  );
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [editingStep, setEditingStep] = useState<{
    step: Step;
    index: number;
  } | null>(null);

  const handleSave = () => {
    const dataToSave = {
      ...repData,
      id: repData.id || generateId(),
      type: "repetition",
    };

    const result = repetitionSchema.safeParse(dataToSave);

    if (!result.success) {
      console.error("Validation errors:", result.error.flatten());
      return;
    }
    onSave(result.data);
  };

  const handleStepSave = (step: Step) => {
    if (editingStep) {
      setRepData((prev) => ({
        ...prev,
        steps: prev.steps?.map((s, i) => (i === editingStep.index ? step : s)),
      }));
      setEditingStep(null);
    } else {
      setRepData((prev) => ({
        ...prev,
        steps: [...(prev.steps || []), step],
      }));
    }
    setShowStepDialog(false);
  };

  const removeStep = (index: number) => {
    setRepData((prev) => ({
      ...prev,
      steps: prev.steps?.filter((_, i) => i !== index),
    }));
  };

  const editStep = (step: Step, index: number) => {
    setEditingStep({ step, index });
    setShowStepDialog(true);
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl max-h-[90%]">
            <View className="border-b border-border px-4 py-4 flex-row items-center justify-between">
              <Text className="font-semibold text-lg">
                {editItem ? "Edit Repetition" : "Add Repetition"}
              </Text>
              <TouchableOpacity onPress={onClose} className="p-1">
                <Icon as={X} size={20} />
              </TouchableOpacity>
            </View>

            <ScrollView className="px-4 py-4">
              <View className="gap-4">
                <View>
                  <Label>Repeat Count</Label>
                  <Input
                    value={repData.repeat?.toString()}
                    onChangeText={(text) =>
                      setRepData((prev) => ({
                        ...prev,
                        repeat: parseInt(text) || 1,
                      }))
                    }
                    keyboardType="numeric"
                  />
                </View>

                <View>
                  <View className="flex-row items-center justify-between mb-2">
                    <Label>Steps</Label>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingStep(null);
                        setShowStepDialog(true);
                      }}
                      className="px-3 py-1 bg-primary/10 rounded"
                    >
                      <Text className="text-primary text-sm">Add Step</Text>
                    </TouchableOpacity>
                  </View>
                  {repData.steps?.map((step, i) => (
                    <View
                      key={step.id}
                      className="flex-row items-center gap-2 p-3 border border-border rounded-lg mb-2 bg-muted/30"
                    >
                      <Icon
                        as={Play}
                        size={14}
                        className="text-muted-foreground"
                      />
                      <Text className="flex-1 font-medium text-sm">
                        {step.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => editStep(step, i)}
                        className="px-2 py-1"
                      >
                        <Text className="text-xs">Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => removeStep(i)}
                        className="p-1"
                      >
                        <Icon
                          as={Trash2}
                          size={14}
                          className="text-destructive"
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {!repData.steps?.length && (
                    <Text className="text-muted-foreground text-center py-4">
                      No steps added yet
                    </Text>
                  )}
                </View>
              </View>
            </ScrollView>

            <View className="border-t border-border px-4 py-3 flex-row gap-2">
              <Button variant="outline" onPress={onClose} className="flex-1">
                <Text>Cancel</Text>
              </Button>
              <Button onPress={handleSave} className="flex-1">
                <Text className="text-primary-foreground">
                  {editItem ? "Update" : "Add"}
                </Text>
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <StepDialog
        visible={showStepDialog}
        onSave={handleStepSave}
        onClose={() => {
          setShowStepDialog(false);
          setEditingStep(null);
        }}
        editItem={editingStep?.step}
      />
    </>
  );
});

// Structure Item Component
const StructureItem = memo(
  ({ item, onEdit, onDelete, drag, isActive }: any) => {
    const [isExpanded, setIsExpanded] = useState(true);

    if (item.type === "step") {
      const duration = item.duration !== "untilFinished" ? item.duration : null;
      const durationText = duration
        ? `${duration.value} ${duration.unit}`
        : "Until Finished";

      return (
        <Card className={`mb-2 ${isActive ? "opacity-70" : ""}`}>
          <CardContent className="p-3">
            <View className="flex-row items-start gap-3">
              <TouchableOpacity onLongPress={drag} className="pt-1">
                <Icon
                  as={GripVertical}
                  size={16}
                  className="text-muted-foreground"
                />
              </TouchableOpacity>
              <Icon as={Play} size={16} className="text-primary pt-1" />
              <View className="flex-1 min-w-0">
                <Text className="font-medium text-sm">{item.name}</Text>
                <Text className="text-xs text-muted-foreground mt-1">
                  {durationText}
                </Text>
                {item.targets?.length > 0 && (
                  <View className="flex-row flex-wrap gap-1 mt-2">
                    {item.targets.map((t: Target, i: number) => (
                      <View
                        key={i}
                        className="px-2 py-0.5 bg-primary/10 rounded"
                      >
                        <Text className="text-primary text-xs">
                          {t.type}: {t.intensity}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View className="flex-row gap-1">
                <TouchableOpacity onPress={onEdit} className="p-1.5">
                  <Icon
                    as={Play}
                    size={14}
                    className="text-foreground"
                    style={{ transform: [{ rotate: "90deg" }] }}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={onDelete} className="p-1.5">
                  <Icon as={Trash2} size={14} className="text-destructive" />
                </TouchableOpacity>
              </View>
            </View>
          </CardContent>
        </Card>
      );
    }

    // Repetition
    return (
      <Card
        className={`mb-2 bg-primary/5 border-primary/30 ${isActive ? "opacity-70" : ""}`}
      >
        <CardContent className="p-3">
          <View className="flex-row items-start gap-3">
            <TouchableOpacity onLongPress={drag} className="pt-1">
              <Icon
                as={GripVertical}
                size={16}
                className="text-muted-foreground"
              />
            </TouchableOpacity>
            <Icon as={Repeat} size={16} className="text-primary pt-1" />
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2">
                <Text className="font-medium text-sm">
                  Repeat {item.repeat}x
                </Text>
                <TouchableOpacity
                  onPress={() => setIsExpanded(!isExpanded)}
                  className="p-0.5"
                >
                  <Icon as={isExpanded ? ChevronUp : ChevronDown} size={14} />
                </TouchableOpacity>
              </View>
              {isExpanded && (
                <View className="mt-2 pl-3 border-l-2 border-primary/30 gap-1.5">
                  {item.steps.map((step: Step) => {
                    const duration =
                      step.duration !== "untilFinished" ? step.duration : null;
                    return (
                      <View key={step.id}>
                        <Text className="font-medium text-xs">{step.name}</Text>
                        <Text className="text-muted-foreground text-xs">
                          {duration
                            ? `${duration.value} ${duration.unit}`
                            : "Until Finished"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            <View className="flex-row gap-1">
              <TouchableOpacity onPress={onEdit} className="p-1.5">
                <Icon
                  as={Play}
                  size={14}
                  style={{ transform: [{ rotate: "90deg" }] }}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete} className="p-1.5">
                <Icon as={Trash2} size={14} className="text-destructive" />
              </TouchableOpacity>
            </View>
          </View>
        </CardContent>
      </Card>
    );
  },
);

// Main Component
export default function WorkoutPlanCreator() {
  const [name, setName] = useState("New Workout Plan");
  const [activityType, setActivityType] = useState("outdoor_run");
  const [estimatedDuration, setEstimatedDuration] = useState(30);
  const [structure, setStructure] = useState<StructureItem[]>([]);

  const [showStepDialog, setShowStepDialog] = useState(false);
  const [showRepDialog, setShowRepDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    item: StructureItem;
    index: number;
  } | null>(null);

  const handleSave = useCallback(() => {
    const data = {
      name,
      activity_type: activityType,
      estimated_duration: estimatedDuration,
      structure: { steps: structure },
    };

    const result = createActivityPlanSchema.safeParse(data);
    if (!result.success) {
      console.error("Validation errors:", result.error.flatten());
      return;
    }

    Alert.alert("Success", "Workout plan saved!");
    console.log("Saving:", result.data);
  }, [name, activityType, estimatedDuration, structure]);

  const handleStepSave = useCallback(
    (step: Step) => {
      if (editingItem) {
        setStructure((prev) =>
          prev.map((item, i) => (i === editingItem.index ? step : item)),
        );
        setEditingItem(null);
      } else {
        setStructure((prev) => [...prev, step]);
      }
      setShowStepDialog(false);
    },
    [editingItem],
  );

  const handleRepSave = useCallback(
    (rep: Repetition) => {
      if (editingItem) {
        setStructure((prev) =>
          prev.map((item, i) => (i === editingItem.index ? rep : item)),
        );
        setEditingItem(null);
      } else {
        setStructure((prev) => [...prev, rep]);
      }
      setShowRepDialog(false);
    },
    [editingItem],
  );

  const handleDelete = useCallback((index: number) => {
    setStructure((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleEdit = useCallback((item: StructureItem, index: number) => {
    setEditingItem({ item, index });
    if (item.type === "step") {
      setShowStepDialog(true);
    } else {
      setShowRepDialog(true);
    }
  }, []);

  const closeDialog = useCallback(() => {
    setShowStepDialog(false);
    setShowRepDialog(false);
    setEditingItem(null);
  }, []);

  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<StructureItem>) => {
      const index = getIndex();
      return (
        <StructureItem
          item={item}
          onEdit={() => handleEdit(item, index!)}
          onDelete={() => handleDelete(index!)}
          drag={drag}
          isActive={isActive}
        />
      );
    },
    [handleEdit, handleDelete],
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-card border-b border-border px-4 py-3">
        <View className="flex-row items-center gap-3">
          <Button variant="ghost" onPress={() => {}} className="px-3">
            <Text>Cancel</Text>
          </Button>
          <TextInput
            value={name}
            onChangeText={setName}
            className="flex-1 text-lg font-semibold text-foreground"
            placeholder="Workout name"
          />
          <Button onPress={handleSave} className="px-3">
            <Icon as={Save} size={16} className="text-primary-foreground" />
          </Button>
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="p-4">
          {/* Metadata */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Label className="text-xs mb-1">Activity Type</Label>
                  <Select value={activityType} onValueChange={setActivityType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outdoor_run" label="Outdoor Run">
                        <Text>Outdoor Run</Text>
                      </SelectItem>
                      <SelectItem value="outdoor_bike" label="Outdoor Bike">
                        <Text>Outdoor Bike</Text>
                      </SelectItem>
                      <SelectItem value="indoor_treadmill" label="Treadmill">
                        <Text>Treadmill</Text>
                      </SelectItem>
                      <SelectItem
                        value="indoor_bike_trainer"
                        label="Bike Trainer"
                      >
                        <Text>Bike Trainer</Text>
                      </SelectItem>
                      <SelectItem value="indoor_strength" label="Strength">
                        <Text>Strength</Text>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </View>
                <View className="flex-1">
                  <Label className="text-xs mb-1">Duration (min)</Label>
                  <Input
                    value={estimatedDuration.toString()}
                    onChangeText={(text) =>
                      setEstimatedDuration(parseInt(text) || 0)
                    }
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </CardContent>
          </Card>

          {/* Structure */}
          <Card>
            <CardContent className="p-4">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="font-semibold">Workout Structure</Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setEditingItem(null);
                      setShowStepDialog(true);
                    }}
                    className="px-3 py-1.5 bg-primary/10 rounded-md flex-row items-center gap-1"
                  >
                    <Icon as={Plus} size={14} className="text-primary" />
                    <Text className="text-primary text-sm">Step</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingItem(null);
                      setShowRepDialog(true);
                    }}
                    className="px-3 py-1.5 bg-primary/10 rounded-md flex-row items-center gap-1"
                  >
                    <Icon as={Repeat} size={14} className="text-primary" />
                    <Text className="text-primary text-sm">Rep</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {structure.length === 0 ? (
                <View className="py-12 items-center">
                  <Text className="text-muted-foreground mb-2">
                    No steps added yet
                  </Text>
                  <Text className="text-muted-foreground text-sm">
                    Tap Step or Rep to begin
                  </Text>
                </View>
              ) : (
                <DraggableFlatList
                  data={structure}
                  renderItem={renderItem}
                  keyExtractor={(item) => item.id}
                  onDragEnd={({ data }) => setStructure(data)}
                  scrollEnabled={false}
                />
              )}
            </CardContent>
          </Card>
        </View>
      </ScrollView>

      {/* Dialogs */}
      <StepDialog
        visible={showStepDialog}
        onSave={handleStepSave}
        onClose={closeDialog}
        editItem={editingItem?.item}
      />
      <RepetitionDialog
        visible={showRepDialog}
        onSave={handleRepSave}
        onClose={closeDialog}
        editItem={editingItem?.item}
      />
    </View>
  );
}
