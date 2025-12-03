import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Activity, BarChart3, TrendingUp } from "lucide-react-native";
import { Pressable, View } from "react-native";

export type TabView = "overview" | "weekly" | "intensity";

interface TrendsTabBarProps {
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
}

export function TrendsTabBar({ activeTab, onTabChange }: TrendsTabBarProps) {
  return (
    <View className="flex-row bg-muted rounded-lg p-1 mb-4">
      <Pressable
        onPress={() => onTabChange("overview")}
        className={`flex-1 py-2 px-3 rounded-md ${
          activeTab === "overview" ? "bg-card shadow-sm" : ""
        }`}
      >
        <View className="flex-row items-center justify-center">
          <Icon
            as={TrendingUp}
            size={16}
            className={
              activeTab === "overview"
                ? "text-primary"
                : "text-muted-foreground"
            }
          />
          <Text
            className={`ml-1 text-sm font-medium ${
              activeTab === "overview" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Overview
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={() => onTabChange("weekly")}
        className={`flex-1 py-2 px-3 rounded-md ${
          activeTab === "weekly" ? "bg-card shadow-sm" : ""
        }`}
      >
        <View className="flex-row items-center justify-center">
          <Icon
            as={BarChart3}
            size={16}
            className={
              activeTab === "weekly" ? "text-primary" : "text-muted-foreground"
            }
          />
          <Text
            className={`ml-1 text-sm font-medium ${
              activeTab === "weekly" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Weekly
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={() => onTabChange("intensity")}
        className={`flex-1 py-2 px-3 rounded-md ${
          activeTab === "intensity" ? "bg-card shadow-sm" : ""
        }`}
      >
        <View className="flex-row items-center justify-center">
          <Icon
            as={Activity}
            size={16}
            className={
              activeTab === "intensity"
                ? "text-primary"
                : "text-muted-foreground"
            }
          />
          <Text
            className={`ml-1 text-sm font-medium ${
              activeTab === "intensity" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Intensity
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
