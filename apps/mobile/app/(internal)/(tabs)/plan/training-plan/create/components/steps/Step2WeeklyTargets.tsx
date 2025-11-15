import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { View } from "react-native";

interface Step2WeeklyTargetsProps {
  tssMin: number;
  tssMax: number;
  activitiesPerWeek: number;
  onTssMinChange: (value: number) => void;
  onTssMaxChange: (value: number) => void;
  onActivitiesPerWeekChange: (value: number) => void;
  errors?: {
    tssMin?: string;
    tssMax?: string;
    activitiesPerWeek?: string;
  };
}

/**
 * Step 2: Weekly Targets
 * Sets weekly TSS range and activities per week
 */
export function Step2WeeklyTargets({
  tssMin,
  tssMax,
  activitiesPerWeek,
  onTssMinChange,
  onTssMaxChange,
  onActivitiesPerWeekChange,
  errors,
}: Step2WeeklyTargetsProps) {
  const handleTssMinChange = (text: string) => {
    const value = parseInt(text) || 0;
    onTssMinChange(value);
  };

  const handleTssMaxChange = (text: string) => {
    const value = parseInt(text) || 0;
    onTssMaxChange(value);
  };

  const handleActivitiesChange = (text: string) => {
    const value = parseInt(text) || 0;
    onActivitiesPerWeekChange(value);
  };

  // Calculate average TSS
  const averageTSS = Math.round((tssMin + tssMax) / 2);

  // Get training level description
  const getTrainingLevel = (avg: number): string => {
    if (avg < 200) return "Beginner / Maintenance";
    if (avg < 400) return "Intermediate / Base Building";
    if (avg < 600) return "Advanced / Race Prep";
    return "Elite / High Volume";
  };

  return (
    <View className="gap-6">
      {/* Introduction */}
      <View className="bg-muted/30 rounded-lg p-4">
        <Text className="text-sm text-muted-foreground leading-6">
          Set your weekly training stress score (TSS) targets and how many
          activities you plan to do each week.
        </Text>
      </View>

      {/* TSS Range */}
      <View className="gap-4">
        <Text className="text-lg font-semibold">Weekly TSS Range</Text>

        {/* Min TSS */}
        <View className="gap-2">
          <Label nativeID="tss-min">
            <Text className="text-base font-medium">
              Minimum TSS <Text className="text-destructive">*</Text>
            </Text>
          </Label>
          <Input
            aria-labelledby="tss-min"
            placeholder="200"
            value={tssMin.toString()}
            onChangeText={handleTssMinChange}
            keyboardType="numeric"
          />
          {errors?.tssMin && (
            <Text className="text-sm text-destructive">{errors.tssMin}</Text>
          )}
        </View>

        {/* Max TSS */}
        <View className="gap-2">
          <Label nativeID="tss-max">
            <Text className="text-base font-medium">
              Maximum TSS <Text className="text-destructive">*</Text>
            </Text>
          </Label>
          <Input
            aria-labelledby="tss-max"
            placeholder="400"
            value={tssMax.toString()}
            onChangeText={handleTssMaxChange}
            keyboardType="numeric"
          />
          {errors?.tssMax && (
            <Text className="text-sm text-destructive">{errors.tssMax}</Text>
          )}
        </View>

        {/* TSS Range Visualization */}
        <View className="bg-primary/10 rounded-lg p-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm text-muted-foreground">Average TSS:</Text>
            <Text className="text-xl font-bold text-primary">{averageTSS}</Text>
          </View>
          <Text className="text-sm text-muted-foreground">
            Training Level: {getTrainingLevel(averageTSS)}
          </Text>
        </View>
      </View>

      {/* Activities Per Week */}
      <View className="gap-2">
        <Label nativeID="activities-per-week">
          <Text className="text-base font-semibold">
            Activities per Week <Text className="text-destructive">*</Text>
          </Text>
        </Label>
        <Input
          aria-labelledby="activities-per-week"
          placeholder="4"
          value={activitiesPerWeek.toString()}
          onChangeText={handleActivitiesChange}
          keyboardType="numeric"
        />
        {errors?.activitiesPerWeek && (
          <Text className="text-sm text-destructive">
            {errors.activitiesPerWeek}
          </Text>
        )}
        <Text className="text-xs text-muted-foreground">
          Recommended: 3-6 activities per week for balanced training
        </Text>
      </View>

      {/* Guidance */}
      <View className="bg-blue-500/10 rounded-lg p-4">
        <Text className="text-sm font-semibold text-blue-600 mb-2">
          📊 TSS Guidelines
        </Text>
        <Text className="text-sm text-muted-foreground leading-5">
          • <Text className="font-semibold">100-200 TSS/week:</Text> Recovery or
          maintenance phase
          {"\n"}• <Text className="font-semibold">200-400 TSS/week:</Text> Base
          building, steady improvement
          {"\n"}• <Text className="font-semibold">400-600 TSS/week:</Text> Race
          preparation, high volume
          {"\n"}• <Text className="font-semibold">600+ TSS/week:</Text> Elite
          training, requires careful management
        </Text>
      </View>

      {/* Weekly Breakdown Estimate */}
      {activitiesPerWeek > 0 && (
        <View className="bg-muted/30 rounded-lg p-4">
          <Text className="text-sm font-semibold mb-2">
            Estimated Per-Activity TSS
          </Text>
          <Text className="text-2xl font-bold text-primary mb-1">
            ~{Math.round(averageTSS / activitiesPerWeek)} TSS
          </Text>
          <Text className="text-xs text-muted-foreground">
            Based on {activitiesPerWeek} activities per week
          </Text>
        </View>
      )}
    </View>
  );
}
