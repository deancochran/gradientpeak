import { z } from "zod";

export const settingsProfileFormSchema = z.object({
  is_public: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional(),
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

export type SettingsProfileFormValues = z.infer<typeof settingsProfileFormSchema>;
