import { zodResolver } from "@hookform/resolvers/zod";
import { ianaTimezoneSchema } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormTimezoneField,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createCoachingOrganization } from "../../lib/coaching/server-functions";

const organizationFormSchema = z.object({
  name: z.string().trim().min(1, "Enter an organization name.").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "Enter a URL name.")
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens."),
  timezone: ianaTimezoneSchema,
});

type OrganizationFormValues = z.infer<typeof organizationFormSchema>;

function initialTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function OrganizationCreateForm() {
  const router = useRouter();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const uncertainCreateRef = useRef<{ fingerprint: string; organizationId: string } | null>(null);
  const form = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: { name: "", slug: "", timezone: initialTimezone() },
  });

  const onSubmit = async (values: OrganizationFormValues) => {
    setSubmissionError(null);
    const fingerprint = JSON.stringify(values);
    const uncertainCreate = uncertainCreateRef.current;
    if (uncertainCreate && uncertainCreate.fingerprint !== fingerprint) {
      setSubmissionError(
        "We could not confirm the previous creation. Check your organizations before starting a new draft.",
      );
      return;
    }
    const organizationId = uncertainCreate?.organizationId ?? crypto.randomUUID();
    try {
      const created = await createCoachingOrganization({
        data: { organizationId, ...values },
      });
      uncertainCreateRef.current = null;
      await router.invalidate();
      await router.navigate({
        to: "/organizations/$organizationId/dashboard",
        params: { organizationId: created.organizationId },
      });
    } catch {
      uncertainCreateRef.current = { fingerprint, organizationId };
      setSubmissionError(
        "We could not confirm whether the organization was created. Retry the same draft, or check your organizations before starting a new draft.",
      );
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-5" noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization name</FormLabel>
              <FormControl>
                <Input autoComplete="organization" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization URL name</FormLabel>
              <FormControl>
                <Input autoCapitalize="none" autoComplete="off" spellCheck={false} {...field} />
              </FormControl>
              <FormDescription>
                Used to identify this organization. It cannot contain spaces.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormTimezoneField
          control={form.control}
          deviceTimeZone={initialTimezone()}
          label="Organization time zone"
          name="timezone"
          rules={{ required: "Choose an organization time zone." }}
        />
        {submissionError ? (
          <p role="alert" className="text-sm text-red-300">
            {submissionError}
          </p>
        ) : null}
        <Button disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting ? "Creating organization…" : "Create organization"}
        </Button>
        {uncertainCreateRef.current ? (
          <Button
            onClick={() => {
              uncertainCreateRef.current = null;
              setSubmissionError(null);
            }}
            type="button"
            variant="outline"
          >
            Start a new draft
          </Button>
        ) : null}
      </form>
    </Form>
  );
}
