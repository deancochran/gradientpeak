import {
  type ActivityPlanInterval,
  type ActivityPlanIntervalStep,
  type ActivityPlanTargetAnchors,
  type ActivityTargetCategory,
  activityPlanIntervalSchema,
  getActivityPlanAuthoringIssues,
} from "@repo/core";
import { parseNumberOrUndefined } from "@repo/core/utils/fitness-inputs";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { randomUUID } from "expo-crypto";
import { MoreHorizontal } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Keyboard, View } from "react-native";
import { APP_BOTTOM_SHEET_PRESENTATIONS, AppBottomSheet } from "@/components/shared/AppBottomSheet";
import { createDefaultActivityPlanStep } from "@/lib/activityPlanDefaults";
import {
  type StepContextEditor,
  StepEditorFields,
  type StepEditorFieldsHandle,
  type StepEditorLifecycle,
} from "../activity/StepEditorFields";

interface StructureIntervalSheetProps {
  interval: ActivityPlanInterval;
  activityCategory: ActivityTargetCategory;
  targetAnchors?: ActivityPlanTargetAnchors;
  onCommit: (interval: ActivityPlanInterval) => void;
  onClose: () => void;
}

/** Mounted by interval ID. Nothing leaves this transaction until every field validates. */
export function StructureIntervalSheet({
  interval,
  activityCategory,
  targetAnchors,
  onCommit,
  onClose,
}: StructureIntervalSheetProps) {
  const [draft, setDraft] = useState(() => ({ ...interval, steps: [...interval.steps] }));
  const [repeats, setRepeats] = useState(String(interval.repetitions));
  const [edited, setEdited] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [activeEditor, setActiveEditor] = useState<({ stepId: string } & StepContextEditor) | null>(
    null,
  );
  const overlay = useRef({ generation: 0, active: null as number | null, mounted: true });
  const editorLifecycles = useRef(new Map<string, StepEditorLifecycle>());
  const closeAttempt = useRef<{ accepted: boolean } | null>(null);
  useEffect(() => {
    overlay.current.mounted = true;
    return () => {
      overlay.current.mounted = false;
      overlay.current.generation += 1;
      overlay.current.active = null;
    };
  }, []);
  const fields = useRef(new Map<string, StepEditorFieldsHandle>());
  const repeatsRef = useRef<React.ComponentRef<typeof Input>>(null);
  const nameRef = useRef<React.ComponentRef<typeof Input>>(null);
  const focusNewStep = useRef<string | null>(null);
  const committed = useRef(false);
  const settleEditors = () => {
    for (const field of fields.current.values()) field.settle();
  };
  const dismissEditor = () => {
    if (!overlay.current.mounted || overlay.current.active === null) return;
    settleEditors();
    Keyboard.dismiss();
    overlay.current.active = null;
    setActiveEditor(null);
  };
  const close = () => {
    if (!overlay.current.mounted || closeAttempt.current) return;
    if (overlay.current.active !== null) {
      dismissEditor();
      return;
    }
    // Local to this mounted interval transaction. Alert callbacks can arrive
    // after cancellation, another attempt, or unmount, so identity matters too.
    const attempt = { accepted: false };
    closeAttempt.current = attempt;
    const cancelClose = () => {
      if (closeAttempt.current === attempt && !attempt.accepted) closeAttempt.current = null;
    };
    const finishClose = () => {
      if (!overlay.current.mounted || closeAttempt.current !== attempt || attempt.accepted) return;
      attempt.accepted = true;
      overlay.current.generation += 1;
      onClose();
    };
    for (const field of fields.current.values()) field.cancel();
    if (!edited) finishClose();
    else
      Alert.alert(
        "Discard changes?",
        "Your edits will be lost.",
        [
          { text: "Keep editing", style: "cancel", onPress: cancelClose },
          { text: "Discard", style: "destructive", onPress: finishClose },
        ],
        { cancelable: true, onDismiss: cancelClose },
      );
  };
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => listener.remove();
  });
  const change = (next: ActivityPlanInterval) => {
    setEdited(true);
    setDraft(next);
  };

  const add = (purpose: "work" | "recovery") => {
    const step = createDefaultActivityPlanStep({
      activityCategory,
      ...(targetAnchors === undefined ? {} : { anchors: targetAnchors }),
    });
    focusNewStep.current = step.id;
    change({
      ...draft,
      steps: [
        ...draft.steps,
        { ...step, purpose, ...(purpose === "recovery" ? { name: "Recovery" } : {}) },
      ],
    });
  };
  const duplicate = (id: string) => {
    const step = fields.current.get(id)?.validate();
    if (!step) {
      setError("Correct this step before duplicating it.");
      return;
    }
    const index = draft.steps.findIndex((candidate) => candidate.id === id);
    const steps = [...draft.steps];
    const copy = {
      ...step,
      duration: { ...step.duration },
      targets: step.targets.map((target) => ({ ...target })),
      id: randomUUID(),
    };
    focusNewStep.current = copy.id;
    steps.splice(index + 1, 0, copy);
    change({ ...draft, steps });
    setError(null);
  };
  const done = () => {
    if (committed.current) return;
    settleEditors();
    const repetitions = parseNumberOrUndefined(repeats);
    if (
      repetitions === undefined ||
      !Number.isInteger(repetitions) ||
      repetitions < 1 ||
      repetitions > 50
    ) {
      setError("Enter whole repeats from 1 to 50.");
      repeatsRef.current?.focus?.();
      return;
    }
    if (!draft.name.trim()) {
      setError("Interval name is required.");
      nameRef.current?.focus?.();
      return;
    }
    const steps: ActivityPlanIntervalStep[] = [];
    for (const step of draft.steps) {
      if (removed.has(step.id)) continue;
      const value = fields.current.get(step.id)?.validate();
      if (!value) {
        setError("Correct the highlighted step before applying this interval.");
        return;
      }
      steps.push(value);
    }
    const next = { ...draft, repetitions, steps };
    const parsed = activityPlanIntervalSchema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join("\n"));
      return;
    }
    const issues = getActivityPlanAuthoringIssues({
      version: 3,
      activity_category: activityCategory,
      segments: [
        {
          id: "editor-segment",
          name: "Editor",
          role: "activity",
          intervals: [next],
        },
      ],
    });
    if (issues.length) {
      setError(issues.map((issue) => issue.message).join("\n"));
      return;
    }
    committed.current = true;
    overlay.current.generation += 1;
    onCommit(next);
  };

  return (
    <AppBottomSheet
      visible
      guardedClose
      contentPanningGestureEnabled={false}
      contentPaddingBottom={24}
      headerLayout="centered"
      onBack={close}
      onClose={close}
      title="Edit interval"
      headerAction={
        <Button
          accessibilityLabel="Done editing interval"
          accessibilityHint="Applies all interval changes to the open plan editor"
          className="min-h-12"
          variant="ghost"
          onPress={done}
        >
          <Text>Done</Text>
        </Button>
      }
      initialSnapIndex={APP_BOTTOM_SHEET_PRESENTATIONS.inspector.initialSnapIndex}
      snapPoints={APP_BOTTOM_SHEET_PRESENTATIONS.inspector.snapPoints}
    >
      <View className="gap-3 pb-6">
        <Text className="text-xs text-muted-foreground">
          Done applies this interval to the open editor. Save the plan to keep your changes.
        </Text>
        <View className="flex-row items-end gap-3">
          <View className="flex-1">
            <Input
              ref={nameRef}
              accessibilityLabel="Interval name"
              className="min-h-12 border-0 px-0 text-lg font-semibold"
              maxLength={100}
              value={draft.name}
              onChangeText={(name) => change({ ...draft, name })}
            />
          </View>
          <View className="w-48">
            <Text>Repeats</Text>
            <Input
              ref={repeatsRef}
              testID="interval-repeats"
              accessibilityLabel="Repeats"
              accessibilityHint="Whole repeats from 1 to 50"
              keyboardType="number-pad"
              value={repeats}
              onChangeText={(value) => {
                setRepeats(value);
                setEdited(true);
              }}
            />
          </View>
        </View>
        {draft.steps.map((step, index) => (
          <View
            key={step.id}
            testID={`interval-step-${step.id}`}
            style={removed.has(step.id) ? { display: "none" } : undefined}
            className="gap-2 border-t border-border pt-3"
          >
            <StepEditorFields
              activeEditor={
                activeEditor?.stepId === step.id && !removed.has(step.id) ? activeEditor : null
              }
              onActivateEditor={(editor, focus) => {
                if (!overlay.current.mounted || closeAttempt.current || committed.current) return;
                settleEditors();
                Keyboard.dismiss();
                const session = ++overlay.current.generation;
                overlay.current.active = session;
                let focused = false;
                let restored = false;
                editorLifecycles.current.set(step.id, {
                  isEditorCurrent: () =>
                    overlay.current.mounted &&
                    overlay.current.active === session &&
                    overlay.current.generation === session &&
                    !committed.current &&
                    !closeAttempt.current,
                  onDismissEditor: () => {
                    if (overlay.current.active === session) dismissEditor();
                  },
                  onEditorShow: () => {
                    if (!overlay.current.mounted || overlay.current.active !== session)
                      return false;
                    if (!focused) {
                      focused = true;
                      focus();
                    }
                    return true;
                  },
                  onEditorDismissed: (restoreFocus) => {
                    if (
                      !overlay.current.mounted ||
                      overlay.current.active !== null ||
                      overlay.current.generation !== session ||
                      closeAttempt.current ||
                      restored
                    )
                      return;
                    restored = true;
                    restoreFocus();
                  },
                });
                setActiveEditor({ stepId: step.id, ...editor });
              }}
              {...editorLifecycles.current.get(step.id)}
              headingActions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      accessibilityLabel={`Step ${index + 1} actions`}
                      className="min-h-12 min-w-12"
                      variant="ghost"
                    >
                      <MoreHorizontal size={20} className="text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      className="min-h-12"
                      accessibilityLabel={`Duplicate step ${index + 1}`}
                      onPress={() => duplicate(step.id)}
                    >
                      <Text>Duplicate</Text>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="min-h-12"
                      accessibilityLabel={`Delete step ${index + 1}`}
                      variant="destructive"
                      onPress={() => {
                        fields.current.get(step.id)?.cancel();
                        overlay.current.generation += 1;
                        if (activeEditor?.stepId === step.id) {
                          Keyboard.dismiss();
                          overlay.current.active = null;
                          setActiveEditor(null);
                        }
                        setRemoved((current) => new Set([...current, step.id]));
                        setEdited(true);
                      }}
                    >
                      <Text>Remove</Text>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
              ref={(handle) => {
                if (handle) {
                  fields.current.set(step.id, handle);
                  if (focusNewStep.current === step.id) {
                    focusNewStep.current = null;
                    handle.focus();
                  }
                } else fields.current.delete(step.id);
              }}
              inline
              step={step}
              activityCategory={activityCategory}
              {...(targetAnchors === undefined ? {} : { targetAnchors })}
              onDirtyChange={(dirty) => {
                if (dirty) setEdited(true);
              }}
            />
          </View>
        ))}
        {removed.size ? (
          <Button variant="ghost" onPress={() => setRemoved(new Set())}>
            <Text>Undo step removal</Text>
          </Button>
        ) : null}
        <View className="flex-row gap-2">
          <Button variant="ghost" onPress={() => add("work")}>
            <Text>Add step</Text>
          </Button>
          <Button variant="ghost" onPress={() => add("recovery")}>
            <Text>Add recovery</Text>
          </Button>
        </View>
        {instructionsOpen ? (
          <View className="gap-2">
            <Text>Interval instructions</Text>
            <Textarea
              accessibilityLabel="Interval instructions"
              maxLength={1000}
              value={draft.notes ?? ""}
              onChangeText={(notes) => change({ ...draft, notes })}
            />
            <Button variant="ghost" onPress={() => setInstructionsOpen(false)}>
              <Text>Hide interval instructions</Text>
            </Button>
          </View>
        ) : (
          <Button variant="ghost" onPress={() => setInstructionsOpen(true)}>
            <Text>
              {draft.notes ? `Interval instructions: ${draft.notes}` : "Add interval instructions"}
            </Text>
          </Button>
        )}
        {error ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            className="text-destructive"
          >
            {error}
          </Text>
        ) : null}
      </View>
    </AppBottomSheet>
  );
}
