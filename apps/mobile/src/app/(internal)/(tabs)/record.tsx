import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

export default function RecordPlaceholder() {
  const router = useRouter();

  useEffect(() => {
    // Open the modal immediately
    router.push("/modals/record");
  }, [router]);

  // Render nothing (or a loading state)
  return <View style={{ flex: 1, backgroundColor: "white" }} />;
}
