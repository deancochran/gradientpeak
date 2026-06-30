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
import { Input } from "@repo/ui/components/input";
import { PaceSecondsField } from "@repo/ui/components/pace-seconds-field";
import { Text } from "@repo/ui/components/text";
import { WeightInputField } from "@repo/ui/components/weight-input-field";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Activity, Check, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import { integrationProviders } from "@/lib/constants/integrations";
import { isValidOnboardingUsername } from "@/lib/onboarding/validation";
import { PRIMARY_SPORT_OPTIONS } from "../onboarding-data";
import type { IntegrationProvider, OnboardingData, StepProps } from "../types";

const INTENT_OPTIONS: Array<{
  value: NonNullable<OnboardingData["intent"]>;
  label: string;
  description: string;
}> = [
  {
    value: "train_event",
    label: "Train for an event",
    description: "Build toward a race or target date.",
  },
  {
    value: "improve_fitness",
    label: "Improve fitness",
    description: "Get stronger, faster, or more consistent.",
  },
  {
    value: "track_activities",
    label: "Track activities",
    description: "Record and understand your training.",
  },
  {
    value: "groups",
    label: "Train with groups",
    description: "Join communities, teams, or clubs.",
  },
  {
    value: "follow_people",
    label: "Follow athletes",
    description: "Keep up with friends, teammates, or coaches.",
  },
  {
    value: "coach_group",
    label: "Coach or manage",
    description: "Organize athletes, groups, or events.",
  },
  {
    value: "explore",
    label: "Just exploring",
    description: "Set up the basics and decide later.",
  },
];

const INTEGRATION_PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  garmin: "Garmin",
  strava: "Strava",
  trainingpeaks: "TrainingPeaks",
  wahoo: "Wahoo",
  zwift: "Zwift",
};

function getIntegrationProviderMetadata(provider: IntegrationProvider) {
  return { label: INTEGRATION_PROVIDER_LABELS[provider] };
}

function getMobileRedirectUri(): string {
  if (Constants.expoConfig?.extra?.redirectUri) {
    return Constants.expoConfig.extra.redirectUri;
  }

  return Linking.createURL("integrations");
}

function RequiredLabel({ children }: { children: string }) {
  return (
    <Text className="text-sm font-medium text-foreground">
      {children} <Text className="text-destructive">*</Text>
    </Text>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xl font-semibold text-foreground">{title}</Text>
      {description ? <Text className="text-sm text-muted-foreground">{description}</Text> : null}
    </View>
  );
}

export const IntroStep = () => (
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

export const IdentityStep = ({ data, updateData, usernameAvailability }: StepProps) => {
  const fullName = data.full_name.trim();
  const username = data.username.trim();
  const isUsernameInvalid = username.length > 0 && !isValidOnboardingUsername(username);
  const isUsernameTaken = usernameAvailability?.available === false;

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="text-xl font-semibold text-foreground">Set up your profile</Text>
        <Text className="text-sm text-muted-foreground">
          Add the identity other athletes will see in GradientPeak.
        </Text>
      </View>

      <View className="gap-2">
        <RequiredLabel>Full name</RequiredLabel>
        <Input
          accessibilityLabel="Full name"
          onChangeText={(full_name) => updateData({ full_name })}
          placeholder="Enter full name"
          testID="onboarding-full-name-input"
          value={data.full_name}
        />
        {fullName.length > 50 ? (
          <Text className="text-xs text-destructive">Full name must be 50 characters or less</Text>
        ) : null}
      </View>

      <View className="gap-2">
        <RequiredLabel>Username</RequiredLabel>
        <Input
          accessibilityLabel="Username"
          autoCapitalize="none"
          onChangeText={(username) => updateData({ username })}
          placeholder="Enter username"
          testID="onboarding-username-input"
          value={data.username}
        />
        {usernameAvailability?.isChecking ? (
          <ActivityIndicator
            accessibilityLabel="Checking username"
            className="self-start text-muted-foreground"
            size="small"
            testID="onboarding-username-checking"
          />
        ) : null}
        {isUsernameInvalid ? (
          <Text className="text-xs text-destructive">
            Username must be 3-30 letters, numbers, or underscores
          </Text>
        ) : isUsernameTaken ? (
          <Text className="text-xs text-destructive">That username is already taken</Text>
        ) : null}
      </View>
    </View>
  );
};

