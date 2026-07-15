import { onboardingStep1Schema, type ProfilePatchInput } from "@repo/core";
import {
  defaultPreferredUnitSystem,
  type PreferredUnitSystem,
  resolvePreferredUnitSystem,
} from "@repo/core/units";
import { z } from "zod";

export type ProfileEditFormDefaults = {
  full_name: string;
  username: string | null;
  bio: string | null;
  dob: string | null;
  preferred_units: PreferredUnitSystem;
  language: string | null;
  is_public: boolean | null;
};

export const profileEditFormSchema = z.object({
  full_name: onboardingStep1Schema.shape.full_name,
  username: z.string().min(3, "Username must be at least 3 characters").nullable(),
  bio: z.string().max(500, "Bio must be 500 characters or less").nullable(),
  dob: z.string().nullable(),
  preferred_units: z.enum(["metric", "imperial"]).nullable(),
  language: z.string().nullable(),
  is_public: z.boolean().nullable(),
});

export type ProfileEditForm = z.infer<typeof profileEditFormSchema>;

/** Maps mobile form values to the canonical API patch while preserving blank handling. */
export function toProfilePatchInput(
  values: ProfileEditForm,
): ProfilePatchInput & Pick<ProfileEditForm, "full_name"> {
  return {
    full_name: values.full_name,
    username: values.username || null,
    bio: values.bio || null,
    dob: values.dob || null,
    preferred_units: values.preferred_units || null,
    language: values.language || null,
    is_public: values.is_public ?? undefined,
  };
}

export function getProfileEditFormDefaults(profile?: {
  full_name?: string | null;
  username?: string | null;
  bio?: string | null;
  dob?: string | null;
  preferred_units?: unknown;
  language?: string | null;
  is_public?: boolean | null;
}): ProfileEditFormDefaults {
  return {
    full_name: profile?.full_name || "",
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
