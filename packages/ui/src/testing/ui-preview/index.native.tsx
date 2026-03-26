import { useState } from "react";
import { useForm } from "react-hook-form";
import { ScrollView, View } from "react-native";

import { Button } from "../../components/button/index.native";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/card/index.native";
import { Checkbox } from "../../components/checkbox/index.native";
import { EmptyStateCard } from "../../components/empty-state-card/index.native";
import { ErrorStateCard } from "../../components/error-state-card/index.native";
import {
  Form,
  FormSelectField,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
} from "../../components/form/index.native";
import { Input } from "../../components/input/index.native";
import { Label } from "../../components/label/index.native";
import { ChartSkeleton, ListSkeleton } from "../../components/loading-skeletons/index.native";
import { RadioGroup, RadioGroupItem } from "../../components/radio-group/index.native";
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/select/index.native";
import { Switch } from "../../components/switch/index.native";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/tabs/index.native";
import { Text } from "../../components/text/index.native";
import { uiPreviewContract, uiPreviewFixtures, uiPreviewFormFields } from "./shared";

type UiPreviewFormValues = {
  bio: string;
  is_public: boolean;
  sport: string;
  username: string;
};

function ScenarioHeader({ description, title }: { description: string; title: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xl font-semibold">{title}</Text>
      <Text className="text-sm text-muted-foreground">{description}</Text>
    </View>
  );
}

