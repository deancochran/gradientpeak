import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { router } from "expo-router";
import { Activity, ArrowRight, Check, ChevronRight } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState, useMemo, useEffect } from "react";
import {
  Alert,
  ScrollView,
  View,
  TouchableOpacity,
  Platform,
} from "react-native";
import AppleHealthKit, { HealthKitPermissions } from "react-native-health";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";

// ================================
// Types
// ================================

interface OnboardingData {
  experience_level: "beginner" | "intermediate" | "advanced" | "skip" | null;
  dob: string | null;
  weight_kg: number | null;
  weight_unit: "kg" | "lbs";
  gender: "male" | "female" | "other" | null;
  primary_sport:
    | "cycling"
    | "running"
    | "swimming"
    | "triathlon"
    | "other"
    | null;
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

const TimeDurationInput = ({
  seconds,
  onChange,
}: {
  seconds: number | null;
  onChange: (val: number | null) => void;
}) => {
  // Initialize local state from props only on mount or when props drastically change
  // We don't want to re-sync on every keystroke round-trip to avoid cursor jumping/resetting
  const [minStr, setMinStr] = useState(
    seconds ? Math.floor(seconds / 60).toString() : "",
  );
  const [secStr, setSecStr] = useState(
    seconds ? (seconds % 60).toString().padStart(2, "0") : "",
  );

  // Sync effect: Only update local state if external prop changes significantly
  // (e.g. initial load or reset), but ignore if it matches our current calculated value.
  useEffect(() => {
    const currentTotal = (parseInt(minStr) || 0) * 60 + (parseInt(secStr) || 0);
    if (seconds !== null && seconds !== currentTotal) {
      setMinStr(Math.floor(seconds / 60).toString());
      setSecStr((seconds % 60).toString().padStart(2, "0"));
    }
  }, [seconds]);

  const handleUpdate = (newMin: string, newSec: string) => {
    setMinStr(newMin);
    setSecStr(newSec);

    // If both are empty, clear the value
    if (newMin === "" && newSec === "") {
      onChange(null);
      return;
    }

    const minVal = parseInt(newMin) || 0;
    const secVal = parseInt(newSec) || 0;

    // Only valid if positive
    if (minVal >= 0 && secVal >= 0) {
      onChange(minVal * 60 + secVal);
    }
  };

  return (
    <View className="flex-row items-center gap-2 justify-center">
      <View className="items-center">
        <Input
          value={minStr}
          onChangeText={(t) => handleUpdate(t, secStr)}
          keyboardType="number-pad"
          className="w-24 text-center text-2xl h-16"
          placeholder="00"
          maxLength={3}
        />
        <Text className="text-xs text-muted-foreground mt-1">Minutes</Text>
      </View>
      <Text className="text-2xl font-bold mb-6">:</Text>
      <View className="items-center">
        <Input
          value={secStr}
          onChangeText={(t) => handleUpdate(minStr, t)}
          keyboardType="number-pad"
          className="w-24 text-center text-2xl h-16"
          placeholder="00"
          maxLength={2}
        />
        <Text className="text-xs text-muted-foreground mt-1">Seconds</Text>
      </View>
    </View>
  );
};

// ================================
// Step Components
// ================================

const IntroStep = () => (
  <View className="items-center justify-center flex-1 py-8">
    <View className="w-24 h-24 bg-primary/10 rounded-full items-center justify-center mb-6">
      <Icon as={Activity} size={48} className="text-primary" />
    </View>
    <Text className="text-2xl font-bold text-center mb-2">
      Welcome to GradientPeak
    </Text>
    <Text className="text-center text-muted-foreground px-4">
      Let&apos;s customize your experience. This will only take a minute.
    </Text>
  </View>
);

const ExperienceStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">
      What&apos;s your experience?
    </Text>
    {(["beginner", "intermediate", "advanced"] as const).map((level) => (
      <TouchableOpacity
        key={level}
        onPress={() => updateData({ experience_level: level })}
        className={`p-4 border rounded-xl flex-row items-center justify-between ${
          data.experience_level === level
            ? "border-primary bg-primary/5"
            : "border-border bg-card"
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
        {data.experience_level === level && (
          <Icon as={Check} className="text-primary" />
        )}
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
        className={`p-4 border rounded-xl flex-row items-center justify-between ${
          data.gender === gender
            ? "border-primary bg-primary/5"
            : "border-border bg-card"
        }`}
      >
        <Text className="font-semibold capitalize text-lg">{gender}</Text>
        {data.gender === gender && <Icon as={Check} className="text-primary" />}
      </TouchableOpacity>
    ))}
  </View>
);

const DobStep = ({ data, updateData }: StepProps) => {
  const [showPicker, setShowPicker] = useState(false);

  // Use a default date if null, but ensure we don't accidentally save the default
  const date = data.dob ? new Date(data.dob) : new Date("2000-01-01");

  const onChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (selectedDate) {
      updateData({ dob: selectedDate.toISOString().split("T")[0] });
    }
  };

  return (
    <View className="gap-6 items-center">
      <View className="w-full">
        <Text className="text-xl font-semibold mb-2 text-left">
          When were you born?
        </Text>
        <Text className="text-sm text-muted-foreground mb-4 text-left">
          Used to calculate accurate heart rate zones.
        </Text>
      </View>

      {Platform.OS === "ios" ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="spinner"
          onChange={onChange}
          maximumDate={new Date()}
          style={{ width: "100%", height: 200 }}
        />
      ) : (
        <View className="w-full">
          <Button
            variant="outline"
            onPress={() => setShowPicker(true)}
            className="w-full"
          >
            <Text>{data.dob || "Select Date of Birth"}</Text>
          </Button>

          {showPicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display="default"
              onChange={onChange}
              maximumDate={new Date()}
            />
          )}
        </View>
      )}
    </View>
  );
};

const WeightStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">What is your weight?</Text>
    <View className="flex-row gap-3">
      <Input
        placeholder="70"
        value={data.weight_kg?.toString() || ""}
        onChangeText={(text) => {
          if (text === "") {
            updateData({ weight_kg: null });
            return;
          }
          const val = parseFloat(text);
          if (!isNaN(val)) {
            updateData({ weight_kg: val });
          }
        }}
        keyboardType="numeric"
        className="flex-1 text-lg"
        autoFocus
      />
      <Button
        variant="outline"
        onPress={() =>
          updateData({ weight_unit: data.weight_unit === "kg" ? "lbs" : "kg" })
        }
        className="w-24"
      >
        <Text>{data.weight_unit.toUpperCase()}</Text>
      </Button>
    </View>
    <Text className="text-xs text-muted-foreground">Range: 30kg - 300kg</Text>
  </View>
);

const SportStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">Primary Sport</Text>
    {["cycling", "running", "swimming", "triathlon", "other"].map((sport) => (
      <TouchableOpacity
        key={sport}
        onPress={() => updateData({ primary_sport: sport as any })}
        className={`p-4 border rounded-xl flex-row items-center justify-between ${
          data.primary_sport === sport
            ? "border-primary bg-primary/5"
            : "border-border bg-card"
        }`}
      >
        <Text className="font-semibold capitalize text-lg">{sport}</Text>
        {data.primary_sport === sport && (
          <Icon as={Check} className="text-primary" />
        )}
      </TouchableOpacity>
    ))}
  </View>
);

const MaxHrStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">Max Heart Rate</Text>
    <Input
      placeholder="e.g. 185"
      value={data.max_hr?.toString() || ""}
      onChangeText={(text) => {
        if (text === "") {
          updateData({ max_hr: null });
          return;
        }
        const val = parseInt(text);
        if (!isNaN(val)) {
          updateData({ max_hr: val });
        }
      }}
      keyboardType="numeric"
      className="text-lg"
      autoFocus
    />
    <Text className="text-sm text-muted-foreground">
      Range: 100 - 220 bpm. Leave blank to estimate from age.
    </Text>
  </View>
);

const RestingHrStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">Resting Heart Rate</Text>
    <Input
      placeholder="e.g. 60"
      value={data.resting_hr?.toString() || ""}
      onChangeText={(text) => {
        if (text === "") {
          updateData({ resting_hr: null });
          return;
        }
        const val = parseInt(text);
        if (!isNaN(val)) {
          updateData({ resting_hr: val });
        }
      }}
      keyboardType="numeric"
      className="text-lg"
      autoFocus
    />
    <Text className="text-sm text-muted-foreground">Range: 30 - 100 bpm</Text>
  </View>
);

const FtpStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">
      Functional Threshold Power (FTP)
    </Text>
    <Input
      placeholder="e.g. 250"
      value={data.ftp?.toString() || ""}
      onChangeText={(text) => {
        if (text === "") {
          updateData({ ftp: null });
          return;
        }
        const val = parseInt(text);
        if (!isNaN(val)) {
          updateData({ ftp: val });
        }
      }}
      keyboardType="numeric"
      className="text-lg"
      autoFocus
    />
    <Text className="text-sm text-muted-foreground">Range: 50 - 500 Watts</Text>
  </View>
);

const ThresholdPaceStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">Threshold Running Pace</Text>
    <Text className="text-muted-foreground mb-4">
      Your average pace for a hard 20-40 minute run.
    </Text>

    <TimeDurationInput
      seconds={data.threshold_pace}
      onChange={(val) => updateData({ threshold_pace: val })}
    />

    <Text className="text-sm text-center text-muted-foreground mt-2">
      min / km (Range: 2:00 - 10:00)
    </Text>
  </View>
);

const CssStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">Critical Swim Speed</Text>
    <Text className="text-muted-foreground mb-4">
      Your sustainable pace per 100m.
    </Text>

    <TimeDurationInput
      seconds={data.css}
      onChange={(val) => updateData({ css: val })}
    />

    <Text className="text-sm text-center text-muted-foreground mt-2">
      min / 100m (Range: 1:00 - 5:00)
    </Text>
  </View>
);

const IntegrationsStep = ({ data, updateData }: StepProps) => {
  const [connected, setConnected] = useState<string[]>([]);
  const getAuthUrlMutation = trpc.integrations.getAuthUrl.useMutation();

  const handleConnect = async (provider: string) => {
    if (provider === "Apple Health") {
      if (Platform.OS !== "ios") {
        Alert.alert("Not Available", "Apple Health is only available on iOS.");
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

      AppleHealthKit.initHealthKit(permissions, (error: string) => {
        if (error) {
          console.error("[HealthKit] Error:", error);
          Alert.alert("Error", "Failed to connect to Apple Health.");
          return;
        }
        // Success
        setConnected((prev) => [...prev, "Apple Health"]);
        Alert.alert("Success", "Connected to Apple Health!");
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
      Alert.alert(
        "Coming Soon",
        `Connection to ${provider} will be available in the next update.`,
      );
      return;
    }

    try {
      const { url } = await getAuthUrlMutation.mutateAsync({
        provider: providerKey as any,
        redirectUri: "gradientpeak://integrations",
      });

      const result = await WebBrowser.openAuthSessionAsync(
        url,
        "gradientpeak://integrations",
      );

      if (result.type === "success") {
        setConnected((prev) => [...prev, provider]);
        Alert.alert("Success", `Connected to ${provider}`);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", `Failed to connect to ${provider}.`);
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
      <Text className="text-muted-foreground mb-4">
        Sync your activities automatically.
      </Text>

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
            <Icon
              as={ChevronRight}
              className="text-muted-foreground"
              size={20}
            />
          )}
        </TouchableOpacity>
      ))}
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
      value: data.weight_kg ? `${data.weight_kg} ${data.weight_unit}` : null,
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
      value: data.ftp ? `${data.ftp} w` : null,
    },
    {
      label: "Threshold Pace",
      value: data.threshold_pace
        ? `${formatDuration(data.threshold_pace)} /km`
        : null,
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
              <Text
                className={`font-medium ${item.capitalize ? "capitalize" : ""}`}
              >
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
  const { completeOnboarding } = useAuth();
  const { data: profile } = trpc.profiles.get.useQuery();
  const completeOnboardingMutation =
    trpc.onboarding.completeOnboarding.useMutation();

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  // Define steps with validation ranges
  const steps: StepConfig[] = useMemo(
    () => [
      {
        id: "intro",
        component: IntroStep,
        shouldShow: () => true,
        isValid: () => true,
      },
      {
        id: "experience",
        component: ExperienceStep,
        shouldShow: () => true,
        isValid: (d) => !!d.experience_level,
      },
      {
        id: "gender",
        component: GenderStep,
        shouldShow: () => true,
        isValid: (d) => !!d.gender,
      },
      {
        id: "dob",
        component: DobStep,
        shouldShow: () => true,
        isValid: (d) =>
          !!d.dob && new Date(d.dob).toString() !== "Invalid Date",
      },
      {
        id: "weight",
        component: WeightStep,
        shouldShow: () => true,
        isValid: (d) =>
          !!d.weight_kg && d.weight_kg >= 30 && d.weight_kg <= 300,
      },
      {
        id: "sport",
        component: SportStep,
        shouldShow: () => true,
        isValid: (d) => !!d.primary_sport,
      },
      {
        id: "max_hr",
        component: MaxHrStep,
        shouldShow: () => true,
        // Optional but must be valid if present
        isValid: (d) => !d.max_hr || (d.max_hr >= 100 && d.max_hr <= 220),
      },
      {
        id: "resting_hr",
        component: RestingHrStep,
        shouldShow: () => true,
        // Optional but must be valid if present
        isValid: (d) =>
          !d.resting_hr || (d.resting_hr >= 30 && d.resting_hr <= 100),
      },
      {
        id: "ftp",
        component: FtpStep,
        shouldShow: (d) =>
          d.primary_sport === "cycling" || d.primary_sport === "triathlon",
        isValid: (d) => !d.ftp || (d.ftp >= 50 && d.ftp <= 500),
      },
      {
        id: "threshold_pace",
        component: ThresholdPaceStep,
        shouldShow: (d) =>
          d.primary_sport === "running" || d.primary_sport === "triathlon",
        isValid: (d) =>
          !d.threshold_pace ||
          (d.threshold_pace >= 120 && d.threshold_pace <= 600), // 2:00 to 10:00 min/km
      },
      {
        id: "css",
        component: CssStep,
        shouldShow: (d) =>
          d.primary_sport === "swimming" || d.primary_sport === "triathlon",
        isValid: (d) => !d.css || (d.css >= 60 && d.css <= 300), // 1:00 to 5:00 min/100m
      },
      {
        id: "integrations",
        component: IntegrationsStep,
        shouldShow: () => true,
        isValid: () => true,
      },
      {
        id: "summary",
        component: SummaryStep,
        shouldShow: () => true,
        isValid: () => true,
      },
    ],
    [],
  );

  // Filter valid steps
  const activeSteps = useMemo(
    () => steps.filter((step) => step.shouldShow(data)),
    [data, steps],
  );
  const currentStep = activeSteps[currentStepIndex];
  const isLastStep = currentStepIndex === activeSteps.length - 1;

  const isStepValid = currentStep?.isValid(data) ?? true;

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
        Alert.alert("Error", "User profile not found.");
        return;
      }

      // Valid date check or safe default
      // Use user provided DOB or undefined (don't default to today)
      const dobDate = data.dob ? new Date(data.dob) : undefined;

      if (dobDate && dobDate.toString() === "Invalid Date") {
        Alert.alert("Error", "Please enter a valid date of birth.");
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
      Alert.alert("Error", "Failed to save profile. Please try again.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentStep) return null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      {/* Header - Fixed */}
      <View className="px-6 py-4 border-b border-border/50 flex-row items-center justify-between bg-background z-10">
        <Text className="text-sm font-medium text-muted-foreground">
          Step {currentStepIndex + 1} of {activeSteps.length}
        </Text>
        <View className="h-1 flex-1 mx-4 bg-muted rounded-full overflow-hidden">
          <View
            className="h-full bg-primary"
            style={{
              width: `${((currentStepIndex + 1) / activeSteps.length) * 100}%`,
            }}
          />
        </View>
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
          className={`flex-1 ${isStepValid ? "opacity-50" : ""}`}
          disabled={isSubmitting || isStepValid}
        >
          <Text className="text-muted-foreground">Skip</Text>
        </Button>
        <Button
          onPress={handleNext}
          className={`flex-[2] ${!isStepValid ? "opacity-50" : ""}`}
          disabled={isSubmitting || !isStepValid}
        >
          <Text className="font-semibold text-primary-foreground">
            {isLastStep ? "Finish" : "Next"}
          </Text>
          {!isLastStep && (
            <Icon as={ArrowRight} className="ml-2 text-primary-foreground" />
          )}
        </Button>
      </View>
    </SafeAreaView>
  );
}
