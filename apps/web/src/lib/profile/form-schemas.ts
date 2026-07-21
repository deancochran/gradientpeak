import { authRequiredPasswordSchema, authStrongPasswordSchema } from "@repo/auth/forms";
import type { ContentVisibility, ProfilePatchInput } from "@repo/core";
import { contentVisibilitySchema } from "@repo/core";
import {
  defaultPreferredUnitSystem,
  preferredUnitSystemSchema,
  resolvePreferredUnitSystem,
} from "@repo/core/units";
import { z } from "zod";

export const changePasswordFormSchema = z
  .object({
    currentPassword: authRequiredPasswordSchema,
    newPassword: authStrongPasswordSchema,
    confirmPassword: authRequiredPasswordSchema,
  })
  .superRefine(({ confirmPassword, currentPassword, newPassword }, context) => {
    if (newPassword !== confirmPassword) {
      context.addIssue({
        code: "custom",
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
    }
    if (currentPassword === newPassword) {
      context.addIssue({
        code: "custom",
        message: "New password must be different from current password",
        path: ["newPassword"],
      });
    }
  });

export const settingsProfileFormSchema = z.object({
  bio: z.string().trim().max(500, "Bio must be 500 characters or fewer").optional(),
  default_content_visibility: contentVisibilitySchema.optional(),
  is_public: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional(),
  language: z.string().trim().max(10, "Language must be 10 characters or fewer").optional(),
  full_name: z.string().trim().min(1, "Full name is required").max(100),
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

/** Maps web form values to the canonical API patch without changing web form semantics. */
export function toProfilePatchInput(values: SettingsProfileFormValues): ProfilePatchInput {
  return {
    bio: values.bio?.trim() ? values.bio.trim() : null,
    full_name: values.full_name.trim(),
    default_content_visibility: values.default_content_visibility,
    is_public: values.is_public,
    language: values.language?.trim() ? values.language.trim() : null,
    preferred_units: values.preferred_units,
    username: values.username.trim() === "" ? null : values.username.trim(),
  };
}

export function getSettingsProfileFormDefaults(profile?: {
  bio?: string | null;
  full_name?: string | null;
  default_content_visibility?: ContentVisibility | null;
  is_public?: boolean | null;
  language?: string | null;
  preferred_units?: unknown;
  username?: string | null;
}): SettingsProfileFormValues {
  return {
    bio: profile?.bio ?? "",
    full_name: profile?.full_name ?? "",
    default_content_visibility: profile?.default_content_visibility ?? "private",
    is_public: profile?.is_public ?? false,
    language: profile?.language ?? "",
    preferred_units: profile
      ? resolvePreferredUnitSystem(profile.preferred_units)
      : defaultPreferredUnitSystem,
    username: profile?.username ?? "",
  };
}
