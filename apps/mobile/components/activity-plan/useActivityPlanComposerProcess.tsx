import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { Alert } from "react-native";

type ActivityPlanComposerProcessParams = {
  activityCategory: string;
  allowNavigationRef: RefObject<boolean>;
  canSubmit: boolean;
  description: string;
  isEditMode: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  name: string;
  navigation: any;
  notes: string;
  routeId: string | null;
  structure: unknown;
  submit: () => void | Promise<unknown>;
};

export function useActivityPlanComposerProcess({
  activityCategory,
  allowNavigationRef,
  canSubmit,
  description,
  isEditMode,
  isLoading,
  isSubmitting,
  name,
  navigation,
  notes,
  routeId,
  structure,
  submit,
}: ActivityPlanComposerProcessParams) {
  const initialSignatureRef = useRef<string | null>(null);
  const formSignature = useMemo(
    () =>
      JSON.stringify({
        name,
        description,
        activityCategory,
        structure,
        routeId,
        notes,
      }),
    [activityCategory, description, name, notes, routeId, structure],
  );

  useEffect(() => {
    if (isLoading || initialSignatureRef.current) {
      return;
    }
    initialSignatureRef.current = formSignature;
  }, [isLoading, formSignature]);

  const isDirty =
    initialSignatureRef.current !== null && initialSignatureRef.current !== formSignature;

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: any) => {
      if (allowNavigationRef.current || !isDirty || isSubmitting) {
        return;
      }

      event.preventDefault();
      Alert.alert("Discard changes?", "Your edits will be lost.", [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            allowNavigationRef.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });

    return unsubscribe;
  }, [allowNavigationRef, navigation, isDirty, isSubmitting]);

  useEffect(() => {
    navigation.setOptions({
      title: isEditMode ? "Edit Activity Plan" : "Create Activity Plan",
      headerRight: () => (
        <Button
          variant="ghost"
          size="sm"
          onPress={submit}
          disabled={!canSubmit || isLoading || isSubmitting}
        >
          <Text className="text-primary font-semibold">{isSubmitting ? "Saving..." : "Save"}</Text>
        </Button>
      ),
    });
  }, [navigation, isEditMode, submit, canSubmit, isLoading, isSubmitting]);

  return {
    isDirty,
  };
}
