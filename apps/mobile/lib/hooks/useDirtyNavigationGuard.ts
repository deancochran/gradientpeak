import { useNavigation } from "expo-router";
import { type NavigationAction, usePreventRemove } from "expo-router/react-navigation";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

/** Prevents accidental loss of local form work. Pending saves stay protected until confirmed success. */
export function useDirtyNavigationGuard({
  isDirty,
  isPending = false,
  allowNavigationRef: externalAllowNavigationRef,
  pendingRef,
  navigation: navigationOverride,
}: {
  isDirty: boolean;
  isPending?: boolean;
  /** Lets a form's authoritative success callback permit its following navigation action. */
  allowNavigationRef?: RefObject<boolean>;
  /** Fences a just-started save before React has rendered its pending state. */
  pendingRef?: RefObject<boolean>;
  navigation?: { dispatch: (action: NavigationAction) => void };
}) {
  const defaultNavigation = useNavigation();
  const navigation = navigationOverride ?? defaultNavigation;
  const internalAllowNavigationRef = useRef(false);
  const allowNavigationRef = externalAllowNavigationRef ?? internalAllowNavigationRef;
  const [allowNavigation, setAllowNavigation] = useState(false);

  useEffect(() => {
    if (!externalAllowNavigationRef && !isDirty && !isPending) {
      allowNavigationRef.current = false;
      setAllowNavigation(false);
    }
  }, [allowNavigationRef, externalAllowNavigationRef, isDirty, isPending]);

  // Unlike a bare beforeRemove listener, this also protects native-stack gestures.
  usePreventRemove(!allowNavigation && (isDirty || isPending), ({ data }) => {
    if (allowNavigationRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (isPending || pendingRef?.current) {
      Alert.alert("Saving changes", "Please wait for the save to finish before leaving.");
      return;
    }
    Alert.alert("Discard changes?", "Your edits will be lost.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          allowNavigationRef.current = true;
          setAllowNavigation(true);
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  return {
    allowNavigationAfterSuccess: () => {
      allowNavigationRef.current = true;
      setAllowNavigation(true);
    },
  };
}
