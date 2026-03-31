import {
  type AthleteTrainingSettings,
  defaultAthletePreferenceProfile,
  type ProfileTrainingSettingsRecord,
  profileTrainingSettingsRecordSchema,
} from "@repo/core";
import { useCallback, useMemo } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "@/lib/api";

const DEFAULT_PROFILE_SETTINGS: AthleteTrainingSettings = defaultAthletePreferenceProfile;

export function useProfileSettings() {
  const profileId = useAuthStore((state) => state.profile?.id ?? null);

  const query = api.profileSettings.getForProfile.useQuery(
    { profile_id: profileId ?? "" },
    {
      enabled: !!profileId,
    },
  );

  const settingsRecord = useMemo<ProfileTrainingSettingsRecord | null>(() => {
    if (!query.data) {
      return null;
    }

    const parsed = profileTrainingSettingsRecordSchema.safeParse(query.data);
    return parsed.success ? parsed.data : null;
  }, [query.data]);

  const settings = settingsRecord?.settings ?? DEFAULT_PROFILE_SETTINGS;

  const refetch = useCallback(async () => {
    if (!profileId) {
      return;
    }

    await query.refetch();
  }, [profileId, query.refetch]);

  return {
    profileId,
    hasProfileId: !!profileId,
    settingsRecord,
    settings,
    defaultSettings: DEFAULT_PROFILE_SETTINGS,
    hasSavedSettings: !!settingsRecord,
    isUsingDefaults: !settingsRecord,
    isLoading: !!profileId && query.isLoading,
    isFetching: !!profileId && query.isFetching,
    isError: !!profileId && query.isError,
    error: profileId ? query.error : null,
    refetch,
  };
}
