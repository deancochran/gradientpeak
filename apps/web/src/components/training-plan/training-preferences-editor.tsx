import {
  type AthleteTrainingSettings,
  defaultAthletePreferenceProfile,
  getTrainingPreferenceCatalogForTab,
  type TrainingPreferenceField,
  type TrainingPreferenceTab,
  trainingPreferenceTabs,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { useEffect, useState } from "react";

import { api } from "../../lib/api/client";
import {
  hydrateTrainingPreferences,
  validateTrainingPreferences,
} from "./training-preferences-form";

const TAB_LABELS: Record<TrainingPreferenceTab, string> = {
  preferences: "Preferences",
  availability: "Availability",
  schedule: "Schedule",
  "training-style": "Training style",
  recovery: "Recovery",
  "goal-strategy": "Goal strategy",
  "baseline-fitness": "Baseline fitness",
};

function readPath(settings: AthleteTrainingSettings, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, settings);
}

function writePath(settings: AthleteTrainingSettings, path: string, value: unknown) {
  const cloned: unknown = structuredClone(settings);
  if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) return settings;
  const copy = cloned as Record<string, unknown>;
  const keys = path.split(".");
  let target = copy;
  for (const key of keys.slice(0, -1)) {
    const child = target[key];
    if (!child || typeof child !== "object") target[key] = {};
    target = target[key] as Record<string, unknown>;
  }
  const finalKey = keys.at(-1);
  if (finalKey) target[finalKey] = value;
  return hydrateTrainingPreferences(copy);
}

