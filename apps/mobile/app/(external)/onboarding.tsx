import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Label } from "@repo/ui/components/label";
import { Text } from "@repo/ui/components/text";
import { router } from "expo-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react-native";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { PaceSecondsField } from "@/components/profile/PaceSecondsField";
import { WeightInputField } from "@/components/profile/WeightInputField";
import { DateField } from "@/components/training-plan/create/inputs/DateField";
import { estimateFtpFromWeight, estimateMaxHrFromDob } from "@/lib/profile/metricUnits";
import { trpc } from "@/lib/trpc";

interface OnboardingData {
  dob: string | null;
  weight_kg: number | null;
  weight_unit: "kg" | "lbs";
  gender: "male" | "female" | "other" | null;
  primary_sport: "cycling" | "running" | "swimming" | "triathlon" | "other" | null;
  max_hr: number | null;
  resting_hr: number | null;
  lthr: number | null;
  ftp: number | null;
  threshold_pace: number | null;
  vo2max: number | null;
  training_frequency: "1-2" | "3-4" | "5-6" | "7+" | null;
  equipment: string[];
  goals: string[];
}

const INITIAL_DATA: OnboardingData = {
  dob: null,
  weight_kg: null,
  weight_unit: "kg",
  gender: null,
  primary_sport: null,
  max_hr: null,
  resting_hr: null,
  lthr: null,
  ftp: null,
  threshold_pace: null,
  vo2max: null,
  training_frequency: null,
  equipment: [],
  goals: [],
};

