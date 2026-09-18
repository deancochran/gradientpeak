import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { type NavigationAction, usePreventRemove } from "expo-router/react-navigation";
import type { ReactNode } from "react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

type ActivityPlanComposerProcessParams = {
  activityCategory: string;
  allowNavigationRef: RefObject<boolean>;
  canSubmit: boolean;
  description: string;
  isEditMode: boolean;
  isEditBlocked: boolean;
  hydrationVersion: number;
  isLoading: boolean;
  isSubmitting: boolean;
  name: string;
  navigation: {
    addListener: (
      eventName: "beforeRemove",
      listener: (event: { data: { action: NavigationAction }; preventDefault: () => void }) => void,
    ) => () => void;
    dispatch: (action: NavigationAction) => void;
    setOptions: (options: { headerRight: () => ReactNode; title: string }) => void;
  };
  notes: string;
  structure: unknown;
  submit: () => undefined | Promise<unknown>;
};

export function useActivityPlanComposerProcess({
  activityCategory,
  allowNavigationRef,
  canSubmit,
  description,
  isEditMode,
  isEditBlocked,
  hydrationVersion,
  isLoading,
  isSubmitting,
  name,
  navigation,
  notes,
  structure,
  submit,
}: ActivityPlanComposerProcessParams) {
  const appliedHydrationVersionRef = useRef<number | null>(null);
  const [baselineSignature, setBaselineSignature] = useState<string | null>(null);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const formSignature = useMemo(
    () =>
      JSON.stringify({
        name,
        description,
        activityCategory,
        structure,
        notes,
      }),
    [activityCategory, description, name, notes, structure],
  );

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (baselineSignature === null || appliedHydrationVersionRef.current !== hydrationVersion) {
      setBaselineSignature(formSignature);
      appliedHydrationVersionRef.current = hydrationVersion;
    }
  }, [baselineSignature, formSignature, hydrationVersion, isLoading]);

  const isDirty = baselineSignature !== null && baselineSignature !== formSignature;
  const previousSignature = useRef(formSignature);
  useEffect(() => {
    if (previousSignature.current !== formSignature && !isSubmitting)
      allowNavigationRef.current = false;
    previousSignature.current = formSignature;
  }, [allowNavigationRef, formSignature, isSubmitting]);

  usePreventRemove(!allowNavigationRef.current && (isDirty || isSubmitting), ({ data }) => {
    if (allowNavigationRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (isSubmitting) {
      Alert.alert("Saving changes", "Please wait for the save to finish before leaving.");
      return;
    }
    if (!isDirty) return;
    Alert.alert("Discard changes?", "Your edits will be lost.", [
      { text: "Keep Editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          allowNavigationRef.current = true;
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  useEffect(() => {
    navigation.setOptions({
      title: isEditMode ? "Edit Activity Plan" : "Create Activity Plan",
      headerRight: () =>
        isEditBlocked ? null : (
          <LoadingButton
            variant="ghost"
            size="sm"
            onPress={() => submitRef.current()}
            disabled={!canSubmit || isLoading || isSubmitting}
            loading={isSubmitting}
            loadingLabel="Saving..."
            loadingTextClassName="text-primary"
          >
            <Text className="text-primary font-semibold">Save</Text>
          </LoadingButton>
        ),
    });
  }, [navigation, isEditMode, isEditBlocked, canSubmit, isLoading, isSubmitting]);

  return {
    isDirty,
  };
}
