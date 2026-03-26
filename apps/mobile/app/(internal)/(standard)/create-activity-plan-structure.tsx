import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { ROUTES } from "@/lib/constants/routes";

export default function LegacyActivityPlanStructureRoute() {
  const router = useRouter();

  useEffect(() => {
    router.replace(ROUTES.PLAN.CREATE_ACTIVITY_PLAN.INDEX as any);
  }, [router]);

  return <View className="flex-1 bg-background" />;
}