function ComplexJsonField({
  field,
  onChange,
  value,
}: {
  field: TrainingPreferenceField;
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
  return (
    <label className="block space-y-2" htmlFor={`training-preferences-${field.testIdStem}`}>
      <span className="text-sm font-medium">{field.label}</span>
      <Textarea
        aria-invalid={Boolean(error)}
        className="min-h-36 font-mono text-xs"
        data-testid={`training-preferences-${field.testIdStem}`}
        id={`training-preferences-${field.testIdStem}`}
        onBlur={() => {
          try {
            onChange(JSON.parse(text));
            setError(null);
          } catch {
            setError("Enter valid JSON before saving.");
          }
        }}
        onChange={(event) => setText(event.target.value)}
        value={text}
      />
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </label>
  );
}

function PreferenceField({
  field,
  onChange,
  settings,
}: {
  field: TrainingPreferenceField;
  onChange: (settings: AthleteTrainingSettings) => void;
  settings: AthleteTrainingSettings;
}) {
  if (!field.globalPath) return null;
  const value = readPath(settings, field.globalPath);
  const update = (next: unknown) => onChange(writePath(settings, field.globalPath as string, next));

  if (
    field.control === "availability-windows" ||
    field.control === "weekday-list" ||
    field.control === "sport-overrides"
  ) {
    return <ComplexJsonField field={field} onChange={update} value={value} />;
  }
  if (field.control === "boolean") {
    return (
      <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <span className="font-medium">{field.label}</span>
        <input
          checked={Boolean(value)}
          data-testid={`training-preferences-${field.testIdStem}`}
          onChange={(event) => update(event.target.checked)}
          type="checkbox"
        />
      </label>
    );
  }
  if (field.control === "date") {
    const dateValue = typeof value === "string" ? value.slice(0, 10) : "";
    return (
      <label className="block space-y-2" htmlFor={`training-preferences-${field.testIdStem}`}>
        <span className="text-sm font-medium">{field.label}</span>
        <Input
          data-testid={`training-preferences-${field.testIdStem}`}
          id={`training-preferences-${field.testIdStem}`}
          onChange={(event) =>
            update(event.target.value ? `${event.target.value}T00:00:00.000Z` : undefined)
          }
          type="date"
          value={dateValue}
        />
      </label>
    );
  }

  return (
    <label className="block space-y-2" htmlFor={`training-preferences-${field.testIdStem}`}>
      <span className="text-sm font-medium">{field.label}</span>
      <div className="flex items-center gap-2">
        <Input
          data-testid={`training-preferences-${field.testIdStem}`}
          id={`training-preferences-${field.testIdStem}`}
          max={field.max}
          min={field.min}
          onChange={(event) => update(Number(event.target.value))}
          step={field.step}
          type="number"
          value={typeof value === "number" ? value : (field.requiredDefault ?? "")}
        />
        {field.unit ? <span className="text-sm text-muted-foreground">{field.unit}</span> : null}
      </div>
    </label>
  );
}

export function TrainingPreferencesEditor() {
  const utils = api.useUtils();
  const profile = api.profiles.get.useQuery();
  const profileId = profile.data?.id;
  const settingsQuery = api.profileSettings.getForProfile.useQuery(
    { profile_id: profileId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(profileId) },
  );
  const saveMutation = api.profileSettings.upsert.useMutation();
  const [activeTab, setActiveTab] = useState<TrainingPreferenceTab>("preferences");
  const [draft, setDraft] = useState<AthleteTrainingSettings>(() =>
    hydrateTrainingPreferences(defaultAthletePreferenceProfile),
  );
  const [hydratedProfile, setHydratedProfile] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!profileId || settingsQuery.isLoading || hydratedProfile === profileId) return;
    setDraft(
      hydrateTrainingPreferences(settingsQuery.data?.settings ?? defaultAthletePreferenceProfile),
    );
    setHydratedProfile(profileId);
    setDirty(false);
  }, [hydratedProfile, profileId, settingsQuery.data, settingsQuery.isLoading]);

  const save = async () => {
    if (!profileId) return;
    setMessage(null);
    setSaveFailed(false);
    const parsed = validateTrainingPreferences(draft);
    if (!parsed.success) {
      setMessage(parsed.message);
      return;
    }
    try {
      const result = await saveMutation.mutateAsync({
        profile_id: profileId,
        settings: parsed.data,
      });
      setDraft(hydrateTrainingPreferences(result.settings));
      setDirty(false);
      setMessage("Training preferences saved.");
      await Promise.all([
        utils.profileSettings.getForProfile.invalidate(),
        utils.trainingPlans.invalidate(),
      ]);
    } catch (error) {
      setSaveFailed(true);
      setMessage(error instanceof Error ? error.message : "Could not save preferences. Try again.");
    }
  };

  if (profile.isLoading || (profileId && settingsQuery.isLoading)) {
    return <p aria-live="polite">Loading training preferences…</p>;
  }
  const loadError = profile.error ?? settingsQuery.error;
  if (loadError) {
    return (
      <div className="space-y-3" role="alert">
        <p>Unable to load training preferences: {loadError.message}</p>
        <Button
          onClick={() => {
            void profile.refetch();
            if (profileId) void settingsQuery.refetch();
          }}
          type="button"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!profileId) return <p role="alert">No profile is available for these preferences.</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Planning defaults</p>
        <h1 className="text-3xl font-semibold">Training preferences</h1>
        <p className="mt-2 text-muted-foreground">
          These validated settings hydrate plan creation and scheduling across mobile and web.
        </p>
      </div>
      <nav aria-label="Preference sections" className="flex flex-wrap gap-2">
        {trainingPreferenceTabs.map((tab) => (
          <Button
            aria-current={activeTab === tab ? "page" : undefined}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
            variant={activeTab === tab ? "default" : "outline"}
          >
            {TAB_LABELS[tab]}
          </Button>
        ))}
      </nav>
      <Card>
        <CardHeader>
          <CardTitle>{TAB_LABELS[activeTab]}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          {getTrainingPreferenceCatalogForTab(activeTab).map((field) => (
            <PreferenceField
              field={field}
              key={field.id}
              onChange={(settings) => {
                setDraft(settings);
                setDirty(true);
                setMessage(null);
                setSaveFailed(false);
              }}
              settings={draft}
            />
          ))}
        </CardContent>
      </Card>
      {message ? (
        <p aria-live="polite" role={saveFailed ? "alert" : undefined}>
          {message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          disabled={!dirty || saveMutation.isPending}
          onClick={() => void save()}
          type="button"
        >
          {saveMutation.isPending ? "Saving…" : saveFailed ? "Retry save" : "Save preferences"}
        </Button>
        <Button
          disabled={!dirty || saveMutation.isPending}
          onClick={() => {
            setDraft(
              hydrateTrainingPreferences(
                settingsQuery.data?.settings ?? defaultAthletePreferenceProfile,
              ),
            );
            setDirty(false);
            setMessage(null);
            setSaveFailed(false);
          }}
          type="button"
          variant="outline"
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
