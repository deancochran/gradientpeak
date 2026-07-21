import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteFlashToast, type RouteFlashType } from "../components/route-flash-toast";
import { authSessionMiddleware, resolveRouteAuthSession } from "../lib/auth/route-guards";
import {
  completeOnboardingIdentityAction,
  loadOnboardingOptions,
} from "../lib/onboarding/server-actions";

export const Route = createFileRoute("/onboarding")({
  server: { middleware: [authSessionMiddleware] },
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async ({ serverContext }) => {
    const session = await resolveRouteAuthSession(serverContext);
    if (!session?.user) {
      throw redirect({
        to: "/auth/login",
        search: { flash: undefined, flashType: undefined, redirect: "/onboarding" },
      });
    }
    if (!session.user.emailVerified) {
      throw redirect({
        to: "/auth/verify",
        search: { email: undefined, flash: undefined, flashType: undefined, source: undefined },
      });
    }
  },
  loader: async () => {
    const options = await loadOnboardingOptions();
    if (options.imported?.profile.onboarded) throw redirect({ to: "/" });
    return options;
  },
  component: OnboardingPage,
});

const intents = [
  ["train_event", "Train for an event"],
  ["improve_fitness", "Improve fitness"],
  ["track_activities", "Track activities"],
  ["groups", "Train with groups"],
  ["follow_people", "Follow athletes"],
  ["coach_group", "Coach or manage"],
  ["explore", "Just exploring"],
] as const;
const providers = ["strava", "wahoo", "trainingpeaks", "garmin", "zwift"] as const;

function SourceSelect({ field, defaultValue }: { field: string; defaultValue?: string }) {
  return (
    <select
      aria-label={`${field} source`}
      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      defaultValue={defaultValue ?? "manual"}
      name={`${field}_source`}
    >
      <option value="manual">Entered manually</option>
      <option value="estimated">Estimated</option>
      <option value="imported">Imported from provider</option>
    </select>
  );
}

function BaselineField({
  field,
  label,
  defaultValue,
  source,
  type = "number",
  min,
  max,
  step,
}: {
  field: string;
  label: string;
  defaultValue?: string | number;
  source?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor={field}>{label}</Label>
        <Input
          defaultValue={defaultValue}
          id={field}
          max={max}
          min={min}
          name={field}
          step={step}
          type={type}
        />
      </div>
      <SourceSelect {...(source ? { defaultValue: "imported" } : {})} field={field} />
      {source ? (
        <p className="text-xs text-muted-foreground sm:col-span-2">Imported from {source}</p>
      ) : null}
    </div>
  );
}

