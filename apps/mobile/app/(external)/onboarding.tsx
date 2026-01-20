/**
 * Comprehensive Onboarding Flow
 *
 * Multi-step wizard for collecting user profile information and performance metrics.
 *
 * Steps:
 * 1. Basic Profile (Required): DOB, weight, gender, primary sport
 * 2. Heart Rate Metrics (Optional): Max HR, Resting HR, LTHR
 * 3. Sport-Specific Metrics (Optional): FTP/Threshold Pace/VO2max
 * 4. Activity & Equipment (Optional): Training frequency, equipment, goals
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { router } from "expo-router";
import { ArrowLeft, ArrowRight, Calendar, Check, Heart, Zap } from "lucide-react-native";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";

// ================================
// Types
// ================================

interface OnboardingData {
  // Step 1: Basic Profile (Required)
  dob: string | null;
  weight_kg: number | null;
  weight_unit: "kg" | "lbs";
  gender: "male" | "female" | "other" | null;
  primary_sport: "cycling" | "running" | "swimming" | "triathlon" | "other" | null;

  // Step 2: Heart Rate Metrics (Optional)
  max_hr: number | null;
  resting_hr: number | null;
  lthr: number | null;

  // Step 3: Sport-Specific Metrics (Optional)
  ftp: number | null; // watts (cycling)
  threshold_pace: number | null; // seconds per km (running)
  vo2max: number | null; // ml/kg/min

  // Step 4: Activity & Equipment (Optional)
  training_frequency: "1-2" | "3-4" | "5-6" | "7+" | null;
  equipment: string[]; // multi-select
  goals: string[]; // multi-select
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

// ================================
// Main Component
// ================================

export default function OnboardingScreen() {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalSteps = 4;

  // Update data helper
  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
    // Clear errors for updated fields
    Object.keys(updates).forEach((key) => {
      if (errors[key]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[key];
          return newErrors;
        });
      }
    });
  };

  // Navigation handlers
  const goNext = () => {
    if (validate()) {
      if (currentStep < totalSteps) {
        setCurrentStep((prev) => prev + 1);
      } else {
        handleComplete();
      }
    }
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const skip = () => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (currentStep === 1) {
      // Step 1 is required
      if (!data.dob) newErrors.dob = "Date of birth is required";
      if (!data.weight_kg || data.weight_kg <= 0) {
        newErrors.weight_kg = "Weight must be greater than 0";
      }
      if (!data.gender) newErrors.gender = "Gender is required";
      if (!data.primary_sport) newErrors.primary_sport = "Primary sport is required";
    }

    // Steps 2-4 are optional, no validation needed

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Completion handler
  const createProfileMetricsMutation = trpc.profileMetrics.create.useMutation();
  const createPerformanceMetricsMutation =
    trpc.profilePerformanceMetrics.create.useMutation();
  const updateProfileMutation = trpc.profiles.update.useMutation();

  const handleComplete = async () => {
    try {
      console.log("[Onboarding] Submitting profile data:", data);

      // 1. Update profile with basic info
      await updateProfileMutation.mutateAsync({
        dob: data.dob || undefined,
        onboarded: true,
      });

      // 2. Create profile metrics (weight)
      if (data.weight_kg) {
        await createProfileMetricsMutation.mutateAsync({
          metric_type: "weight",
          value: data.weight_kg,
          unit: "kg",
          source: "user_input",
          recorded_at: new Date().toISOString(),
        });
      }

      // 3. Create performance metrics
      const recordedAt = new Date().toISOString();

      // Heart rate metrics
      if (data.max_hr && data.primary_sport) {
        await createPerformanceMetricsMutation.mutateAsync({
          category: data.primary_sport,
          type: "heart_rate",
          value: data.max_hr,
          unit: "bpm",
          duration_seconds: 0,
          source: "user_input",
          recorded_at: recordedAt,
          notes: "Max heart rate from onboarding",
        });
      }

      if (data.lthr && data.primary_sport) {
        await createPerformanceMetricsMutation.mutateAsync({
          category: data.primary_sport,
          type: "heart_rate",
          value: data.lthr,
          unit: "bpm",
          duration_seconds: 3600, // 1 hour threshold
          source: "user_input",
          recorded_at: recordedAt,
          notes: "Lactate threshold HR from onboarding",
        });
      }

      // Power metrics (cycling)
      if (data.ftp && (data.primary_sport === "cycling" || data.primary_sport === "triathlon")) {
        await createPerformanceMetricsMutation.mutateAsync({
          category: "bike",
          type: "power",
          value: data.ftp,
          unit: "watts",
          duration_seconds: 3600, // 1 hour FTP
          source: "user_input",
          recorded_at: recordedAt,
          notes: "FTP from onboarding",
        });
      }

      // Pace metrics (running)
      if (
        data.threshold_pace &&
        (data.primary_sport === "running" || data.primary_sport === "triathlon")
      ) {
        await createPerformanceMetricsMutation.mutateAsync({
          category: "run",
          type: "pace",
          value: data.threshold_pace,
          unit: "seconds_per_km",
          duration_seconds: 3600, // 1 hour threshold
          source: "user_input",
          recorded_at: recordedAt,
          notes: "Threshold pace from onboarding",
        });
      }

      // Navigate to main app
      console.log("[Onboarding] Profile setup complete");
      Alert.alert("Welcome to GradientPeak!", "Your profile has been set up successfully.", [
        {
          text: "Get Started",
          onPress: () => router.replace("/(internal)/(tabs)/home"),
        },
      ]);
    } catch (error) {
      console.error("[Onboarding] Failed to save profile:", error);
      Alert.alert(
        "Error",
        "Failed to save your profile. Please try again.",
        [{ text: "OK" }]
      );
    }
  };

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1BasicProfile data={data} updateData={updateData} errors={errors} />;
      case 2:
        return <Step2HeartRateMetrics data={data} updateData={updateData} errors={errors} />;
      case 3:
        return (
          <Step3SportSpecificMetrics data={data} updateData={updateData} errors={errors} />
        );
      case 4:
        return <Step4ActivityEquipment data={data} updateData={updateData} errors={errors} />;
      default:
        return null;
    }
  };

  const isLastStep = currentStep === totalSteps;
  const isFirstStep = currentStep === 1;
  const isOptionalStep = currentStep > 1;

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 pb-8">
        {/* Progress Indicator */}
        <View className="mb-6">
          <Text className="text-sm text-muted-foreground mb-2">
            Step {currentStep} of {totalSteps}
          </Text>
          <View className="flex-row gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View
                key={i}
                className={`flex-1 h-2 rounded-full ${
                  i < currentStep ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </View>
        </View>

        {/* Step Content */}
        {renderStep()}

        {/* Navigation Buttons */}
        <View className="mt-6 gap-3">
          {/* Next/Complete Button */}
          <Button onPress={goNext} size="lg">
            <Text className="text-primary-foreground font-semibold">
              {isLastStep ? "Complete Setup" : "Next"}
            </Text>
            {!isLastStep && <Icon as={ArrowRight} className="text-primary-foreground ml-2" />}
            {isLastStep && <Icon as={Check} className="text-primary-foreground ml-2" />}
          </Button>

          {/* Skip Button (optional steps only) */}
          {isOptionalStep && (
            <Button variant="ghost" onPress={skip}>
              <Text className="text-muted-foreground">
                {isLastStep ? "Skip & Finish" : "Skip for Now"}
              </Text>
            </Button>
          )}

          {/* Back Button */}
          {!isFirstStep && (
            <Button variant="outline" onPress={goBack}>
              <Icon as={ArrowLeft} className="text-foreground mr-2" />
              <Text className="text-foreground">Back</Text>
            </Button>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

// ================================
// Step Components
// ================================

interface StepProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  errors: Record<string, string>;
}

function Step1BasicProfile({ data, updateData, errors }: StepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Profile Information</CardTitle>
        <CardDescription>Let's start with the essentials</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {/* Date of Birth */}
        <View>
          <Label>Date of Birth *</Label>
          <Input
            placeholder="YYYY-MM-DD"
            value={data.dob || ""}
            onChangeText={(text) => updateData({ dob: text })}
          />
          {errors.dob && <Text className="text-destructive text-sm mt-1">{errors.dob}</Text>}
        </View>

        {/* Weight */}
        <View>
          <Label>Weight *</Label>
          <View className="flex-row gap-2">
            <Input
              placeholder="70"
              keyboardType="numeric"
              value={data.weight_kg?.toString() || ""}
              onChangeText={(text) => {
                const value = parseFloat(text);
                updateData({ weight_kg: isNaN(value) ? null : value });
              }}
              className="flex-1"
            />
            <Button
              variant="outline"
              onPress={() =>
                updateData({ weight_unit: data.weight_unit === "kg" ? "lbs" : "kg" })
              }
              className="px-4"
            >
              <Text>{data.weight_unit}</Text>
            </Button>
          </View>
          {errors.weight_kg && (
            <Text className="text-destructive text-sm mt-1">{errors.weight_kg}</Text>
          )}
        </View>

        {/* Gender */}
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
                  className={
                    data.gender === gender ? "text-primary-foreground" : "text-foreground"
                  }
                >
                  {gender.charAt(0).toUpperCase() + gender.slice(1)}
                </Text>
              </Button>
            ))}
          </View>
          {errors.gender && <Text className="text-destructive text-sm mt-1">{errors.gender}</Text>}
        </View>

        {/* Primary Sport */}
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
          {errors.primary_sport && (
            <Text className="text-destructive text-sm mt-1">{errors.primary_sport}</Text>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

function Step2HeartRateMetrics({ data, updateData, errors }: StepProps) {
  // Calculate age from DOB for estimation
  const calculateAge = (): number => {
    if (!data.dob) return 30; // Default
    const birthDate = new Date(data.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const estimateMaxHR = () => {
    const age = calculateAge();
    const estimated = 220 - age;
    updateData({ max_hr: estimated });
  };

  const estimateLTHR = () => {
    if (data.max_hr) {
      const estimated = Math.round(data.max_hr * 0.85);
      updateData({ lthr: estimated });
    } else {
      Alert.alert("Max HR Required", "Please enter your max heart rate first.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Heart Rate Metrics</CardTitle>
        <CardDescription>Optional - We can estimate these for you</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {/* Max Heart Rate */}
        <View>
          <Label>Max Heart Rate (bpm)</Label>
          <Text className="text-xs text-muted-foreground mb-2">
            Your max HR during hardest effort
          </Text>
          <View className="flex-row gap-2">
            <Input
              placeholder="190"
              keyboardType="numeric"
              value={data.max_hr?.toString() || ""}
              onChangeText={(text) => {
                const value = parseInt(text);
                updateData({ max_hr: isNaN(value) ? null : value });
              }}
              className="flex-1"
            />
            <Button variant="outline" onPress={estimateMaxHR} className="px-4">
              <Text>Estimate</Text>
            </Button>
          </View>
          <Text className="text-xs text-muted-foreground mt-1">
            Formula: 220 - age = {220 - calculateAge()} bpm
          </Text>
        </View>

        {/* Resting Heart Rate */}
        <View>
          <Label>Resting Heart Rate (bpm)</Label>
          <Text className="text-xs text-muted-foreground mb-2">
            Measure first thing in the morning
          </Text>
          <Input
            placeholder="60"
            keyboardType="numeric"
            value={data.resting_hr?.toString() || ""}
            onChangeText={(text) => {
              const value = parseInt(text);
              updateData({ resting_hr: isNaN(value) ? null : value });
            }}
          />
        </View>

        {/* Lactate Threshold HR */}
        <View>
          <Label>Lactate Threshold HR (LTHR)</Label>
          <Text className="text-xs text-muted-foreground mb-2">
            HR you can sustain for ~1 hour
          </Text>
          <View className="flex-row gap-2">
            <Input
              placeholder="170"
              keyboardType="numeric"
              value={data.lthr?.toString() || ""}
              onChangeText={(text) => {
                const value = parseInt(text);
                updateData({ lthr: isNaN(value) ? null : value });
              }}
              className="flex-1"
            />
            <Button variant="outline" onPress={estimateLTHR} className="px-4">
              <Text>Estimate</Text>
            </Button>
          </View>
          {data.max_hr && (
            <Text className="text-xs text-muted-foreground mt-1">
              Formula: 85% of max HR = {Math.round(data.max_hr * 0.85)} bpm
            </Text>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

function Step3SportSpecificMetrics({ data, updateData, errors }: StepProps) {
  const estimateFTP = () => {
    if (data.weight_kg) {
      const estimated = Math.round(data.weight_kg * 2.5); // 2.5 W/kg for recreational
      updateData({ ftp: estimated });
    } else {
      Alert.alert("Weight Required", "Please enter your weight in Step 1 first.");
    }
  };

  const showCyclingMetrics =
    data.primary_sport === "cycling" || data.primary_sport === "triathlon";
  const showRunningMetrics =
    data.primary_sport === "running" || data.primary_sport === "triathlon";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sport-Specific Metrics</CardTitle>
        <CardDescription>Optional - Based on your primary sport</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {/* FTP (Cycling/Triathlon) */}
        {showCyclingMetrics && (
          <View>
            <Label>FTP - Functional Threshold Power (watts)</Label>
            <Text className="text-xs text-muted-foreground mb-2">
              Power you can sustain for ~1 hour
            </Text>
            <View className="flex-row gap-2">
              <Input
                placeholder="250"
                keyboardType="numeric"
                value={data.ftp?.toString() || ""}
                onChangeText={(text) => {
                  const value = parseInt(text);
                  updateData({ ftp: isNaN(value) ? null : value });
                }}
                className="flex-1"
              />
              <Button variant="outline" onPress={estimateFTP} className="px-4">
                <Text>Estimate</Text>
              </Button>
            </View>
            {data.weight_kg && (
              <Text className="text-xs text-muted-foreground mt-1">
                Formula: 2.5 W/kg × {data.weight_kg} kg = {Math.round(data.weight_kg * 2.5)} watts
              </Text>
            )}
          </View>
        )}

        {/* Threshold Pace (Running/Triathlon) */}
        {showRunningMetrics && (
          <View>
            <Label>Threshold Pace (min/km)</Label>
            <Text className="text-xs text-muted-foreground mb-2">
              Pace you can sustain for ~1 hour
            </Text>
            <Input
              placeholder="5:00 (5 min per km)"
              value={data.threshold_pace ? `${Math.floor(data.threshold_pace / 60)}:${(data.threshold_pace % 60).toString().padStart(2, "0")}` : ""}
              onChangeText={(text) => {
                // Parse "M:SS" format to seconds
                const parts = text.split(":");
                if (parts.length === 2) {
                  const mins = parseInt(parts[0]);
                  const secs = parseInt(parts[1]);
                  if (!isNaN(mins) && !isNaN(secs)) {
                    updateData({ threshold_pace: mins * 60 + secs });
                  }
                }
              }}
            />
          </View>
        )}

        {/* VO2max (Optional for all) */}
        <View>
          <Label>VO2max (ml/kg/min)</Label>
          <Text className="text-xs text-muted-foreground mb-2">Optional - Advanced metric</Text>
          <Input
            placeholder="45"
            keyboardType="numeric"
            value={data.vo2max?.toString() || ""}
            onChangeText={(text) => {
              const value = parseFloat(text);
              updateData({ vo2max: isNaN(value) ? null : value });
            }}
          />
        </View>

        {!showCyclingMetrics && !showRunningMetrics && (
          <View className="p-4 bg-muted rounded-lg">
            <Text className="text-sm text-muted-foreground">
              Sport-specific metrics are available for cycling, running, and triathlon.
              Select one of these sports in Step 1 to enter performance metrics.
            </Text>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

function Step4ActivityEquipment({ data, updateData, errors }: StepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity & Equipment</CardTitle>
        <CardDescription>Optional - Help us personalize your experience</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {/* Training Frequency */}
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
                    data.training_frequency === freq
                      ? "text-primary-foreground"
                      : "text-foreground"
                  }
                >
                  {freq} days
                </Text>
              </Button>
            ))}
          </View>
        </View>

        {/* Equipment - Coming soon placeholder */}
        <View className="p-4 bg-muted rounded-lg">
          <Text className="text-sm text-muted-foreground">
            Equipment tracking and goals selection will be available soon.
            You can update these in settings after onboarding.
          </Text>
        </View>
      </CardContent>
    </Card>
  );
}
