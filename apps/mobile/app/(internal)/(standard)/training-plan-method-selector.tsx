import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import { useRouter, Stack } from "expo-router";
import { Target, Wrench, Sparkles } from "lucide-react-native";
import { View, ScrollView } from "react-native";

export default function TrainingPlanMethodSelector() {
  const router = useRouter();

  const handleGuidedSetup = () => {
    router.push("/training-plan-wizard" as any);
  };

  const handleDiscoverTemplates = () => {
    router.push("/(internal)/(tabs)/plan" as any);
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Create Training Plan",
          headerShown: true,
        }}
      />

      <ScrollView className="flex-1" contentContainerClassName="p-4 gap-6">
        {/* Header Section */}
        <View className="gap-2">
          <Text className="text-2xl font-bold text-foreground">
            How would you like to create your plan?
          </Text>
          <Text className="text-muted-foreground">
            Choose the method that works best for you
          </Text>
        </View>

        {/* Guided Setup Option */}
        <Card className="relative overflow-hidden">
          <View className="absolute top-2 right-2 z-10 bg-primary rounded-full px-2 py-1">
            <Text className="text-primary-foreground text-xs font-semibold">
              Recommended
            </Text>
          </View>

          <CardHeader>
            <View className="flex-row items-center gap-3">
              <View className="bg-primary/10 rounded-full p-3">
                <Target className="text-primary" size={24} />
              </View>
              <View className="flex-1">
                <CardTitle>Guided Setup</CardTitle>
                <CardDescription>Perfect for getting started</CardDescription>
              </View>
            </View>
          </CardHeader>

          <CardContent>
            <View className="gap-3 mb-4">
              <View className="flex-row items-start gap-2">
                <Text className="text-primary text-lg">•</Text>
                <Text className="text-muted-foreground flex-1">
                  Answer 5 simple questions about your goals and fitness
                </Text>
              </View>
              <View className="flex-row items-start gap-2">
                <Text className="text-primary text-lg">•</Text>
                <Text className="text-muted-foreground flex-1">
                  Get a personalized plan tailored to your needs
                </Text>
              </View>
              <View className="flex-row items-start gap-2">
                <Text className="text-primary text-lg">•</Text>
                <Text className="text-muted-foreground flex-1">
                  Takes just 2-3 minutes to complete
                </Text>
              </View>
            </View>

            <Button
              onPress={handleGuidedSetup}
              className="w-full"
              size="lg"
            >
              <Text>Start Guided Setup</Text>
            </Button>
          </CardContent>
        </Card>

        {/* Discover Templates Option */}
        <Card>
          <CardHeader>
            <View className="flex-row items-center gap-3">
              <View className="bg-secondary/50 rounded-full p-3">
                <Sparkles className="text-secondary-foreground" size={24} />
              </View>
              <View className="flex-1">
                <CardTitle>Browse Templates</CardTitle>
                <CardDescription>
                  Start from a proven plan
                </CardDescription>
              </View>
            </View>
          </CardHeader>

          <CardContent>
            <View className="gap-3 mb-4">
              <View className="flex-row items-start gap-2">
                <Text className="text-primary text-lg">•</Text>
                <Text className="text-muted-foreground flex-1">
                  Choose from marathons, triathlons, cycling events & more
                </Text>
              </View>
              <View className="flex-row items-start gap-2">
                <Text className="text-primary text-lg">•</Text>
                <Text className="text-muted-foreground flex-1">
                  Plans designed by coaches for all experience levels
                </Text>
              </View>
              <View className="flex-row items-start gap-2">
                <Text className="text-primary text-lg">•</Text>
                <Text className="text-muted-foreground flex-1">
                  Customize to fit your schedule and event date
                </Text>
              </View>
            </View>

            <Button
              onPress={handleDiscoverTemplates}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <Text>Discover Templates</Text>
            </Button>
          </CardContent>
        </Card>

        {/* Info Note */}
        <View className="bg-muted/30 rounded-lg p-4">
          <Text className="text-sm text-muted-foreground text-center">
            Both options will let you review and adjust your plan before
            creating it
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
