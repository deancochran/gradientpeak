import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  Activity,
  BarChart3,
  TrendingUp,
  BarChart2,
  Zap,
  Heart,
  Calendar,
} from "lucide-react-native";
import { Pressable, View, ScrollView } from "react-native";

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
    >
      <View className="flex-row bg-muted rounded-lg p-1 gap-1">
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            className={`py-2 px-3 rounded-md ${
              activeTab === tab.id ? "bg-card shadow-sm" : ""
            }`}
          >
            <View className="flex-row items-center justify-center">
              <Icon
                as={tab.icon}
                size={16}
                className={
                  activeTab === tab.id
                    ? "text-primary"
                    : "text-muted-foreground"
                }
              />
              <Text
                className={`ml-1 text-sm font-medium whitespace-nowrap ${
                  activeTab === tab.id
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {tab.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
