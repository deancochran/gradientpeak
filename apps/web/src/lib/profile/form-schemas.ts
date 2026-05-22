import { z } from "zod";

export const settingsProfileFormSchema = z.object({
  bio: z.string().trim().max(500, "Bio must be 500 characters or fewer").optional(),
  is_public: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional(),
  language: z.string().trim().max(10, "Language must be 10 characters or fewer").optional(),
  preferred_units: z.enum(["metric", "imperial"]).optional(),
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
