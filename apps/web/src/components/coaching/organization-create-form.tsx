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
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createCoachingOrganization } from "../../lib/coaching/server-functions";
import { useAuth } from "../providers/auth-provider";

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

type OrganizationFormInput = z.input<typeof organizationFormSchema>;
type OrganizationFormOutput = z.output<typeof organizationFormSchema>;

type UncertainCreate = {
  actorId: string;
  fingerprint: string;
  organizationId: string;
};

type CreateOperation = {
  actorId: string;
  fingerprint: string;
  organizationId: string;
  result: { kind: "created"; organizationId: string } | { kind: "uncertain" } | null;
  state: "creating" | "committed";
};

function initialTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function OrganizationCreateForm() {
  const router = useRouter();
  const { user } = useAuth();
  const actorId = user?.id ?? null;
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [createdOrganizationId, setCreatedOrganizationId] = useState<string | null>(null);
  const [isRecoveringNavigation, setIsRecoveringNavigation] = useState(false);
  const mountedRef = useRef(true);
  const actorIdRef = useRef(actorId);
  const routerRef = useRef(router);
  const operationRef = useRef<CreateOperation | null>(null);
  const navigationEpochRef = useRef(0);
  const activeNavigationRef = useRef<number | null>(null);
  const uncertainCreateRef = useRef<UncertainCreate | null>(null);
  const form = useForm<OrganizationFormInput, unknown, OrganizationFormOutput>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: { name: "", slug: "", timezone: initialTimezone() },
  });

  actorIdRef.current = actorId;
  routerRef.current = router;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      navigationEpochRef.current += 1;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: actor transitions deliberately trigger reconciliation through live operation refs.
  useEffect(() => {
    const operation = operationRef.current;
    if (!operation) return;

    if (operation.actorId !== actorId) {
      navigationEpochRef.current += 1;
      activeNavigationRef.current = null;
      setCreatedOrganizationId(null);
      setIsRecoveringNavigation(false);
      setSubmissionError(
        "Your session changed. Return to the original account to finish checking this organization.",
      );
      return;
    }

    settleCreateOperation(operation);
  }, [actorId]);

  const isCurrentOperation = (operation: CreateOperation) =>
    mountedRef.current &&
    operationRef.current === operation &&
    actorIdRef.current === operation.actorId;

  const navigateToCreatedOrganization = async (operation: CreateOperation) => {
    if (!isCurrentOperation(operation)) return;

    const navigationEpoch = ++navigationEpochRef.current;
    activeNavigationRef.current = navigationEpoch;
    setIsRecoveringNavigation(true);
    try {
      await routerRef.current.invalidate();
      if (
        !isCurrentOperation(operation) ||
        activeNavigationRef.current !== navigationEpoch ||
        navigationEpochRef.current !== navigationEpoch
      ) {
        return;
      }
      await routerRef.current.navigate({
        to: "/organizations/$organizationId/dashboard",
        params: { organizationId: operation.organizationId },
      });
      if (isCurrentOperation(operation) && activeNavigationRef.current === navigationEpoch) {
        setSubmissionError(null);
      }
    } catch {
      if (isCurrentOperation(operation) && activeNavigationRef.current === navigationEpoch) {
        setSubmissionError(
          "Organization created, but we could not open its dashboard. Try opening it again.",
        );
      }
    } finally {
      if (isCurrentOperation(operation) && activeNavigationRef.current === navigationEpoch) {
        activeNavigationRef.current = null;
        setIsRecoveringNavigation(false);
      }
    }
  };

  const settleCreateOperation = (operation: CreateOperation) => {
    if (!isCurrentOperation(operation) || !operation.result) return;

    if (operation.result.kind === "uncertain") {
      operationRef.current = null;
      uncertainCreateRef.current = {
        actorId: operation.actorId,
        fingerprint: operation.fingerprint,
        organizationId: operation.organizationId,
      };
      setSubmissionError(
        "We could not confirm whether the organization was created. Retry the same draft, or check your organizations before starting a new draft.",
      );
      return;
    }

    operation.organizationId = operation.result.organizationId;
    operation.state = "committed";
    uncertainCreateRef.current = null;
    setCreatedOrganizationId(operation.organizationId);
    void navigateToCreatedOrganization(operation);
  };

  const onSubmit = async (values: OrganizationFormOutput) => {
    if (operationRef.current) return;
    if (!actorId) {
      setSubmissionError("Your session changed. Sign in again before creating an organization.");
      return;
    }

    setSubmissionError(null);
    const fingerprint = JSON.stringify(values);
    const uncertainCreate = uncertainCreateRef.current;
    if (uncertainCreate?.actorId === actorId && uncertainCreate.fingerprint !== fingerprint) {
      setSubmissionError(
        "We could not confirm the previous creation. Check your organizations before starting a new draft.",
      );
      return;
    }
    const operation: CreateOperation = {
      actorId,
      fingerprint,
      organizationId:
        uncertainCreate?.actorId === actorId ? uncertainCreate.organizationId : crypto.randomUUID(),
      result: null,
      state: "creating",
    };
    operationRef.current = operation;
    try {
      const created = await createCoachingOrganization({
        data: { organizationId: operation.organizationId, ...values },
      });
      if (!mountedRef.current || operationRef.current !== operation) return;
      operation.result = { kind: "created", organizationId: created.organizationId };
      settleCreateOperation(operation);
    } catch {
      if (!mountedRef.current || operationRef.current !== operation) return;
      operation.result = { kind: "uncertain" };
      settleCreateOperation(operation);
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
        {createdOrganizationId ? (
          <>
            <p aria-live="polite" className="text-sm text-emerald-300" role="status">
              {isRecoveringNavigation
                ? "Organization created. Opening its dashboard…"
                : "Organization created. Its dashboard is ready to open."}
            </p>
            <Button
              disabled={isRecoveringNavigation}
              onClick={() => {
                const operation = operationRef.current;
                if (operation?.state === "committed") void navigateToCreatedOrganization(operation);
              }}
              type="button"
            >
              {isRecoveringNavigation ? "Opening organization…" : "Open organization dashboard"}
            </Button>
          </>
        ) : (
          <Button
            disabled={form.formState.isSubmitting || operationRef.current !== null}
            type="submit"
          >
            {form.formState.isSubmitting ? "Creating organization…" : "Create organization"}
          </Button>
        )}
        {uncertainCreateRef.current || createdOrganizationId ? (
          <Button
            disabled={isRecoveringNavigation || activeNavigationRef.current !== null}
            onClick={() => {
              if (activeNavigationRef.current !== null) return;
              navigationEpochRef.current += 1;
              uncertainCreateRef.current = null;
              operationRef.current = null;
              setCreatedOrganizationId(null);
              setSubmissionError(null);
            }}
            type="button"
            variant="outline"
          >
            Create a new organization from this draft
          </Button>
        ) : null}
      </form>
    </Form>
  );
}
