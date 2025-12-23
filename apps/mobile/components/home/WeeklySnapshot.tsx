import React from "react";
import { View, Text } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Calendar, Zap } from "lucide-react-native";

interface WeeklySnapshotProps {
  distance: number;
  workouts: number;
  totalTSS: number;
}

const WeeklySnapshot: React.FC<WeeklySnapshotProps> = ({
  distance,
  workouts,
  totalTSS,
}) => {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground text-sm">
          Weekly Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <View className="flex-row justify-between">
          {/* Distance */}
          <View className="items-center flex-1">
            <View className="bg-blue-500/10 p-1.5 rounded-full mb-1">
              <BarChart3 className="text-blue-500" size={14} />
            </View>
            <Text className="text-lg font-bold text-foreground">
              {distance}
            </Text>
            <Text className="text-xs text-muted-foreground">Miles</Text>
          </View>

          {/* Vertical Divider */}
          <View className="w-px bg-border mx-1" />

          {/* Workouts */}
          <View className="items-center flex-1">
            <View className="bg-purple-500/10 p-1.5 rounded-full mb-1">
              <Calendar className="text-purple-500" size={14} />
            </View>
            <Text className="text-lg font-bold text-foreground">
              {workouts}
            </Text>
            <Text className="text-xs text-muted-foreground">Workouts</Text>
          </View>

          {/* Vertical Divider */}
          <View className="w-px bg-border mx-1" />

          {/* Total TSS */}
          <View className="items-center flex-1">
            <View className="bg-orange-500/10 p-1.5 rounded-full mb-1">
              <Zap className="text-orange-500" size={14} />
            </View>
            <Text className="text-lg font-bold text-foreground">
              {totalTSS}
            </Text>
            <Text className="text-xs text-muted-foreground">TSS</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
};

export default WeeklySnapshot;
