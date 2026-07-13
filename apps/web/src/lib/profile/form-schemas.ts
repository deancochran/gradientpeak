import {
  defaultPreferredUnitSystem,
  preferredUnitSystemSchema,
  resolvePreferredUnitSystem,
} from "@repo/core/units";
import { z } from "zod";

export const settingsProfileFormSchema = z.object({
  bio: z.string().trim().max(500, "Bio must be 500 characters or fewer").optional(),
  is_public: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional(),
  language: z.string().trim().max(10, "Language must be 10 characters or fewer").optional(),
  preferred_units: preferredUnitSystemSchema.optional(),
  username: z
    .string()
    .trim()
    .refine(
      (value) =>
        value.length === 0 ||
        (value.length >= 3 && value.length <= 30 && /^[a-zA-Z0-9_]+$/.test(value)),
      "Username must be 3-30 characters and use only letters, numbers, and underscores",
    ),
});

export type SettingsProfileFormInput = z.input<typeof settingsProfileFormSchema>;
export type SettingsProfileFormValues = z.infer<typeof settingsProfileFormSchema>;

export function getSettingsProfileFormDefaults(profile?: {
  bio?: string | null;
  is_public?: boolean | null;
  language?: string | null;
  preferred_units?: unknown;
  username?: string | null;
}): SettingsProfileFormValues {
  return {
    bio: profile?.bio ?? "",
    is_public: profile?.is_public ?? false,
    language: profile?.language ?? "",
    preferred_units: profile
      ? resolvePreferredUnitSystem(profile.preferred_units)
      : defaultPreferredUnitSystem,
    username: profile?.username ?? "",
  };
}
