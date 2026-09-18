import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

/** Prevents accidental loss of local form work. Pending saves stay protected until confirmed success. */
export function useDirtyNavigationGuard({
  isDirty,
  isPending = false,
}: {
  isDirty: boolean;
  isPending?: boolean;
}) {
  const navigation = useNavigation();
  const allowNavigationRef = useRef(false);
  const [allowNavigation, setAllowNavigation] = useState(false);

  useEffect(() => {
    if (!isDirty && !isPending) {
      allowNavigationRef.current = false;
      setAllowNavigation(false);
    }
  }, [isDirty, isPending]);

  // Unlike a bare beforeRemove listener, this also protects native-stack gestures.
  usePreventRemove(!allowNavigation && (isDirty || isPending), ({ data }) => {
    if (allowNavigationRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (isPending) {
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
