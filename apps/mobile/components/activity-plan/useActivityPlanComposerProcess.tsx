import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import type { NavigationAction } from "expo-router/react-navigation";
import type { ReactNode } from "react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";

type ActivityPlanComposerProcessParams = {
  activityCategory: string;
  allowNavigationRef: RefObject<boolean>;
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
  structure: unknown;
  submit: () => undefined | Promise<unknown>;
  onAttempt: () => void;
};

export function useActivityPlanComposerProcess({
  activityCategory,
  allowNavigationRef,
  description,
  isEditMode,
  isEditBlocked,
  hydrationVersion,
  isLoading,
  isSubmitting,
  name,
  navigation,
  structure,
  submit,
  onAttempt,
}: ActivityPlanComposerProcessParams) {
  const appliedHydrationVersionRef = useRef<number | null>(null);
  const [baselineSignature, setBaselineSignature] = useState<string | null>(null);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const attemptRef = useRef(onAttempt);
  attemptRef.current = onAttempt;
  // This is set synchronously from Save, before mutation state can cause a re-render.
  const pendingSubmitRef = useRef(false);
  const formSignature = useMemo(
    () =>
      JSON.stringify({
        name,
        description,
        activityCategory,
        structure,
      }),
    [activityCategory, description, name, structure],
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
  useDirtyNavigationGuard({
    isDirty,
    isPending: isSubmitting,
    allowNavigationRef,
    pendingRef: pendingSubmitRef,
    navigation,
  });
  const previousSignature = useRef(formSignature);
  useEffect(() => {
    if (previousSignature.current !== formSignature && !isSubmitting)
      allowNavigationRef.current = false;
    previousSignature.current = formSignature;
  }, [allowNavigationRef, formSignature, isSubmitting]);

  useEffect(() => {
    navigation.setOptions({
      title: isEditMode ? "Edit Activity Plan" : "Create Activity Plan",
      headerRight: () =>
        isEditBlocked ? null : (
          <LoadingButton
            variant="ghost"
            size="sm"
            onPress={() => {
              pendingSubmitRef.current = true;
              attemptRef.current();
              void Promise.resolve(submitRef.current()).finally(() => {
                pendingSubmitRef.current = false;
              });
            }}
            disabled={isLoading || isSubmitting}
            loading={isSubmitting}
            loadingLabel="Saving..."
            loadingTextClassName="text-primary"
          >
            <Text className="text-primary font-semibold">Save</Text>
          </LoadingButton>
        ),
    });
  }, [navigation, isEditMode, isEditBlocked, isLoading, isSubmitting]);

  return {
    isDirty,
  };
}