export const ExperienceStep = ({ data, updateData }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">What&apos;s your experience?</Text>
    {(["beginner", "intermediate", "advanced"] as const).map((level) => (
      <TouchableOpacity
        key={level}
        onPress={() =>
          updateData({ experience_level: data.experience_level === level ? null : level })
        }
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

export const GenderStep = ({ data, updateData, fieldSources }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">How do you identify?</Text>
    {fieldSources?.gender ? (
      <Text className="text-xs text-muted-foreground">From {fieldSources.gender}</Text>
    ) : null}
    {(["male", "female", "other"] as const).map((gender) => (
      <TouchableOpacity
        key={gender}
        onPress={() => updateData({ gender: data.gender === gender ? null : gender })}
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

export const DobStep = ({ data, updateData, fieldSources }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold">When were you born?</Text>
    {fieldSources?.dob ? (
      <Text className="text-xs text-muted-foreground">From {fieldSources.dob}</Text>
    ) : null}
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

export const WeightStep = ({ data, updateData, fieldSources }: StepProps) => (
  <View className="gap-4">
    <Text className="text-xl font-semibold mb-2">What is your weight?</Text>
    {fieldSources?.weight_kg ? (
      <Text className="text-xs text-muted-foreground">From {fieldSources.weight_kg}</Text>
    ) : null}
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

export const SportStep = ({ data, updateData }: StepProps) => {
  const toggleSport = (sport: OnboardingData["sport_interests"][number]) => {
    const hasSport = data.sport_interests.includes(sport);
    updateData({
      sport_interests: hasSport
        ? data.sport_interests.filter((item) => item !== sport)
        : [...data.sport_interests, sport],
    });
  };

  return (
    <View className="gap-3">
      <SectionHeading
        title="Sports you care about"
        description="Choose any that fit. We use these to show only relevant setup fields."
      />
      {PRIMARY_SPORT_OPTIONS.map((sport) => {
        const selected = data.sport_interests.includes(sport);

        return (
          <TouchableOpacity
            key={sport}
            onPress={() => toggleSport(sport)}
            testID={`onboarding-sport-${sport}`}
            className={`p-4 border rounded-xl flex-row items-center justify-between ${
              selected ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <Text className="font-semibold capitalize text-lg text-foreground">{sport}</Text>
            {selected && <Icon as={Check} className="text-primary" />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

function IntentStep({ data, updateData }: StepProps) {
  return (
    <View className="gap-3">
      <SectionHeading
        title="What brings you here?"
        description="Optional, but it helps us prioritize your setup."
      />
      {INTENT_OPTIONS.map((option) => (
        <TouchableOpacity
          key={option.value}
          onPress={() => updateData({ intent: data.intent === option.value ? null : option.value })}
          testID={`onboarding-intent-${option.value}`}
          className={`p-4 border rounded-xl flex-row items-center justify-between ${
            data.intent === option.value ? "border-primary bg-primary/5" : "border-border bg-card"
          }`}
        >
          <View className="flex-1 pr-3">
            <Text className="font-semibold text-base text-foreground">{option.label}</Text>
            <Text className="text-sm text-muted-foreground">{option.description}</Text>
          </View>
          {data.intent === option.value && <Icon as={Check} className="text-primary" />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export const ProfileAndIntentStep = (props: StepProps) => (
  <View className="gap-8">
    <IdentityStep {...props} />
    <IntentStep {...props} />
    <SportStep {...props} />
  </View>
);

export const MaxHrStep = ({ data, updateData, fieldSources }: StepProps) => {
  const estimatedMaxHr = estimateMaxHRFromDOB(data.dob);

  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold mb-2">Max Heart Rate</Text>
      {fieldSources?.max_hr ? (
        <Text className="text-xs text-muted-foreground">{fieldSources.max_hr}</Text>
      ) : null}
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

export const RestingHrStep = ({ data, updateData }: StepProps) => (
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

export const FtpStep = ({ data, updateData, fieldSources }: StepProps) => {
  const estimatedFtp = estimateConservativeFTPFromWeight(data.weight_kg);

  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold mb-2">Functional Threshold Power (FTP)</Text>
      {fieldSources?.ftp ? (
        <Text className="text-xs text-muted-foreground">From {fieldSources.ftp}</Text>
      ) : null}
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

export const ThresholdPaceStep = ({ data, updateData }: StepProps) => (
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

export const CssStep = ({ data, updateData }: StepProps) => (
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

export const IntegrationsStep = ({
  connectionOverview = [],
  integrations = [],
  onRefreshIntegrations,
}: StepProps) => {
  const [statusModal, setStatusModal] = useState<null | { title: string; description: string }>(
    null,
  );
  const getAuthUrlMutation = api.integrations.getAuthUrl.useMutation();

  const connectedProviders = new Set(integrations.map((integration) => integration.provider));

  const handleConnect = async (providerKey: IntegrationProvider) => {
    const metadata = getIntegrationProviderMetadata(providerKey);

    try {
      const redirectUri = getMobileRedirectUri();
      const { url } = await getAuthUrlMutation.mutateAsync({
        provider: providerKey,
        redirectUri,
      });

      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);

      if (result.type === "success") {
        onRefreshIntegrations?.();
        setStatusModal({ title: "Success", description: `Connected to ${metadata.label}` });
      }
    } catch (error) {
      console.error(error);
      setStatusModal({ title: "Error", description: `Failed to connect to ${metadata.label}.` });
    }
  };

  const providers =
    connectionOverview.length > 0
      ? connectionOverview.filter((item) => item.canConnect || item.connected)
      : integrationProviders.map((provider) => ({
          canConnect: true,
          connected: connectedProviders.has(provider),
          provider,
        }));

  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold mb-2">Connect Accounts</Text>
      <Text className="text-muted-foreground mb-4">Sync your activities automatically.</Text>

      {providers.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          No provider connections are available in this environment.
        </Text>
      ) : null}

      {providers.map((service) => {
        const metadata = getIntegrationProviderMetadata(service.provider);

        return (
          <TouchableOpacity
            key={service.provider}
            onPress={() => handleConnect(service.provider)}
            className={`flex-row items-center justify-between p-4 border rounded-xl mb-2 ${
              connectedProviders.has(service.provider)
                ? "border-green-500 bg-green-500/10"
                : "border-border bg-card"
            }`}
          >
            <View className="flex-row items-center gap-3">
              <View className="w-8 h-8 rounded bg-muted items-center justify-center">
                <Text className="font-bold text-xs">{metadata.label[0]}</Text>
              </View>
              <Text className="font-semibold">{metadata.label}</Text>
            </View>
            {connectedProviders.has(service.provider) ? (
              <Icon as={Check} className="text-green-600" size={20} />
            ) : (
              <Icon as={ChevronRight} className="text-muted-foreground" size={20} />
            )}
          </TouchableOpacity>
        );
      })}
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

export const ProviderSyncStep = ({
  providerSyncStatus,
  onRetryProviderSync,
  onClearProviderRequirement,
}: StepProps) => {
  const status = providerSyncStatus?.status ?? "idle";
  const isRecoverable = status === "failed" || status === "timed_out";

  return (
    <View className="gap-4">
      <Text className="text-xl font-semibold mb-2">Syncing connected accounts</Text>
      <Text className="text-muted-foreground mb-2">
        We&apos;re importing setup fields from connected services before showing the manual review
        steps.
      </Text>

      <Card>
        <CardContent className="pt-6 gap-3">
          {(providerSyncStatus?.providers ?? []).map((provider) => (
            <View key={provider.provider} className="gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold capitalize text-foreground">
                  {provider.provider}
                </Text>
                <Text className="text-sm text-muted-foreground capitalize">
                  {provider.status.replace(/_/g, " ")}
                </Text>
              </View>
              {provider.message ? (
                <Text className="text-xs text-muted-foreground">{provider.message}</Text>
              ) : null}
              {(provider.status === "failed" || provider.status === "timed_out") &&
              provider.blocking ? (
                <Button
                  variant="outline"
                  onPress={() => onClearProviderRequirement?.(provider.provider)}
                  testID={`onboarding-clear-${provider.provider}-requirement`}
                >
                  <Text>Remove from onboarding</Text>
                </Button>
              ) : null}
            </View>
          ))}
        </CardContent>
      </Card>

      {isRecoverable ? (
        <Button
          variant="outline"
          onPress={onRetryProviderSync}
          testID="onboarding-provider-sync-retry"
        >
          <Text>Retry sync</Text>
        </Button>
      ) : null}
    </View>
  );
};

export const ConnectAndImportStep = (props: StepProps) => {
  const hasProviderSync = props.providerSyncStatus && props.providerSyncStatus.status !== "idle";

  return (
    <View className="gap-8">
      <IntegrationsStep {...props} />
      {hasProviderSync ? <ProviderSyncStep {...props} /> : null}
    </View>
  );
};

export const TrainingBaselineStep = (props: StepProps) => {
  const { data } = props;
  const showCycling = data.sport_interests.includes("cycling");
  const showRunning = data.sport_interests.includes("running");
  const showSwimming = data.sport_interests.includes("swimming");

  return (
    <View className="gap-8">
      <View className="gap-3">
        <SectionHeading
          title="Training baseline"
          description="Review imported or estimated values. Every field here is optional and can be cleared."
        />
        <ExperienceStep {...props} />
      </View>

      <View className="gap-5">
        <DobStep {...props} />
        <GenderStep {...props} />
        <WeightStep {...props} />
      </View>

      <View className="gap-5">
        <MaxHrStep {...props} />
        <RestingHrStep {...props} />
      </View>

      {showCycling || showRunning || showSwimming ? (
        <View className="gap-5">
          <SectionHeading
            title="Sport-specific metrics"
            description="We only show metrics for the sports you selected."
          />
          {showCycling ? <FtpStep {...props} /> : null}
          {showRunning ? <ThresholdPaceStep {...props} /> : null}
          {showSwimming ? <CssStep {...props} /> : null}
        </View>
      ) : null}
    </View>
  );
};

export const SummaryStep = ({ data }: { data: OnboardingData }) => {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const summaryItems = [
    { label: "Full name", value: data.full_name.trim() },
    { label: "Username", value: data.username.trim() },
    { label: "Intent", value: data.intent?.replace(/_/g, " "), capitalize: true },
    { label: "Experience", value: data.experience_level, capitalize: true },
    { label: "Gender", value: data.gender, capitalize: true },
    { label: "Date of Birth", value: data.dob },
    {
      label: "Weight",
      value: data.weight_kg
        ? `${formatWeightForDisplay(data.weight_kg, data.weight_unit)} ${data.weight_unit}`
        : null,
    },
    {
      label: "Sports",
      value: data.sport_interests.length > 0 ? data.sport_interests.join(", ") : null,
      capitalize: true,
    },
    { label: "Max HR", value: data.max_hr ? `${data.max_hr} bpm` : null },
    { label: "Resting HR", value: data.resting_hr ? `${data.resting_hr} bpm` : null },
    { label: "FTP", value: data.ftp ? `${data.ftp} W` : null },
    {
      label: "Threshold Pace",
      value: data.threshold_pace ? `${formatDuration(data.threshold_pace)} /km` : null,
    },
    { label: "CSS", value: data.css ? `${formatDuration(data.css)} /100m` : null },
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