function UiPreviewSurface() {
  const form = useForm<UiPreviewFormValues>({
    defaultValues: {
      bio: "Prefers steady aerobic progression with one hard session each week.",
      is_public: true,
      sport: uiPreviewFixtures.radioGroup.value,
      username: "dean_peak",
    },
  });
  const [isChecked, setIsChecked] = useState(true);
  const [isSwitchEnabled, setIsSwitchEnabled] = useState(true);
  const [selectedSport, setSelectedSport] = useState<string>(uiPreviewFixtures.radioGroup.value);
  const [selectedWorkoutType, setSelectedWorkoutType] = useState<
    (typeof uiPreviewFixtures.select.options)[number] | undefined
  >(
    uiPreviewFixtures.select.options.find(
      (option) => option.value === uiPreviewFixtures.select.value,
    ),
  );
  const [tabValue, setTabValue] = useState<string>(uiPreviewFixtures.tabs.values.overview);
  const usernameError = form.formState.errors.username?.message;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-6"
      testID={uiPreviewContract.rootTestId}
    >
      <View className="gap-2">
        <Text className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
          {uiPreviewContract.eyebrow}
        </Text>
        <Text className="text-3xl font-semibold">{uiPreviewContract.mobileTitle}</Text>
        <Text className="text-sm text-muted-foreground">{uiPreviewContract.description}</Text>
      </View>

      <View className="gap-4" testID={uiPreviewContract.scenarios.accountControls.testId}>
        <ScenarioHeader
          description={uiPreviewContract.scenarios.accountControls.description}
          title={uiPreviewContract.scenarios.accountControls.title}
        />
        <Card
          accessibilityLabel={uiPreviewFixtures.card.profile.accessibilityLabel}
          role={uiPreviewFixtures.card.profile.role}
          testId={uiPreviewFixtures.card.profile.testId}
        >
          <CardHeader>
            <CardTitle>{uiPreviewFixtures.card.recoveryCheck.title}</CardTitle>
            <CardDescription>{uiPreviewFixtures.card.recoveryCheck.description}</CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <Input {...uiPreviewFixtures.input} />
            <Button {...uiPreviewFixtures.button}>
              <Text>{uiPreviewFixtures.button.children}</Text>
            </Button>
          </CardContent>
        </Card>
      </View>

      <View className="gap-4" testID={uiPreviewContract.scenarios.planTabs.testId}>
        <ScenarioHeader
          description={uiPreviewContract.scenarios.planTabs.description}
          title={uiPreviewContract.scenarios.planTabs.title}
        />
        <Tabs
          onValueChange={(nextValue) => setTabValue(nextValue)}
          testId={uiPreviewFixtures.tabs.rootTestId}
          value={tabValue}
        >
          <TabsList testId={uiPreviewFixtures.tabs.listTestId}>
            <TabsTrigger
              testId={uiPreviewFixtures.tabs.triggers.overview.testId}
              value={uiPreviewFixtures.tabs.values.overview}
            >
              <Text>{uiPreviewFixtures.tabs.triggers.overview.label}</Text>
            </TabsTrigger>
            <TabsTrigger
              testId={uiPreviewFixtures.tabs.triggers.sessions.testId}
              value={uiPreviewFixtures.tabs.values.sessions}
            >
              <Text>{uiPreviewFixtures.tabs.triggers.sessions.label}</Text>
            </TabsTrigger>
            <TabsTrigger
              testId={uiPreviewFixtures.tabs.triggers.notes.testId}
              value={uiPreviewFixtures.tabs.values.notes}
            >
              <Text>{uiPreviewFixtures.tabs.triggers.notes.label}</Text>
            </TabsTrigger>
          </TabsList>

          <TabsContent
            testId={uiPreviewFixtures.tabs.contentTestIds.overview}
            value={uiPreviewFixtures.tabs.values.overview}
          >
            <Card>
              <CardContent>
                <Text>{uiPreviewFixtures.tabs.content.overview}</Text>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent
            testId={uiPreviewFixtures.tabs.contentTestIds.sessions}
            value={uiPreviewFixtures.tabs.values.sessions}
          >
            <Card>
              <CardContent>
                <Text>{uiPreviewFixtures.tabs.content.sessions}</Text>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent
            testId={uiPreviewFixtures.tabs.contentTestIds.notes}
            value={uiPreviewFixtures.tabs.values.notes}
          >
            <Card>
              <CardContent>
                <Text>{uiPreviewFixtures.tabs.content.notes}</Text>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </View>

      <View className="gap-4" testID={uiPreviewContract.scenarios.feedbackStates.testId}>
        <ScenarioHeader
          description={uiPreviewContract.scenarios.feedbackStates.description}
          title={uiPreviewContract.scenarios.feedbackStates.title}
        />
        <View className="gap-4">
          <EmptyStateCard {...uiPreviewFixtures.emptyStateCard} />
          <ErrorStateCard {...uiPreviewFixtures.errorStateCard} />
          <View className="gap-4 rounded-xl border border-border p-4">
            <ChartSkeleton {...uiPreviewFixtures.loadingSkeleton.chart} />
            <ListSkeleton {...uiPreviewFixtures.loadingSkeleton.list} />
          </View>
        </View>
      </View>

      <View className="gap-4" testID={uiPreviewContract.scenarios.selectionControls.testId}>
        <ScenarioHeader
          description={uiPreviewContract.scenarios.selectionControls.description}
          title={uiPreviewContract.scenarios.selectionControls.title}
        />
        <View className="gap-4 rounded-xl border border-border p-4">
          <View className="flex-row items-center gap-3">
            <Checkbox
              {...uiPreviewFixtures.checkbox}
              checked={isChecked}
              onCheckedChange={(nextChecked) => setIsChecked(nextChecked === true)}
            />
            <Label htmlFor={uiPreviewFixtures.checkbox.id}>Accept terms</Label>
          </View>
          <View className="flex-row items-center justify-between gap-4 rounded-lg border border-border p-3">
            <View className="flex-1 gap-1">
              <Text className="text-sm font-medium text-foreground">Email notifications</Text>
              <Text className="text-xs text-muted-foreground">Shared switch contract</Text>
            </View>
            <Switch
              {...uiPreviewFixtures.switch}
              checked={isSwitchEnabled}
              onCheckedChange={(nextValue) => setIsSwitchEnabled(nextValue)}
            />
          </View>
          <View className="gap-2">
            <Label htmlFor={uiPreviewFixtures.select.id}>Workout type</Label>
            <Select
              onValueChange={(nextValue) => setSelectedWorkoutType(nextValue)}
              value={selectedWorkoutType}
            >
              <SelectTrigger
                id={uiPreviewFixtures.select.id}
                testId={uiPreviewFixtures.select.testId}
              >
                <SelectValue placeholder={uiPreviewFixtures.select.placeholder} />
              </SelectTrigger>
              <SelectContent>
                <NativeSelectScrollView>
                  {uiPreviewFixtures.select.options.map((option) => (
                    <SelectItem key={option.value} label={option.label} value={option as never} />
                  ))}
                </NativeSelectScrollView>
              </SelectContent>
            </Select>
          </View>
          <View className="gap-2">
            <Label htmlFor={uiPreviewFixtures.radioGroup.id}>Preferred sport</Label>
            <RadioGroup
              id={uiPreviewFixtures.radioGroup.id}
              onValueChange={(nextValue) => setSelectedSport(nextValue)}
              testID={uiPreviewFixtures.radioGroup.testId}
              value={selectedSport}
            >
              {uiPreviewFixtures.radioGroup.options.map((option) => (
                <View key={option.value} className="flex-row items-center gap-2">
                  <RadioGroupItem
                    id={`${uiPreviewFixtures.radioGroup.id}-${option.value}`}
                    value={option.value}
                  />
                  <Label htmlFor={`${uiPreviewFixtures.radioGroup.id}-${option.value}`}>
                    {option.label}
                  </Label>
                </View>
              ))}
            </RadioGroup>
          </View>
        </View>
      </View>

      <View className="gap-4" testID={uiPreviewContract.scenarios.formFields.testId}>
        <ScenarioHeader
          description={uiPreviewContract.scenarios.formFields.description}
          title={uiPreviewContract.scenarios.formFields.title}
        />
        <Card>
          <CardContent className="gap-4 pt-6">
            <Form {...form}>
              <FormTextField
                control={form.control}
                label="Username"
                name="username"
                rules={{ required: "Username is required." }}
                testId={uiPreviewFormFields.usernameTestId}
              />
              <FormSelectField
                control={form.control}
                label="Preferred sport"
                name="sport"
                options={uiPreviewFixtures.radioGroup.options.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                testId={uiPreviewFormFields.sportTestId}
              />
              <FormTextareaField
                control={form.control}
                label="Bio"
                name="bio"
                rules={{ minLength: { value: 12, message: "Bio must be at least 12 characters." } }}
                testId={uiPreviewFormFields.bioTestId}
              />
              <FormSwitchField
                control={form.control}
                label="Public profile"
                name="is_public"
                switchLabel="Public profile"
                testId={uiPreviewFormFields.isPublicTestId}
              />
              <View className="gap-3">
                <Button
                  onPress={form.handleSubmit(() => undefined)}
                  testId={uiPreviewFormFields.submitButtonTestId}
                >
                  <Text>Save profile</Text>
                </Button>
                {usernameError ? (
                  <Text
                    className="text-destructive text-sm"
                    testID={uiPreviewFormFields.usernameErrorTestId}
                  >
                    {usernameError}
                  </Text>
                ) : null}
              </View>
            </Form>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}

export { UiPreviewSurface };
