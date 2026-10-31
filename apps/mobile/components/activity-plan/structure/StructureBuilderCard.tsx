import type {
  ActivityPlanDraftItem,
  ActivityPlanDraftStep,
  ActivityTargetCategory,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { Text } from "@repo/ui/components/text";
import { Copy, GripVertical, Plus, Repeat2, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { NestableDraggableFlatList } from "react-native-draggable-flatlist";
import { ActivityPlanStepPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import type { ActivityPlanOperationResult } from "@/lib/stores/activityPlanCreation";

type Location = { repeatId?: string; index: number };

interface StructureBuilderCardProps {
  activityCategory: ActivityTargetCategory;
  items: ActivityPlanDraftItem[];
  validationErrors: Record<string, string | undefined>;
  onEditStep: (step: ActivityPlanDraftStep) => void;
  onAddStep: (repeatId?: string) => void;
  onAddRepeat: () => void;
  onRemove: (id: string) => ActivityPlanOperationResult;
  onDuplicate: (id: string) => ActivityPlanOperationResult;
  onUngroup: (id: string) => ActivityPlanOperationResult;
  onMove: (id: string, to: Location) => ActivityPlanOperationResult;
  onRepeatCount: (id: string, count: number) => ActivityPlanOperationResult;
}

/** V5 chronological outline with native drag reorder plus explicit cross-list destinations. */
export function StructureBuilderCard(props: StructureBuilderCardProps) {
  const [operationError, setOperationError] = useState<string | null>(null);
  const apply = (operation: ActivityPlanOperationResult) =>
    setOperationError(operation.success ? null : operation.error);
  const repeats = props.items.filter((item) => item.type === "repeat");
  const rootDestinations = (index: number): { label: string; to: Location }[] => [
    ...(index > 0 ? [{ label: "Move earlier", to: { index: index - 1 } }] : []),
    ...(index < props.items.length - 1 ? [{ label: "Move later", to: { index: index + 1 } }] : []),
  ];
  return (
    <View className="gap-3" testID="activity-plan-structure-card">
      <NestableDraggableFlatList
        data={props.items}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        onDragEnd={({ from, to }) => {
          if (from !== to) apply(props.onMove(props.items[from]?.id ?? "", { index: to }));
        }}
        renderItem={({ item, getIndex, drag, isActive }) => {
          const rootIndex = getIndex() ?? 0;
          if (item.type === "step")
            return (
              <StepRow
                step={item}
                activityCategory={props.activityCategory}
                label={`Standalone step ${rootIndex + 1}`}
                drag={drag}
                isActive={isActive}
                onEdit={() => props.onEditStep(item)}
                onDelete={() => apply(props.onRemove(item.id))}
                onDuplicate={() => apply(props.onDuplicate(item.id))}
                destinations={[
                  ...rootDestinations(rootIndex),
                  ...repeats.map((repeat, repeatIndex) => ({
                    label: `Move into repeat ${repeatIndex + 1}`,
                    to: { repeatId: repeat.id, index: repeat.steps.length },
                  })),
                ]}
                onMove={(to) => apply(props.onMove(item.id, to))}
              />
            );
          return (
            <RepeatRow
              key={item.id}
              item={item}
              rootIndex={rootIndex}
              activityCategory={props.activityCategory}
              repeats={repeats}
              destinations={rootDestinations(rootIndex)}
              drag={drag}
              isActive={isActive}
              onEditStep={props.onEditStep}
              onAddStep={props.onAddStep}
              onRemove={(id) => apply(props.onRemove(id))}
              onDuplicate={(id) => apply(props.onDuplicate(id))}
              onUngroup={(id) => apply(props.onUngroup(id))}
              onMove={(id, to) => apply(props.onMove(id, to))}
              onRepeatCount={(id, count) => apply(props.onRepeatCount(id, count))}
            />
          );
        }}
      />
      {[...Object.values(props.validationErrors), operationError].filter(Boolean).map((error) => (
        <Text key={error} accessibilityRole="alert" className="text-sm text-destructive">
          {error}
        </Text>
      ))}
    </View>
  );
}

function RepeatRow({
  item,
  rootIndex,
  activityCategory,
  repeats,
  destinations,
  drag,
  isActive,
  onEditStep,
  onAddStep,
  onRemove,
  onDuplicate,
  onUngroup,
  onMove,
  onRepeatCount,
}: {
  item: Extract<ActivityPlanDraftItem, { type: "repeat" }>;
  rootIndex: number;
  activityCategory: ActivityTargetCategory;
  repeats: Extract<ActivityPlanDraftItem, { type: "repeat" }>[];
  destinations: { label: string; to: Location }[];
  drag: () => void;
  isActive: boolean;
  onEditStep: (step: ActivityPlanDraftStep) => void;
  onAddStep: (repeatId?: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onUngroup: (id: string) => void;
  onMove: (id: string, to: Location) => void;
  onRepeatCount: (id: string, count: number) => void;
}) {
  return (
    <View
      className="gap-2 rounded-xl border border-border bg-muted/20 p-3"
      testID={`repeat-row-${item.id}`}
    >
      <View
        className="flex-row items-center justify-between gap-2"
        testID={`repeat-header-${item.id}`}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Reorder repeat ${rootIndex + 1}`}
          disabled={isActive}
          onLongPress={drag}
          className="min-h-12 min-w-12 flex-row items-center justify-center gap-2"
        >
          <GripVertical size={16} />
          <Repeat2 size={16} />
          <Text className="font-semibold">
            Repeat {rootIndex + 1} × {item.count}
          </Text>
        </Pressable>
        <IntegerStepper
          label={`Repeats in repeat ${rootIndex + 1}`}
          value={item.count}
          min={2}
          max={50}
          presentation="compact"
          onChange={(count) => onRepeatCount(item.id, count)}
        />
      </View>
      <DestinationButtons
        destinations={destinations}
        label={`repeat ${rootIndex + 1}`}
        onMove={(to) => onMove(item.id, to)}
      />
      <NestableDraggableFlatList
        data={item.steps}
        keyExtractor={(step) => step.id}
        scrollEnabled={false}
        onDragEnd={({ from, to }) => {
          if (from !== to) onMove(item.steps[from]?.id ?? "", { repeatId: item.id, index: to });
        }}
        renderItem={({ item: step, getIndex, drag: dragStep, isActive: stepActive }) => {
          const index = getIndex() ?? 0;
          return (
            <StepRow
              step={step}
              activityCategory={activityCategory}
              label={`Repeat ${rootIndex + 1}, step ${index + 1}`}
              drag={dragStep}
              isActive={stepActive}
              onEdit={() => onEditStep(step)}
              onDelete={() => onRemove(step.id)}
              onDuplicate={() => onDuplicate(step.id)}
              destinations={[
                ...(index > 0
                  ? [{ label: "Move earlier", to: { repeatId: item.id, index: index - 1 } }]
                  : []),
                ...(index < item.steps.length - 1
                  ? [{ label: "Move later", to: { repeatId: item.id, index: index + 1 } }]
                  : []),
                // Core removes an emptied source repeat before resolving this root index.
                {
                  label: "Move out of repeat",
                  to: { index: rootIndex + (item.steps.length === 1 ? 0 : 1) },
                },
                ...repeats
                  .filter((repeat) => repeat.id !== item.id)
                  .map((repeat) => ({
                    // Keep the destination's visible ordinal, rather than its ordinal
                    // after filtering out the source repeat.
                    label: `Move to repeat ${repeats.findIndex((candidate) => candidate.id === repeat.id) + 1}`,
                    to: { repeatId: repeat.id, index: repeat.steps.length },
                  })),
              ]}
              onMove={(to) => onMove(step.id, to)}
            />
          );
        }}
      />
      <Button
        variant="ghost"
        onPress={() => onAddStep(item.id)}
        accessibilityLabel={`Add step to repeat ${rootIndex + 1}`}
      >
        <Plus size={16} />
        <Text>Add Step</Text>
      </Button>
      <View className="flex-row flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => onDuplicate(item.id)}
          accessibilityLabel={`Duplicate repeat ${rootIndex + 1}`}
        >
          <Copy size={14} />
          <Text>Duplicate</Text>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => onUngroup(item.id)}
          accessibilityLabel={`Ungroup repeat ${rootIndex + 1}`}
        >
          <Text>Ungroup</Text>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          accessibilityLabel={`Delete repeat ${rootIndex + 1}`}
          onPress={() =>
            Alert.alert(
              "Delete repeat?",
              "This deletes the repeat and all of its steps. Ungroup keeps the prescribed dose.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Delete repeat", style: "destructive", onPress: () => onRemove(item.id) },
              ],
            )
          }
        >
          <Trash2 size={14} />
          <Text>Delete</Text>
        </Button>
      </View>
    </View>
  );
}

function StepRow({
  step,
  activityCategory,
  label,
  drag,
  isActive,
  onEdit,
  onDelete,
  onDuplicate,
  destinations,
  onMove,
}: {
  step: ActivityPlanDraftStep;
  activityCategory: ActivityTargetCategory;
  label: string;
  drag: () => void;
  isActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  destinations: { label: string; to: Location }[];
  onMove: (to: Location) => void;
}) {
  return (
    <View className="gap-1 border-t border-border pt-2" testID={`step-row-${step.id}`}>
      <View className="flex-row items-center gap-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Reorder ${label}`}
          disabled={isActive}
          onLongPress={drag}
          className="min-h-12 min-w-12 items-center justify-center"
        >
          <GripVertical size={16} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${label}`}
          className="flex-1 rounded-lg bg-background px-3 py-2"
          onPress={onEdit}
        >
          <ActivityPlanStepPreview activityCategory={activityCategory} step={step} />
        </Pressable>
        <Button
          size="icon"
          variant="ghost"
          className="min-h-12 min-w-12"
          accessibilityLabel={`Duplicate ${label}`}
          onPress={onDuplicate}
        >
          <Copy size={16} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="min-h-12 min-w-12"
          accessibilityLabel={`Delete ${label}`}
          onPress={onDelete}
        >
          <Trash2 size={16} />
        </Button>
      </View>
      <View className="flex-row flex-wrap gap-1">
        <DestinationButtons destinations={destinations} label={label} onMove={onMove} />
      </View>
    </View>
  );
}

function DestinationButtons({
  destinations,
  label,
  onMove,
}: {
  destinations: { label: string; to: Location }[];
  label: string;
  onMove: (to: Location) => void;
}) {
  return (
    <>
      {destinations.map(({ label: destination, to }) => (
        <Button
          key={`${destination}-${to.repeatId ?? "root"}-${to.index}`}
          size="sm"
          variant="ghost"
          accessibilityLabel={`${destination} ${label}`}
          onPress={() => onMove(to)}
        >
          <Text>{destination}</Text>
        </Button>
      ))}
    </>
  );
}
