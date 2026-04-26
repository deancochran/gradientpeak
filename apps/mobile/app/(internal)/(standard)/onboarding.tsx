import {
  estimateConservativeFTPFromWeight,
  estimateMaxHRFromDOB,
  formatWeightForDisplay,
} from "@repo/core";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { DateInput as DateField } from "@repo/ui/components/date-input";
import { Icon } from "@repo/ui/components/icon";
import { PaceSecondsField } from "@repo/ui/components/pace-seconds-field";
import { Progress } from "@repo/ui/components/progress";
import { Text } from "@repo/ui/components/text";
import { WeightInputField } from "@repo/ui/components/weight-input-field";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Activity, ArrowRight, Check, ChevronRight } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";

type HealthKitPermissions = {
  permissions: {
    read: string[];
    write: string[];
  };
};

type AppleHealthKitModule = {
  Constants: {
    Permissions: Record<string, string>;
  };
  initHealthKit: (
    permissions: HealthKitPermissions,
    callback: (error: string | null) => void,
  ) => void;
};

// ================================
// Types
// ================================

interface OnboardingData {
  experience_level: "beginner" | "intermediate" | "advanced" | "skip" | null;
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
  css: number | null;
  vo2max: number | null;
  training_frequency: "1-2" | "3-4" | "5-6" | "7+" | null;
  equipment: string[];
  goals: string[];
}

function getMobileRedirectUri(): string {
  if (Constants.expoConfig?.extra?.redirectUri) {
    return Constants.expoConfig.extra.redirectUri;
  }

  return Linking.createURL("integrations");
}

const INITIAL_DATA: OnboardingData = {
  experience_level: null,
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
  css: null,
  vo2max: null,
  training_frequency: null,
  equipment: [],
  goals: [],
};

// ================================
// Step Configuration
// ================================

type StepId =
  | "intro"
  | "experience"
  | "gender"
  | "dob"
  | "weight"
  | "sport"
  | "max_hr"
  | "resting_hr"
  | "ftp"
  | "threshold_pace"
  | "css"
  | "integrations"
  | "summary";

interface StepConfig {
  canSkip: boolean;
  id: StepId;
  component: React.FC<StepProps>;
  shouldShow: (data: OnboardingData) => boolean;
  isValid: (data: OnboardingData) => boolean;
  title?: string;
}

interface StepProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
}

// ================================
// Helper Components
// ================================

// ================================
// Step Components
// ================================

const IntroStep = () => (
  <View className="items-center justify-center flex-1 py-8">
    <View className="w-24 h-24 bg-primary/10 rounded-full items-center justify-center mb-6">
      <Icon as={Activity} size={48} className="text-primary" />
    </View>
    <Text className="text-2xl font-bold text-center mb-2">Welcome to GradientPeak</Text>
    <Text className="text-center text-muted-foreground px-4">
      Let&apos;s customize your experience. This will only take a minute.
    </Text>
  </View>
);

const ExperienceStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">What&apos;s your experience?</Text>
    {(["beginner", "intermediate", "advanced"] as const).map((level) => (
      <TouchableOpacity
        key={level}
        onPress={() => updateData({ experience_level: level })}
        testID={`onboarding-experience-${level}`}
        className={`p-4 border rounded-xl flex-row items-center justify-between ${
          data.experience_level === level ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <View>
          <Text className="font-semibold capitalize text-lg">{level}</Text>
          <Text className="text-muted-foreground text-sm">
            {level === "beginner"
              ? "New to training metrics"
              : level === "intermediate"
                ? "Familiar with zones"
                : "Data obsessed"}
          </Text>
        </View>
        {data.experience_level === level && <Icon as={Check} className="text-primary" />}
      </TouchableOpacity>
    ))}
  </View>
);

const GenderStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">How do you identify?</Text>
    {(["male", "female", "other"] as const).map((gender) => (
      <TouchableOpacity
        key={gender}
        onPress={() => updateData({ gender })}
        testID={`onboarding-gender-${gender}`}
        className={`p-4 border rounded-xl flex-row items-center justify-between ${
          data.gender === gender ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <Text className="font-semibold capitalize text-lg">{gender}</Text>
        {data.gender === gender && <Icon as={Check} className="text-primary" />}
      </TouchableOpacity>
    ))}
  </View>
);

const DobStep = ({ data, updateData }: StepProps) => {
  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold">When were you born?</Text>
      <DateField
        id="onboarding-dob"
        label="Date of birth"
        value={data.dob ?? undefined}
        onChange={(nextDate) => updateData({ dob: nextDate ?? null })}
        helperText="Used for age-based heart rate estimates and training zones."
        placeholder="Select your date of birth"
        maximumDate={new Date()}
        accessibilityHint="Choose your date of birth"
      />
    </View>
  );
};

const WeightStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">What is your weight?</Text>
    <WeightInputField
      id="onboarding-weight"
      label="Current weight"
      valueKg={data.weight_kg}
      onChangeKg={(weight_kg) => updateData({ weight_kg })}
      unit={data.weight_unit}
      onUnitChange={(weight_unit) => updateData({ weight_unit })}
      helperText="Switch units if needed. We keep the saved value aligned to your profile metrics."
      placeholder={data.weight_unit === "kg" ? "70.0" : "154.3"}
      required
    />
  </View>
);

const SportStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">Primary Sport</Text>
    {["cycling", "running", "swimming", "triathlon", "other"].map((sport) => (
      <TouchableOpacity
        key={sport}
        onPress={() => updateData({ primary_sport: sport as any })}
        testID={`onboarding-sport-${sport}`}
        className={`p-4 border rounded-xl flex-row items-center justify-between ${
          data.primary_sport === sport ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <Text className="font-semibold capitalize text-lg">{sport}</Text>
        {data.primary_sport === sport && <Icon as={Check} className="text-primary" />}
      </TouchableOpacity>
    ))}
  </View>
);

const MaxHrStep = ({ data, updateData }: StepProps) => {
  const estimatedMaxHr = estimateMaxHRFromDOB(data.dob);

  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold mb-2">Max Heart Rate</Text>
      <BoundedNumberInput
        id="onboarding-max-hr"
        label="Max HR"
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
        helperText="Optional. Add a tested value, or use the age-based estimate below."
        placeholder="185"
      />
      {estimatedMaxHr ? (
        <Button variant="outline" onPress={() => updateData({ max_hr: estimatedMaxHr })}>
          <Text>Use estimate ({estimatedMaxHr} bpm)</Text>
        </Button>
      ) : (
        <Text className="text-sm text-muted-foreground">
          Add your date of birth first if you want a quick estimate.
        </Text>
      )}
    </View>
  );
};

const RestingHrStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">Resting Heart Rate</Text>
    <BoundedNumberInput
      id="onboarding-resting-hr"
      label="Resting HR"
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
      helperText="Optional. Best measured first thing in the morning."
      placeholder="60"
    />
  </View>
);

const FtpStep = ({ data, updateData }: StepProps) => {
  const estimatedFtp = estimateConservativeFTPFromWeight(data.weight_kg);

  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold mb-2">Functional Threshold Power (FTP)</Text>
      <BoundedNumberInput
        id="onboarding-ftp"
        label="FTP"
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
        helperText="Optional. Use a recent tested value, or start with a conservative estimate."
        placeholder="250"
      />
      {estimatedFtp ? (
        <Button variant="outline" onPress={() => updateData({ ftp: estimatedFtp })}>
          <Text>Use estimate ({estimatedFtp} W)</Text>
        </Button>
      ) : (
        <Text className="text-sm text-muted-foreground">
          Add your weight first if you want a quick starter estimate.
        </Text>
      )}
    </View>
  );
};

const ThresholdPaceStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">Threshold Running Pace</Text>
    <Text className="text-muted-foreground mb-4">
      Optional. Use your hard 20-40 minute pace if you know it.
    </Text>

    <PaceSecondsField
      id="onboarding-threshold-pace"
      label="Threshold pace"
      valueSeconds={data.threshold_pace}
      onChangeSeconds={(threshold_pace) => updateData({ threshold_pace })}
      helperText="Enter pace in mm:ss per kilometer."
      placeholder="4:30"
    />
  </View>
);

const CssStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">Critical Swim Speed</Text>
    <Text className="text-muted-foreground mb-4">
      Optional. Use your sustainable pace per 100m if you know it.
    </Text>

    <PaceSecondsField
      id="onboarding-css"
      label="CSS"
      valueSeconds={data.css}
      onChangeSeconds={(css) => updateData({ css })}
      helperText="Enter pace in mm:ss per 100 meters."
      placeholder="1:45"
      unitLabel="/100m"
    />
  </View>
);

const IntegrationsStep = ({ data, updateData }: StepProps) => {
  const [connected, setConnected] = useState<string[]>([]);
  const [statusModal, setStatusModal] = useState<null | { title: string; description: string }>(
    null,
  );
  const getAuthUrlMutation = api.integrations.getAuthUrl.useMutation();

  const handleConnect = async (provider: string) => {
    if (provider === "Apple Health") {
      if (Platform.OS !== "ios") {
        setStatusModal({
          title: "Not Available",
          description: "Apple Health is only available on iOS.",
        });
        return;
      }

      let AppleHealthKit: AppleHealthKitModule;
      try {
        AppleHealthKit = require("react-native-health").default as AppleHealthKitModule;
      } catch {
        setStatusModal({
          title: "Not Available",
          description: "Apple Health integration is not available in this build.",
        });
        return;
      }

      const permissions = {
        permissions: {
          read: [
            AppleHealthKit.Constants.Permissions.HeartRate,
            AppleHealthKit.Constants.Permissions.Workout,
            AppleHealthKit.Constants.Permissions.Steps,
            AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
            AppleHealthKit.Constants.Permissions.DistanceCycling,
            AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
            AppleHealthKit.Constants.Permissions.DistanceSwimming,
            AppleHealthKit.Constants.Permissions.Weight,
            AppleHealthKit.Constants.Permissions.BiologicalSex,
            AppleHealthKit.Constants.Permissions.DateOfBirth,
          ],
          write: [AppleHealthKit.Constants.Permissions.Workout],
        },
      } as HealthKitPermissions;

      AppleHealthKit.initHealthKit(permissions, (error) => {
        if (error) {
          console.error("[HealthKit] Error:", error);
          setStatusModal({ title: "Error", description: "Failed to connect to Apple Health." });
          return;
        }
        // Success
        setConnected((prev) => [...prev, "Apple Health"]);
        setStatusModal({ title: "Success", description: "Connected to Apple Health!" });
      });
      return;
    }

    // Map display name to provider enum
    const providerMap: Record<string, string> = {
      Strava: "strava",
      Garmin: "garmin",
      Wahoo: "wahoo",
      TrainingPeaks: "trainingpeaks",
      Zwift: "zwift",
    };

    const providerKey = providerMap[provider];
    if (!providerKey) {
      setStatusModal({
        title: "Coming Soon",
        description: `Connection to ${provider} will be available in the next update.`,
      });
      return;
    }

    try {
      const redirectUri = getMobileRedirectUri();
      const { url } = await getAuthUrlMutation.mutateAsync({
        provider: providerKey as any,
        redirectUri,
      });

      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);

      if (result.type === "success") {
        setConnected((prev) => [...prev, provider]);
        setStatusModal({ title: "Success", description: `Connected to ${provider}` });
      }
    } catch (error) {
      console.error(error);
      setStatusModal({ title: "Error", description: `Failed to connect to ${provider}.` });
    }
  };

  const providers = [
    { name: "Apple Health", color: "#000000" },
    { name: "Garmin", color: "#007CC3" },
    { name: "Strava", color: "#FC4C02" },
    { name: "TrainingPeaks", color: "#0074D9" },
    { name: "Wahoo", color: "#003D7C" },
    { name: "Whoop", color: "#CE0F2D" },
    { name: "Zwift", color: "#FC6719" },
  ];

  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold mb-2">Connect Accounts</Text>
      <Text className="text-muted-foreground mb-4">Sync your activities automatically.</Text>

      {providers.map((service) => (
        <TouchableOpacity
          key={service.name}
          onPress={() => handleConnect(service.name)}
          className={`flex-row items-center justify-between p-4 border rounded-xl mb-2 ${
            connected.includes(service.name)
              ? "border-green-500 bg-green-500/10"
              : "border-border bg-card"
          }`}
        >
          <View className="flex-row items-center gap-3">
            <View className="w-8 h-8 rounded bg-muted items-center justify-center">
              {/* Placeholder for logo */}
              <Text className="font-bold text-xs">{service.name[0]}</Text>
            </View>
            <Text className="font-semibold">{service.name}</Text>
          </View>
          {connected.includes(service.name) ? (
            <Icon as={Check} className="text-green-600" size={20} />
          ) : (
            <Icon as={ChevronRight} className="text-muted-foreground" size={20} />
          )}
        </TouchableOpacity>
      ))}
      {statusModal ? (
        <AppConfirmModal
          description={statusModal.description}
          onClose={() => setStatusModal(null)}
          primaryAction={{
            label: "OK",
            onPress: () => setStatusModal(null),
            testID: "onboarding-integrations-status-confirm",
          }}
          testID="onboarding-integrations-status-modal"
          title={statusModal.title}
        />
      ) : null}
    </View>
  );
};

const SummaryStep = ({ data }: { data: OnboardingData }) => {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const summaryItems = [
    { label: "Experience", value: data.experience_level, capitalize: true },
    { label: "Gender", value: data.gender, capitalize: true },
    { label: "Date of Birth", value: data.dob },
    {
      label: "Weight",
      value: data.weight_kg
        ? `${formatWeightForDisplay(data.weight_kg, data.weight_unit)} ${data.weight_unit}`
        : null,
    },
    { label: "Primary Sport", value: data.primary_sport, capitalize: true },
    {
      label: "Max HR",
      value: data.max_hr ? `${data.max_hr} bpm` : null,
    },
    {
      label: "Resting HR",
      value: data.resting_hr ? `${data.resting_hr} bpm` : null,
    },
    {
      label: "FTP",
      value: data.ftp ? `${data.ftp} W` : null,
    },
    {
      label: "Threshold Pace",
      value: data.threshold_pace ? `${formatDuration(data.threshold_pace)} /km` : null,
    },
    {
      label: "CSS",
      value: data.css ? `${formatDuration(data.css)} /100m` : null,
    },
  ].filter((item) => item.value !== null && item.value !== undefined);

  return (
    <View className="gap-4">
      <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center self-center mb-4">
        <Icon as={Check} size={32} className="text-green-600" />
      </View>
      <Text className="text-2xl font-bold text-center">All Set!</Text>
      <Text className="text-center text-muted-foreground mb-6">
        Here is a summary of your profile settings.
      </Text>

      <Card>
        <CardContent className="pt-6 gap-3">
          {summaryItems.map((item) => (
            <View key={item.label} className="flex-row justify-between">
              <Text className="text-muted-foreground">{item.label}</Text>
              <Text className={`font-medium ${item.capitalize ? "capitalize" : ""}`}>
                {item.value}
              </Text>
            </View>
          ))}
          {summaryItems.length === 0 && (
            <Text className="text-center text-muted-foreground italic">
              No information provided
            </Text>
          )}
        </CardContent>
      </Card>
    </View>
  );
};

// ================================
// Main Component
// ================================

export default function OnboardingScreen() {
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusModal, setStatusModal] = useState<null | { title: string; description: string }>(
    null,
  );
  const { completeOnboarding } = useAuth();
  const { data: profile } = api.profiles.get.useQuery();
  const completeOnboardingMutation = api.onboarding.completeOnboarding.useMutation();

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  // Define steps with validation ranges
  const steps: StepConfig[] = useMemo(
    () => [
      {
        id: "intro",
        canSkip: false,
        component: IntroStep,
        shouldShow: () => true,
        isValid: () => true,
      },
      {
        id: "experience",
        canSkip: true,
        component: ExperienceStep,
        shouldShow: () => true,
        isValid: (d) => !!d.experience_level,
      },
      {
        id: "gender",
        canSkip: true,
        component: GenderStep,
        shouldShow: () => true,
        isValid: (d) => !!d.gender,
      },
      {
        id: "dob",
        canSkip: true,
        component: DobStep,
        shouldShow: () => true,
        isValid: (d) => !!d.dob && new Date(d.dob).toString() !== "Invalid Date",
      },
      {
        id: "weight",
        canSkip: true,
        component: WeightStep,
        shouldShow: () => true,
        isValid: (d) => !!d.weight_kg && d.weight_kg >= 30 && d.weight_kg <= 300,
      },
      {
        id: "sport",
        canSkip: true,
        component: SportStep,
        shouldShow: () => true,
        isValid: (d) => !!d.primary_sport,
      },
      {
        id: "max_hr",
        canSkip: true,
        component: MaxHrStep,
        shouldShow: () => true,
        // Optional but must be valid if present
        isValid: (d) => !d.max_hr || (d.max_hr >= 100 && d.max_hr <= 220),
      },
      {
        id: "resting_hr",
        canSkip: true,
        component: RestingHrStep,
        shouldShow: () => true,
        // Optional but must be valid if present
        isValid: (d) => !d.resting_hr || (d.resting_hr >= 30 && d.resting_hr <= 100),
      },
      {
        id: "ftp",
        canSkip: true,
        component: FtpStep,
        shouldShow: (d) => d.primary_sport === "cycling" || d.primary_sport === "triathlon",
        isValid: (d) => !d.ftp || (d.ftp >= 50 && d.ftp <= 500),
      },
      {
        id: "threshold_pace",
        canSkip: true,
        component: ThresholdPaceStep,
        shouldShow: (d) => d.primary_sport === "running" || d.primary_sport === "triathlon",
        isValid: (d) => !d.threshold_pace || (d.threshold_pace >= 120 && d.threshold_pace <= 600), // 2:00 to 10:00 min/km
      },
      {
        id: "css",
        canSkip: true,
        component: CssStep,
        shouldShow: (d) => d.primary_sport === "swimming" || d.primary_sport === "triathlon",
        isValid: (d) => !d.css || (d.css >= 60 && d.css <= 300), // 1:00 to 5:00 min/100m
      },
      {
        id: "integrations",
        canSkip: true,
        component: IntegrationsStep,
        shouldShow: () => true,
        isValid: () => true,
      },
      {
        id: "summary",
        canSkip: false,
        component: SummaryStep,
        shouldShow: () => true,
        isValid: () => true,
      },
    ],
    [],
  );

  // Filter valid steps
  const activeSteps = useMemo(() => steps.filter((step) => step.shouldShow(data)), [data, steps]);
  const currentStep = activeSteps[currentStepIndex];
  const isLastStep = currentStepIndex === activeSteps.length - 1;

  const isStepValid = currentStep?.isValid(data) ?? true;
  const canSkipStep = !isLastStep && (currentStep?.canSkip ?? false);

  const handleNext = async () => {
    if (isLastStep) {
      await handleComplete();
      return;
    }
    setCurrentStepIndex((prev) => prev + 1);
  };

  const handleSkip = async () => {
    if (isLastStep) {
      await handleComplete();
      return;
    }
    setCurrentStepIndex((prev) => prev + 1);
  };

  const handleComplete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (!profile?.id) {
        setStatusModal({ title: "Error", description: "User profile not found." });
        return;
      }

      // Valid date check or safe default
      // Use user provided DOB or undefined (don't default to today)
      const dobDate = data.dob ? new Date(data.dob) : undefined;

      if (dobDate && dobDate.toString() === "Invalid Date") {
        setStatusModal({ title: "Error", description: "Please enter a valid date of birth." });
        return;
      }

      // Prepare input
      const input = {
        experience_level: data.experience_level ?? "skip",
        dob: dobDate?.toISOString(), // Can be undefined now
        weight_kg: data.weight_kg ?? undefined,
        gender: data.gender ?? undefined,
        max_hr: data.max_hr ?? undefined,
        resting_hr: data.resting_hr ?? undefined,
        lthr: data.lthr ?? undefined,
        vo2max: data.vo2max ?? undefined,
        ftp: data.ftp ?? undefined,
        threshold_pace_seconds_per_km: data.threshold_pace ?? undefined,
        css_seconds_per_hundred_meters: data.css ?? undefined,
      };

      const result = await completeOnboardingMutation.mutateAsync(input);
      await completeOnboarding();

      // Hand control back to the global auth gate.
      router.replace("/");
    } catch (error) {
      setStatusModal({ title: "Error", description: "Failed to save profile. Please try again." });
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentStep) return null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <View className="flex-1 bg-background" testID="onboarding-screen">
        {/* Header - Fixed */}
        <View className="px-6 py-4 border-b border-border/50 flex-row items-center justify-between bg-background z-10">
          <Text className="text-sm font-medium text-muted-foreground">
            Step {currentStepIndex + 1} of {activeSteps.length}
          </Text>
          <Progress
            value={((currentStepIndex + 1) / activeSteps.length) * 100}
            className="mx-4 h-1 flex-1"
          />
        </View>

        {/* Body - Scrollable */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <currentStep.component data={data} updateData={updateData} />
        </ScrollView>

        {/* Footer - Fixed */}
        <View className="px-6 py-4 border-t border-border/50 bg-background flex-row gap-4">
          <Button
            variant="ghost"
            onPress={handleSkip}
            className={`flex-1 ${!canSkipStep ? "opacity-50" : ""}`}
            disabled={isSubmitting || !canSkipStep}
            testID="onboarding-skip-button"
          >
            <Text className="text-muted-foreground">Skip</Text>
          </Button>
          <Button
            onPress={handleNext}
            className={`flex-[2] ${!isStepValid ? "opacity-50" : ""}`}
            disabled={isSubmitting || !isStepValid}
            testID={isLastStep ? "onboarding-finish-button" : "onboarding-next-button"}
          >
            <Text className="font-semibold text-primary-foreground">
              {isLastStep ? "Finish" : "Next"}
            </Text>
            {!isLastStep && <Icon as={ArrowRight} className="ml-2 text-primary-foreground" />}
          </Button>
        </View>
        {statusModal ? (
          <AppConfirmModal
            description={statusModal.description}
            onClose={() => setStatusModal(null)}
            primaryAction={{
              label: "OK",
              onPress: () => setStatusModal(null),
              testID: "onboarding-status-confirm",
            }}
            testID="onboarding-status-modal"
            title={statusModal.title}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
