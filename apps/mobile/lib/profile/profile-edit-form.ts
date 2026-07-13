import {
  defaultPreferredUnitSystem,
  type PreferredUnitSystem,
  resolvePreferredUnitSystem,
} from "@repo/core/units";

export type ProfileEditFormDefaults = {
  username: string | null;
  bio: string | null;
  dob: string | null;
  preferred_units: PreferredUnitSystem;
  language: string | null;
  is_public: boolean | null;
};

export function getProfileEditFormDefaults(profile?: {
  username?: string | null;
  bio?: string | null;
  dob?: string | null;
  preferred_units?: unknown;
  language?: string | null;
  is_public?: boolean | null;
}): ProfileEditFormDefaults {
  return {
    username: profile?.username || null,
    bio: profile?.bio || null,
    dob: profile?.dob || null,
    preferred_units: profile
      ? resolvePreferredUnitSystem(profile.preferred_units)
      : defaultPreferredUnitSystem,
    language: profile?.language || "en",
    is_public: profile?.is_public ?? true,
  };
}
