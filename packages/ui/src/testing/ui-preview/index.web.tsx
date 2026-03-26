"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "../../components/button/index.web";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/card/index.web";
import { Checkbox } from "../../components/checkbox/index.web";
import { EmptyStateCard } from "../../components/empty-state-card/index.web";
import { ErrorStateCard } from "../../components/error-state-card/index.web";
import {
  Form,
  FormSelectField,
  FormSwitchField,
  FormTextareaField,
  FormTextField,
} from "../../components/form/index.web";
import { Input } from "../../components/input/index.web";
import { Label } from "../../components/label/index.web";
import { ChartSkeleton, ListSkeleton } from "../../components/loading-skeletons/index.web";
import { RadioGroup, RadioGroupItem } from "../../components/radio-group/index.web";
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/select/index.web";
import { Switch } from "../../components/switch/index.web";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/tabs/index.web";
import { uiPreviewContract, uiPreviewFixtures, uiPreviewFormFields } from "./shared";

type UiPreviewFormValues = {
  bio: string;
  is_public: boolean;
  sport: string;
  username: string;
};

function ScenarioHeader({ description, title }: { description: string; title: string }) {
  return (
    <header className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>
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
  const [selectedWorkoutType, setSelectedWorkoutType] = useState<string>(
    uiPreviewFixtures.select.value,
  );
  const [tabValue, setTabValue] = useState<string>(uiPreviewFixtures.tabs.values.overview);
  const usernameError = form.formState.errors.username?.message;

  return (
    <main
      className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 p-8"
      data-testid={uiPreviewContract.rootTestId}
    >
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {uiPreviewContract.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{uiPreviewContract.webTitle}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{uiPreviewContract.description}</p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <section
          className="space-y-4"
          data-testid={uiPreviewContract.scenarios.accountControls.testId}
        >
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
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Input {...uiPreviewFixtures.input} />
                <Button {...uiPreviewFixtures.button}>{uiPreviewFixtures.button.children}</Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4" data-testid={uiPreviewContract.scenarios.planTabs.testId}>
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
                {uiPreviewFixtures.tabs.triggers.overview.label}
              </TabsTrigger>
              <TabsTrigger
                testId={uiPreviewFixtures.tabs.triggers.sessions.testId}
                value={uiPreviewFixtures.tabs.values.sessions}
              >
                {uiPreviewFixtures.tabs.triggers.sessions.label}
              </TabsTrigger>
              <TabsTrigger
                testId={uiPreviewFixtures.tabs.triggers.notes.testId}
                value={uiPreviewFixtures.tabs.values.notes}
              >
                {uiPreviewFixtures.tabs.triggers.notes.label}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              testId={uiPreviewFixtures.tabs.contentTestIds.overview}
              value={uiPreviewFixtures.tabs.values.overview}
            >
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  {uiPreviewFixtures.tabs.content.overview}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent
              testId={uiPreviewFixtures.tabs.contentTestIds.sessions}
              value={uiPreviewFixtures.tabs.values.sessions}
            >
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  {uiPreviewFixtures.tabs.content.sessions}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent
              testId={uiPreviewFixtures.tabs.contentTestIds.notes}
              value={uiPreviewFixtures.tabs.values.notes}
            >
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  {uiPreviewFixtures.tabs.content.notes}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        <section
          className="space-y-4 lg:col-span-2"
          data-testid={uiPreviewContract.scenarios.feedbackStates.testId}
        >
          <ScenarioHeader
            description={uiPreviewContract.scenarios.feedbackStates.description}
            title={uiPreviewContract.scenarios.feedbackStates.title}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <EmptyStateCard {...uiPreviewFixtures.emptyStateCard} />
            <ErrorStateCard {...uiPreviewFixtures.errorStateCard} />
            <div className="space-y-4 rounded-xl border p-4">
              <ChartSkeleton {...uiPreviewFixtures.loadingSkeleton.chart} />
              <ListSkeleton {...uiPreviewFixtures.loadingSkeleton.list} />
            </div>
          </div>
        </section>

        <section
          className="space-y-4 lg:col-span-2"
          data-testid={uiPreviewContract.scenarios.selectionControls.testId}
        >
          <ScenarioHeader
            description={uiPreviewContract.scenarios.selectionControls.description}
            title={uiPreviewContract.scenarios.selectionControls.title}
          />
          <div className="grid gap-6 rounded-xl border p-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  {...uiPreviewFixtures.checkbox}
                  checked={isChecked}
                  onCheckedChange={(nextChecked) => setIsChecked(nextChecked === true)}
                />
                <Label htmlFor={uiPreviewFixtures.checkbox.id}>Accept terms</Label>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Email notifications</p>
                  <p className="text-xs text-muted-foreground">Shared switch contract</p>
                </div>
                <Switch
                  {...uiPreviewFixtures.switch}
                  checked={isSwitchEnabled}
                  onCheckedChange={(nextValue) => setIsSwitchEnabled(nextValue)}
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
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
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </NativeSelectScrollView>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={uiPreviewFixtures.radioGroup.id}>Preferred sport</Label>
                <RadioGroup
                  id={uiPreviewFixtures.radioGroup.id}
                  onValueChange={(nextValue) => setSelectedSport(nextValue)}
                  testId={uiPreviewFixtures.radioGroup.testId}
                  value={selectedSport}
                >
                  {uiPreviewFixtures.radioGroup.options.map((option) => (
                    <div key={option.value} className="flex items-center gap-2">
                      <RadioGroupItem
                        id={`${uiPreviewFixtures.radioGroup.id}-${option.value}`}
                        value={option.value}
                      />
                      <Label htmlFor={`${uiPreviewFixtures.radioGroup.id}-${option.value}`}>
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </div>
        </section>

        <section
          className="space-y-4 lg:col-span-2"
          data-testid={uiPreviewContract.scenarios.formFields.testId}
        >
          <ScenarioHeader
            description={uiPreviewContract.scenarios.formFields.description}
            title={uiPreviewContract.scenarios.formFields.title}
          />
          <Card>
            <CardContent className="pt-6">
              <Form {...form}>
                <form
                  className="grid gap-4 md:grid-cols-2"
                  onSubmit={form.handleSubmit(() => undefined)}
                >
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
                  <div className="md:col-span-2">
                    <FormTextareaField
                      control={form.control}
                      label="Bio"
                      name="bio"
                      rules={{
                        minLength: { value: 12, message: "Bio must be at least 12 characters." },
                      }}
                      testId={uiPreviewFormFields.bioTestId}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <FormSwitchField
                      control={form.control}
                      label="Public profile"
                      name="is_public"
                      switchLabel="Public profile"
                      testId={uiPreviewFormFields.isPublicTestId}
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-3">
                    <Button testId={uiPreviewFormFields.submitButtonTestId} type="submit">
                      Save profile
                    </Button>
                    {usernameError ? (
                      <p
                        className="text-destructive text-sm"
                        data-testid={uiPreviewFormFields.usernameErrorTestId}
                      >
                        {usernameError}
                      </p>
                    ) : null}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </section>
      </section>
    </main>
  );
}

export { UiPreviewSurface };
