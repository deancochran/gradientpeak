import { Alert } from "react-native";

export function useDirtyCloseGuard({
  isDirty,
  isPending,
}: {
  isDirty: boolean;
  isPending?: boolean;
}) {
  return (onClose: () => void) => {
    if (isPending) {
      Alert.alert("Saving changes", "Please wait for the save to finish before closing.");
      return;
    }
    if (!isDirty) {
      onClose();
      return;
    }
    Alert.alert("Discard changes?", "Your edits will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onClose },
    ]);
  };
}
