import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { BarChart2, Calendar, Heart, TrendingUp, Zap } from "lucide-react-native";
import { Pressable, ScrollView } from "react-native";

export type TabView =
  | "overview"
  | "volume"
  | "performance"
  | "fitness"
  | "consistency"
  | "weekly"
  | "intensity";

interface TrendsTabBarProps {
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
}

export function TrendsTabBar({ activeTab, onTabChange }: TrendsTabBarProps) {
  const tabs = [
    { id: "overview" as const, label: "Overview", icon: TrendingUp },
    { id: "volume" as const, label: "Volume", icon: BarChart2 },
    { id: "performance" as const, label: "Performance", icon: Zap },
    { id: "fitness" as const, label: "Fitness", icon: Heart },
    { id: "consistency" as const, label: "Consistency", icon: Calendar },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-4"
      contentContainerClassName="flex-row gap-1 rounded-lg bg-muted p-1"
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.id}
          onPress={() => onTabChange(tab.id)}
          className={`flex-row items-center justify-center rounded-md px-3 py-2 ${activeTab === tab.id ? "bg-card shadow-sm" : ""}`}
        >
          <Icon
            as={tab.icon}
            size={16}
            className={activeTab === tab.id ? "text-primary" : "text-muted-foreground"}
          />
          <Text
            className={`ml-1 text-sm font-medium whitespace-nowrap ${
              activeTab === tab.id ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
