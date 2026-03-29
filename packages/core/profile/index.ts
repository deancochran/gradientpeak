import { z } from "zod";

import { profileQuickUpdateSchema } from "../schemas";

export interface ProfileWithDob {
  dob: string | null;
}

export const profileSummarySchema = z
  .object({
    avatar_url: z.string().nullable().optional(),
    full_name: z.string().nullable().optional(),
    id: z.string().uuid().optional(),
    username: z.string().nullable().optional(),
  })
  .transform((value) => ({
    avatar_url: value.avatar_url ?? null,
    full_name: value.full_name ?? null,
    id: value.id,
    username: value.username ?? null,
  }));

export type ProfileSummary = z.infer<typeof profileSummarySchema>;

export const profileSettingsViewSchema = z
  .object({
    avatar_url: z.string().nullable().optional(),
    ftp: z.number().nullable().optional(),
    is_public: z.boolean().nullable().optional(),
    threshold_hr: z.number().nullable().optional(),
    username: z.string().nullable().optional(),
    weight_kg: z.number().nullable().optional(),
  })
  .passthrough()
  .transform((value) => ({
    avatar_url: value.avatar_url ?? null,
    ftp: value.ftp ?? null,
    is_public: value.is_public ?? false,
    threshold_hr: value.threshold_hr ?? null,
    username: value.username ?? null,
    weight_kg: value.weight_kg ?? null,
  }));

export type ProfileSettingsView = z.infer<typeof profileSettingsViewSchema>;

export const publicProfileViewSchema = z.object({
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  followers_count: z.number().nullable().optional(),
  following_count: z.number().nullable().optional(),
  follow_status: z.string().nullable().optional(),
  gender: z.string().nullable(),
  id: z.string().uuid(),
  is_public: z.boolean().nullable().optional(),
  language: z.string().nullable(),
  preferred_units: z.string().nullable(),
  username: z.string().nullable(),
});

export type PublicProfileView = z.infer<typeof publicProfileViewSchema>;

export function normalizeProfileSummary(value: unknown): ProfileSummary | null {
  const parsed = profileSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizeProfileSettingsView(value: unknown): ProfileSettingsView | null {
  const parsed = profileSettingsViewSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function normalizePublicProfileView(value: unknown): PublicProfileView | null {
  const parsed = publicProfileViewSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getProfileQuickUpdateDefaults(
  profile: ProfileSettingsView | null | undefined,
): z.input<typeof profileQuickUpdateSchema> {
  return {
    ftp: profile?.ftp ?? undefined,
    is_public: profile?.is_public ?? false,
    threshold_hr: profile?.threshold_hr ?? undefined,
    username: profile?.username ?? "",
    weight_kg: profile?.weight_kg ?? undefined,
  };
}

export function getProfileDisplayName(profile: ProfileSummary | null | undefined): string {
  return profile?.full_name || profile?.username || "Unknown";
}

export function getProfileInitials(profile: ProfileSummary | null | undefined): string {
  const displayName = getProfileDisplayName(profile);
  return displayName
    .split(/\s+/)
    .map((segment) => segment[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
