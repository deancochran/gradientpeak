import { completeOnboardingSchema } from "@repo/core/schemas/onboarding";

function optionalString(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export type ParsedOnboardingFormData = ReturnType<typeof parseOnboardingFormData>;

export function parseOnboardingFormData(data: FormData) {
  return {
    profile: completeOnboardingSchema.parse({
      full_name: optionalString(data, "full_name"),
      username: optionalString(data, "username"),
    }),
    redirect: optionalString(data, "redirect") ?? "/",
  };
}