function CheckboxChoice({
  name,
  value,
  label,
  description,
}: {
  name: string;
  value: string;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex min-w-0 items-start gap-3 rounded-md border p-3">
      <input className="mt-1 size-4" name={name} type="checkbox" value={value} />
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description ? (
          <span className="block text-sm text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

function OnboardingPage() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof loadOnboardingOptions>>;
  const navigate = Route.useNavigate();
  const {
    flash,
    flashType,
    redirect: redirectTo,
  } = Route.useSearch() as { flash?: string; flashType?: RouteFlashType; redirect?: string };
  const imported = data.imported;
  const importedSource = (field: keyof NonNullable<typeof imported>["sources"]) =>
    imported?.sources[field]?.label;
  const dobSource = importedSource("dob");
  const ftpSource = importedSource("ftp");
  const genderSource = importedSource("gender");
  const weightSource = importedSource("weight_kg");

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <Card className="w-full overflow-hidden">
        <CardHeader>
          <p className="text-sm font-medium text-primary">Welcome to GradientPeak</p>
          <h1 className="text-3xl font-semibold tracking-tight">Set up your profile</h1>
          <CardDescription>
            Review every section, keep the optional choices you want, then finish setup once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RouteFlashToast
            {...(flash !== undefined ? { message: flash } : {})}
            {...(flashType !== undefined ? { type: flashType } : {})}
            clear={() =>
              void navigate({
                href: redirectTo
                  ? `/onboarding?redirect=${encodeURIComponent(redirectTo)}`
                  : "/onboarding",
                replace: true,
              } as never)
            }
          />

          <section aria-labelledby="providers-heading" className="mb-8 space-y-4 border-b pb-8">
            <div>
              <h2 className="text-xl font-semibold" id="providers-heading">
                Provider setup and import status
              </h2>
              <p className="text-sm text-muted-foreground">
                Connected providers contribute supported baseline evidence here. New web OAuth
                connections currently return to the mobile app, so connect there, then reload this
                page to review imported values.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {providers.map((provider) => {
                const connection = data.integrations.find((item) => item.provider === provider);
                return (
                  <div
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                    key={provider}
                  >
                    <div>
                      <p className="font-medium capitalize">{provider}</p>
                      <p className="text-xs text-muted-foreground">
                        {connection?.connected
                          ? connection.status.replaceAll("_", " ")
                          : "Not connected"}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                      {connection?.connected ? "Connected" : "Connect in mobile"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => window.location.reload()}
                size="sm"
                type="button"
                variant="outline"
              >
                Refresh provider status
              </Button>
              <a
                className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium underline underline-offset-4"
                href="/integrations"
              >
                Review integration status after setup
              </a>
            </div>
          </section>

          <form action={completeOnboardingIdentityAction.url} className="space-y-10" method="post">
            <input name="redirect" type="hidden" value={redirectTo ?? "/"} />
            <section aria-labelledby="identity-heading" className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold" id="identity-heading">
                  Profile and intent
                </h2>
                <p className="text-sm text-muted-foreground">
                  Identity is required. Personalization choices are optional.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input
                    autoComplete="name"
                    id="full_name"
                    maxLength={120}
                    name="full_name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    autoCapitalize="none"
                    autoComplete="username"
                    id="username"
                    maxLength={50}
                    name="username"
                    pattern="[A-Za-z0-9_]+"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience_level">Experience level</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue="skip"
                  id="experience_level"
                  name="experience_level"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="skip">Set up later</option>
                </select>
              </div>
              <fieldset className="space-y-3">
                <legend className="font-medium">What brings you here?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {intents.map(([value, label]) => (
                    <CheckboxChoice key={value} label={label} name="intents" value={value} />
                  ))}
                </div>
              </fieldset>
            </section>

            <section aria-labelledby="baseline-heading" className="space-y-5 border-t pt-8">
              <div>
                <h2 className="text-xl font-semibold" id="baseline-heading">
                  Training baseline
                </h2>
                <p className="text-sm text-muted-foreground">
                  Imported values retain provenance. Every baseline field is optional.
                </p>
              </div>
              <BaselineField
                {...(imported?.values.dob !== undefined
                  ? { defaultValue: imported.values.dob }
                  : {})}
                field="dob"
                label="Date of birth"
                {...(dobSource !== undefined ? { source: dobSource } : {})}
                type="date"
              />
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={imported?.values.gender ?? ""}
                    id="gender"
                    name="gender"
                  >
                    <option value="">Not set</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <SourceSelect
                  {...(genderSource ? { defaultValue: "imported" } : {})}
                  field="gender"
                />
              </div>
              <BaselineField
                {...(imported?.values.weight_kg !== undefined
                  ? { defaultValue: imported.values.weight_kg }
                  : {})}
                field="weight_kg"
                label="Weight (kg)"
                max={300}
                min={30}
                {...(weightSource !== undefined ? { source: weightSource } : {})}
                step="0.1"
              />
              <BaselineField field="max_hr" label="Maximum heart rate (bpm)" max={250} min={100} />
              <BaselineField
                field="resting_hr"
                label="Resting heart rate (bpm)"
                max={120}
                min={30}
              />
              <BaselineField
                {...(imported?.values.ftp !== undefined
                  ? { defaultValue: imported.values.ftp }
                  : {})}
                field="ftp"
                label="Cycling FTP (watts)"
                max={700}
                min={20}
                {...(ftpSource !== undefined ? { source: ftpSource } : {})}
              />
              <BaselineField
                field="threshold_pace_seconds_per_km"
                label="Running threshold pace (seconds/km)"
                max={1200}
                min={120}
              />
              <BaselineField
                field="css_seconds_per_hundred_meters"
                label="Swim CSS (seconds/100m)"
                max={600}
                min={45}
              />
            </section>

            <section aria-labelledby="preferences-heading" className="space-y-5 border-t pt-8">
              <div>
                <h2 className="text-xl font-semibold" id="preferences-heading">
                  Training preferences
                </h2>
                <p className="text-sm text-muted-foreground">
                  Choose a starting approach and weekly dose.
                </p>
              </div>
              <CheckboxChoice label="Save these preferences" name="save_preferences" value="on" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="preference_preset">Progression approach</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue="balanced"
                    id="preference_preset"
                    name="preference_preset"
                  >
                    <option value="safer">Safer</option>
                    <option value="balanced">Balanced</option>
                    <option value="push_harder">Push harder</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min_sessions_per_week">Minimum sessions/week</Label>
                  <Input
                    defaultValue="3"
                    id="min_sessions_per_week"
                    max={21}
                    min={0}
                    name="min_sessions_per_week"
                    type="number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_sessions_per_week">Maximum sessions/week</Label>
                  <Input
                    defaultValue="5"
                    id="max_sessions_per_week"
                    max={21}
                    min={0}
                    name="max_sessions_per_week"
                    type="number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_single_session_minutes">Maximum session minutes</Label>
                  <Input
                    defaultValue="90"
                    id="max_single_session_minutes"
                    max={600}
                    min={20}
                    name="max_single_session_minutes"
                    type="number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_weekly_minutes">Maximum weekly minutes</Label>
                  <Input
                    defaultValue="360"
                    id="max_weekly_minutes"
                    max={10080}
                    min={30}
                    name="max_weekly_minutes"
                    type="number"
                  />
                </div>
              </div>
            </section>

            <section aria-labelledby="goal-heading" className="space-y-5 border-t pt-8">
              <div>
                <h2 className="text-xl font-semibold" id="goal-heading">
                  Initial goal (optional)
                </h2>
                <p className="text-sm text-muted-foreground">
                  Leave the title blank to skip goal creation.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="goal_title">Goal title</Label>
                  <Input id="goal_title" maxLength={100} name="goal_title" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal_target_date">Target date</Label>
                  <Input id="goal_target_date" name="goal_target_date" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal_activity_category">Activity</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue="run"
                    id="goal_activity_category"
                    name="goal_activity_category"
                  >
                    <option value="bike">Cycling</option>
                    <option value="run">Running</option>
                    <option value="swim">Swimming</option>
                    <option value="strength">Strength</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal_target_sessions_per_week">Sessions/week</Label>
                  <Input
                    defaultValue="3"
                    id="goal_target_sessions_per_week"
                    max={21}
                    min={1}
                    name="goal_target_sessions_per_week"
                    type="number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal_target_weeks">Duration (weeks)</Label>
                  <Input
                    defaultValue="12"
                    id="goal_target_weeks"
                    max={260}
                    min={1}
                    name="goal_target_weeks"
                    type="number"
                  />
                </div>
              </div>
            </section>

            <section aria-labelledby="community-heading" className="space-y-5 border-t pt-8">
              <div>
                <h2 className="text-xl font-semibold" id="community-heading">
                  Groups and people
                </h2>
                <p className="text-sm text-muted-foreground">
                  Nothing is sent until you finish setup.
                </p>
              </div>
              <div className="grid gap-6 lg:grid-cols-3">
                <fieldset className="space-y-3">
                  <legend className="font-medium">Invitations</legend>
                  {data.invitations.length ? (
                    data.invitations.map((item) => (
                      <CheckboxChoice
                        key={item.id}
                        label={item.name}
                        name="invitation_ids"
                        value={item.id}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No pending invitations.</p>
                  )}
                </fieldset>
                <fieldset className="space-y-3">
                  <legend className="font-medium">Groups</legend>
                  {data.groups.length ? (
                    data.groups.map((item) => (
                      <CheckboxChoice
                        description={item.action}
                        key={item.id}
                        label={item.name}
                        name="group_ids"
                        value={item.id}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No group suggestions.</p>
                  )}
                </fieldset>
                <fieldset className="space-y-3">
                  <legend className="font-medium">People</legend>
                  {data.people.length ? (
                    data.people.map((item) => (
                      <CheckboxChoice
                        description={`@${item.username}`}
                        key={item.id}
                        label={item.name}
                        name="follow_profile_ids"
                        value={item.id}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No people suggestions.</p>
                  )}
                </fieldset>
              </div>
            </section>

            <Button className="w-full sm:w-auto sm:min-w-48" type="submit">
              Finish setup
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
