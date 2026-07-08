import { Text } from "@repo/ui/components/text";
import { Pressable, ScrollView } from "react-native";

export type PreferencesTabKey =
  | "preferences"
  | "availability"
  | "schedule"
  | "training-style"
  | "recovery"
  | "goal-strategy"
  | "baseline-fitness";

export const preferenceTabs: Array<{ key: PreferencesTabKey; label: string }> = [
  { key: "preferences", label: "Preferences" },
  { key: "availability", label: "Availability" },
  { key: "schedule", label: "Schedule" },
  { key: "training-style", label: "Training style" },
  { key: "recovery", label: "Recovery" },
  { key: "goal-strategy", label: "Goal strategy" },
  { key: "baseline-fitness", label: "Baseline fitness" },
];

type TrainingPreferencesTabsProps = {
  activeTab: PreferencesTabKey;
  modifiedTabs?: PreferencesTabKey[];
  onSelectTab: (tab: PreferencesTabKey) => void;
  visibleTabs?: PreferencesTabKey[];
};

export function TrainingPreferencesTabs({
  activeTab,
  modifiedTabs = [],
  onSelectTab,
  visibleTabs,
}: TrainingPreferencesTabsProps) {
  const renderedTabs = visibleTabs
    ? preferenceTabs.filter((tab) => visibleTabs.includes(tab.key))
    : preferenceTabs;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 pr-2"
      accessibilityRole="tablist"
      accessibilityLabel="Training preference groups"
    >
      {renderedTabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const modified = modifiedTabs.includes(tab.key);
        return (
          <Pressable
            key={tab.key}
            onPress={() => onSelectTab(tab.key)}
            testID={`training-preferences-tab-${tab.key}`}
            className={`border-b-2 px-1.5 py-1.5 ${isActive ? "border-primary" : "border-transparent"}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              className={`text-sm ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              {tab.label}
              {modified ? " •" : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