export default function OnboardingScreen() {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: profile } = trpc.profiles.get.useQuery();
  const createProfileMetricsMutation = trpc.profileMetrics.create.useMutation();
  const updateProfileMutation = trpc.profiles.update.useMutation();

  const totalSteps = 4;

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
    Object.keys(updates).forEach((key) => {
      if (errors[key]) {
        setErrors((prev) => {
          const nextErrors = { ...prev };
          delete nextErrors[key];
          return nextErrors;
        });
      }
    });
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (currentStep === 1) {
      if (!data.dob) nextErrors.dob = "Date of birth is required";
      if (!data.weight_kg || data.weight_kg <= 0) {
        nextErrors.weight_kg = "Weight must be greater than 0";
      }
      if (!data.gender) nextErrors.gender = "Gender is required";
      if (!data.primary_sport) {
        nextErrors.primary_sport = "Primary sport is required";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleComplete = async () => {
    try {
      if (!profile?.id) {
        Alert.alert("Error", "User profile not found. Please try again.");
        return;
      }

      await updateProfileMutation.mutateAsync({
        dob: data.dob || undefined,
      });

      if (data.weight_kg) {
        await createProfileMetricsMutation.mutateAsync({
          profile_id: profile.id,
          metric_type: "weight_kg",
          value: data.weight_kg,
          unit: "kg",
          recorded_at: new Date().toISOString(),
        });
      }

      Alert.alert("Welcome to GradientPeak!", "Your profile has been set up successfully.", [
        {
          text: "Get Started",
          onPress: () => router.replace("/(internal)/(tabs)/home" as any),
        },
      ]);
    } catch (error) {
      console.error("[Onboarding] Failed to save profile:", error);
      Alert.alert("Error", "Failed to save your profile. Please try again.", [{ text: "OK" }]);
    }
  };

  const goNext = () => {
    if (!validate()) {
      return;
    }

    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
      return;
    }

    void handleComplete();
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const skip = () => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
      return;
    }

    void handleComplete();
  };

  const isLastStep = currentStep === totalSteps;
  const isFirstStep = currentStep === 1;
  const isOptionalStep = currentStep > 1;

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 pb-8">
        <View className="mb-6">
          <Text className="text-sm text-muted-foreground mb-2">
            Step {currentStep} of {totalSteps}
          </Text>
          <View className="flex-row gap-2">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <View
                key={index}
                className={`flex-1 h-2 rounded-full ${
                  index < currentStep ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </View>
        </View>

        {currentStep === 1 ? (
          <Step1BasicProfile data={data} updateData={updateData} errors={errors} />
        ) : null}
        {currentStep === 2 ? <Step2HeartRateMetrics data={data} updateData={updateData} /> : null}
        {currentStep === 3 ? (
          <Step3SportSpecificMetrics data={data} updateData={updateData} />
        ) : null}
        {currentStep === 4 ? <Step4ActivityEquipment data={data} updateData={updateData} /> : null}

        <View className="mt-6 gap-3">
          <Button onPress={goNext} size="lg">
            <Text className="text-primary-foreground font-semibold">
              {isLastStep ? "Complete Setup" : "Next"}
            </Text>
            {isLastStep ? (
              <Icon as={Check} className="text-primary-foreground ml-2" />
            ) : (
              <Icon as={ArrowRight} className="text-primary-foreground ml-2" />
            )}
          </Button>

          {isOptionalStep ? (
            <Button variant="ghost" onPress={skip}>
              <Text className="text-muted-foreground">
                {isLastStep ? "Skip & Finish" : "Skip for Now"}
              </Text>
            </Button>
          ) : null}

          {!isFirstStep ? (
            <Button variant="outline" onPress={goBack}>
              <Icon as={ArrowLeft} className="text-foreground mr-2" />
              <Text className="text-foreground">Back</Text>
            </Button>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

interface StepProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
}

interface RequiredStepProps extends StepProps {
  errors: Record<string, string>;
}

function Step1BasicProfile({ data, updateData, errors }: RequiredStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Profile Information</CardTitle>
        <CardDescription>Let&apos;s start with the essentials</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        <View>
          <DateField
            id="external-onboarding-dob"
            label="Date of Birth"
            value={data.dob ?? undefined}
            onChange={(nextDate) => updateData({ dob: nextDate ?? null })}
            helperText="Used for age-based estimates and training zones."
            placeholder="Select date of birth"
            maximumDate={new Date()}
          />
          {errors.dob ? <Text className="text-destructive text-sm mt-1">{errors.dob}</Text> : null}
        </View>

        <View>
          <WeightInputField
            id="external-onboarding-weight"
            label="Weight"
            valueKg={data.weight_kg}
            onChangeKg={(weight_kg) => updateData({ weight_kg })}
            unit={data.weight_unit}
            onUnitChange={(weight_unit) => updateData({ weight_unit })}
            helperText="Use kg or lbs. We keep the saved metric aligned either way."
            placeholder={data.weight_unit === "kg" ? "70.0" : "154.3"}
            required
          />
          {errors.weight_kg ? (
            <Text className="text-destructive text-sm mt-1">{errors.weight_kg}</Text>
          ) : null}
        </View>

        <View>
          <Label>Gender *</Label>
          <View className="flex-row gap-2">
            {(["male", "female", "other"] as const).map((gender) => (
              <Button
                key={gender}
                variant={data.gender === gender ? "default" : "outline"}
                onPress={() => updateData({ gender })}
                className="flex-1"
              >
                <Text
                  className={data.gender === gender ? "text-primary-foreground" : "text-foreground"}
                >
                  {gender.charAt(0).toUpperCase() + gender.slice(1)}
                </Text>
              </Button>
            ))}
          </View>
          {errors.gender ? (
            <Text className="text-destructive text-sm mt-1">{errors.gender}</Text>
          ) : null}
        </View>

        <View>
          <Label>Primary Sport *</Label>
          <View className="flex-row flex-wrap gap-2">
            {(["cycling", "running", "swimming", "triathlon", "other"] as const).map((sport) => (
              <Button
                key={sport}
                variant={data.primary_sport === sport ? "default" : "outline"}
                onPress={() => updateData({ primary_sport: sport })}
                className="flex-grow"
              >
                <Text
                  className={
                    data.primary_sport === sport ? "text-primary-foreground" : "text-foreground"
                  }
                >
                  {sport.charAt(0).toUpperCase() + sport.slice(1)}
                </Text>
              </Button>
            ))}
          </View>
          {errors.primary_sport ? (
            <Text className="text-destructive text-sm mt-1">{errors.primary_sport}</Text>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

function Step2HeartRateMetrics({ data, updateData }: StepProps) {
  const estimatedMaxHr = estimateMaxHrFromDob(data.dob);

  const estimateMaxHR = () => {
    if (!estimatedMaxHr) {
      Alert.alert(
        "Date of Birth Required",
        "Add your date of birth in Step 1 to estimate max heart rate.",
      );
      return;
    }

    updateData({ max_hr: estimatedMaxHr });
  };

  const estimateLTHR = () => {
    if (!data.max_hr) {
      Alert.alert("Max HR Required", "Please enter your max heart rate first.");
      return;
    }

    updateData({ lthr: Math.round(data.max_hr * 0.85) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Heart Rate Metrics</CardTitle>
        <CardDescription>Optional - Add tested values now or estimate later</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        <View>
          <Label>Max Heart Rate (bpm)</Label>
          <Text className="text-xs text-muted-foreground mb-2">
            Your highest heart rate during an all-out effort.
          </Text>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <BoundedNumberInput
                id="external-onboarding-max-hr"
                label=""
                value={data.max_hr?.toString() ?? ""}
                onChange={(value) => {
                  if (!value.trim()) {
                    updateData({ max_hr: null });
                  }
                }}
                onNumberChange={(value) => updateData({ max_hr: value ? Math.round(value) : null })}
                min={100}
                max={220}
                decimals={0}
                unitLabel="bpm"
                placeholder="190"
                helperText=""
              />
            </View>
            <Button variant="outline" onPress={estimateMaxHR} className="px-4">
              <Text>Estimate</Text>
            </Button>
          </View>
          <Text className="text-xs text-muted-foreground mt-1">
            {estimatedMaxHr
              ? `Age-based estimate: ${estimatedMaxHr} bpm`
              : "Add date of birth in Step 1 for an age-based estimate."}
          </Text>
        </View>

        <View>
          <Label>Resting Heart Rate (bpm)</Label>
          <Text className="text-xs text-muted-foreground mb-2">
            Best measured first thing in the morning.
          </Text>
          <BoundedNumberInput
            id="external-onboarding-resting-hr"
            label=""
            value={data.resting_hr?.toString() ?? ""}
            onChange={(value) => {
              if (!value.trim()) {
                updateData({ resting_hr: null });
              }
            }}
            onNumberChange={(value) => updateData({ resting_hr: value ? Math.round(value) : null })}
            min={30}
            max={100}
            decimals={0}
            unitLabel="bpm"
            placeholder="60"
            helperText=""
          />
        </View>

        <View>
          <Label>Lactate Threshold HR (LTHR)</Label>
          <Text className="text-xs text-muted-foreground mb-2">
            Optional. Usually close to the best heart rate you can hold for about an hour.
          </Text>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <BoundedNumberInput
                id="external-onboarding-lthr"
                label=""
                value={data.lthr?.toString() ?? ""}
                onChange={(value) => {
                  if (!value.trim()) {
                    updateData({ lthr: null });
                  }
                }}
                onNumberChange={(value) => updateData({ lthr: value ? Math.round(value) : null })}
                min={80}
                max={210}
                decimals={0}
                unitLabel="bpm"
                placeholder="170"
                helperText=""
              />
            </View>
            <Button variant="outline" onPress={estimateLTHR} className="px-4">
              <Text>Estimate</Text>
            </Button>
          </View>
          {data.max_hr ? (
            <Text className="text-xs text-muted-foreground mt-1">
              Quick estimate: about 85% of max HR = {Math.round(data.max_hr * 0.85)} bpm
            </Text>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

function Step3SportSpecificMetrics({ data, updateData }: StepProps) {
  const estimatedFtp = estimateFtpFromWeight(data.weight_kg);
  const showCyclingMetrics = data.primary_sport === "cycling" || data.primary_sport === "triathlon";
  const showRunningMetrics = data.primary_sport === "running" || data.primary_sport === "triathlon";

  const estimateFTP = () => {
    if (!estimatedFtp) {
      Alert.alert("Weight Required", "Please enter your weight in Step 1 first.");
      return;
    }

    updateData({ ftp: estimatedFtp });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sport-Specific Metrics</CardTitle>
        <CardDescription>Optional - Based on your primary sport</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {showCyclingMetrics ? (
          <View>
            <Label>FTP - Functional Threshold Power (watts)</Label>
            <Text className="text-xs text-muted-foreground mb-2">
              Optional. Use a tested value or start with a conservative estimate.
            </Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <BoundedNumberInput
                  id="external-onboarding-ftp"
                  label=""
                  value={data.ftp?.toString() ?? ""}
                  onChange={(value) => {
                    if (!value.trim()) {
                      updateData({ ftp: null });
                    }
                  }}
                  onNumberChange={(value) => updateData({ ftp: value ? Math.round(value) : null })}
                  min={50}
                  max={500}
                  decimals={0}
                  unitLabel="W"
                  placeholder="250"
                  helperText=""
                />
              </View>
              <Button variant="outline" onPress={estimateFTP} className="px-4">
                <Text>Estimate</Text>
              </Button>
            </View>
            <Text className="text-xs text-muted-foreground mt-1">
              {estimatedFtp && data.weight_kg
                ? `Quick estimate: 2.5 W/kg x ${data.weight_kg} kg = ${estimatedFtp} W`
                : "Add your weight in Step 1 for a quick estimate."}
            </Text>
          </View>
        ) : null}

        {showRunningMetrics ? (
          <PaceSecondsField
            id="external-onboarding-threshold-pace"
            label="Threshold Pace"
            valueSeconds={data.threshold_pace}
            onChangeSeconds={(threshold_pace) => updateData({ threshold_pace })}
            helperText="Optional. Enter your hard 20-40 minute pace in mm:ss per kilometer."
            placeholder="4:30"
          />
        ) : null}

        <View>
          <Label>VO2max (ml/kg/min)</Label>
          <Text className="text-xs text-muted-foreground mb-2">
            Optional if you know it from a recent test or wearable estimate.
          </Text>
          <BoundedNumberInput
            id="external-onboarding-vo2max"
            label=""
            value={data.vo2max?.toString() ?? ""}
            onChange={(value) => {
              if (!value.trim()) {
                updateData({ vo2max: null });
              }
            }}
            onNumberChange={(value) => updateData({ vo2max: value ?? null })}
            min={20}
            max={90}
            decimals={1}
            unitLabel="ml/kg/min"
            placeholder="45"
            helperText=""
          />
        </View>

        {!showCyclingMetrics && !showRunningMetrics ? (
          <View className="p-4 bg-muted rounded-lg">
            <Text className="text-sm text-muted-foreground">
              Sport-specific metrics are available for cycling, running, and triathlon. Select one
              of those sports in Step 1 to add them now, or skip and update later.
            </Text>
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Step4ActivityEquipment({ data, updateData }: StepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity & Equipment</CardTitle>
        <CardDescription>Optional - Help us personalize your experience</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        <View>
          <Label>Training Frequency (days per week)</Label>
          <View className="flex-row flex-wrap gap-2 mt-2">
            {(["1-2", "3-4", "5-6", "7+"] as const).map((freq) => (
              <Button
                key={freq}
                variant={data.training_frequency === freq ? "default" : "outline"}
                onPress={() => updateData({ training_frequency: freq })}
                className="flex-grow"
              >
                <Text
                  className={
                    data.training_frequency === freq ? "text-primary-foreground" : "text-foreground"
                  }
                >
                  {freq} days
                </Text>
              </Button>
            ))}
          </View>
        </View>

        <View className="p-4 bg-muted rounded-lg">
          <Text className="text-sm text-muted-foreground">
            Equipment tracking and goal selection will be available soon. You can update them later
            in settings.
          </Text>
        </View>
      </CardContent>
    </Card>
  );
}
