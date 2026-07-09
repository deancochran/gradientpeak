import type { ReactNode } from "react";
import { View } from "react-native";

export function TrainingPreferencesPanel({ children }: { children: ReactNode }) {
  return <View className="gap-3 rounded-xl border border-border bg-card p-3">{children}</View>;
}
