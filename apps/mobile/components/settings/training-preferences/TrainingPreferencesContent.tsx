import type { ReactNode } from "react";
import { View } from "react-native";

type TrainingPreferencesContentProps = {
  children: ReactNode;
};

export function TrainingPreferencesContent({ children }: TrainingPreferencesContentProps) {
  return <View className="gap-3">{children}</View>;
}
