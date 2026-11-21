import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  createOrganizationGroup,
  loadOrganizationGroups,
} from "../../../lib/coaching/organization-groups-server-functions";

const PAGE_SIZE = 20;
const groupDraftSchema = z.object({
  name: z.string().trim().min(1, "Enter a group name.").max(120),
  description: z.string().trim().max(2000).nullable(),
});
type GroupDraft = z.input<typeof groupDraftSchema>;
type Group = { id: string; name: string; description: string | null; createdAt: Date };
type Page = { items: Group[]; nextCursor: string | null; hasMore: boolean };
type ListResult = ({ status: "granted" } & Page) | { status: "forbidden" };

export function OrganizationGroupsPending() {
  return (
    <p aria-label="Loading organization groups" role="status" className="text-sm text-slate-400">
      Loading organization groups…
    </p>
  );
}

export function OrganizationGroupsError() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } catch {
      // Keep the failed read visible until an authoritative reread succeeds.
    } finally {
      setRetrying(false);
    }
  }
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-red-300">
        Organization groups could not be loaded. Retry the current organization group read.
      </p>
      <Button disabled={retrying} onClick={() => void retry()} type="button">
        {retrying ? "Retrying organization groups…" : "Retry organization groups"}
      </Button>
    </div>
  );
}

export function OrganizationGroupList({
  organizationId,
  initialPage,
}: {
  organizationId: string;
  initialPage: Page;
}) {
  const listGroups = useServerFn(loadOrganizationGroups);
  const createGroup = useServerFn(createOrganizationGroup);
  const [page, setPage] = useState(initialPage);
  const [accessLost, setAccessLost] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  const tenant = useRef(organizationId);
  const appliedTenant = useRef(organizationId);
  const context = useRef(0);
  const readVersion = useRef(0);
  const createOperation = useRef<{ fingerprint: string; groupId: string } | null>(null);
  const createPending = useRef(false);
  const committedGroups = useRef(new Map<string, Group>());
  const form = useForm<GroupDraft>({
    resolver: zodResolver(groupDraftSchema),
    defaultValues: { name: "", description: null },
  });
  if (tenant.current !== organizationId) {
    tenant.current = organizationId;
    context.current += 1;
    readVersion.current += 1;
  }
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  useEffect(() => {
    if (tenant.current !== organizationId) return;
    mounted.current = true;
    readVersion.current += 1;
    const tenantChanged = appliedTenant.current !== organizationId;
    if (tenantChanged) appliedTenant.current = organizationId;
    if (tenantChanged) {
      createOperation.current = null;
      createPending.current = false;
      committedGroups.current.clear();
      form.reset();
    }
    setPage({
      ...initialPage,
      items: [
        ...committedGroups.current.values(),
        ...initialPage.items.filter((item) => !committedGroups.current.has(item.id)),
      ],
    });
    setReadError(null);
    setLoading(false);
    setAccessLost(false);
    setWriteError(null);
    setNotice(null);
  }, [form, initialPage, organizationId]);
  const current = (operationContext: number, request?: number) =>
    mounted.current &&
    tenant.current === organizationId &&
    context.current === operationContext &&
    (request === undefined || readVersion.current === request);
  async function load(cursor: string | null) {
    const operationContext = context.current;
    const request = ++readVersion.current;
    setReadError(null);
    setLoading(true);
    try {
      const result = (await listGroups({
        data: { organizationId, limit: PAGE_SIZE, cursor },
      })) as ListResult;
      if (!current(operationContext, request)) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        return;
      }
      const authoritative = cursor === null ? result.items : [...page.items, ...result.items];
      // A post-commit refresh may lag the write. Merge acknowledged creations until the server list includes them.
      const items = [
        ...committedGroups.current.values(),
        ...authoritative.filter((item) => !committedGroups.current.has(item.id)),
      ];
      setPage({ ...result, items });
    } catch {
      if (current(operationContext, request))
        setReadError("Groups could not be refreshed. The current list is unchanged.");
    } finally {
      if (current(operationContext, request)) setLoading(false);
    }
  }
  async function submit(values: GroupDraft) {
    if (createPending.current) return;
    const operationContext = context.current;
    const fingerprint = JSON.stringify(values);
    const prior = createOperation.current;
    // Retain the operation ID and payload after an uncertain response: retrying this exact draft is idempotent.
    if (prior && prior.fingerprint !== fingerprint) {
      setWriteError(
        "We could not confirm the previous group creation. Retry the same draft before creating another group.",
      );
      return;
    }
    const operation = prior ?? { fingerprint, groupId: crypto.randomUUID() };
    createOperation.current = operation;
    createPending.current = true;
    setWriteError(null);
    setNotice(null);
    try {
      const result = await createGroup({
        data: {
          organizationId,
          groupId: operation.groupId,
          name: values.name.trim(),
          description: values.description?.trim() || null,
        },
      });
      if (!current(operationContext)) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        return;
      }
      const created: Group = {
        id: result.id,
        name: values.name.trim(),
        description: values.description?.trim() || null,
        createdAt: new Date(),
      };
      committedGroups.current.set(created.id, created);
      setPage((old) =>
        old.items.some((group) => group.id === created.id)
          ? old
          : { ...old, items: [created, ...old.items] },
      );
      createOperation.current = null;
      form.reset();
      setNotice(`${created.name} was created.`);
      // Committed success is intentionally distinct from a later list refresh failure.
      void load(null);
    } catch {
      if (current(operationContext))
        setWriteError(
          "We could not confirm whether the group was created. Retry the same draft to safely check its result.",
        );
    } finally {
      if (current(operationContext)) createPending.current = false;
    }
  }
  if (accessLost) return <AccessLost />;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
          Administration
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Organization groups
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Groups are separate from community groups. Membership and coach assignment are managed
          separately.
        </p>
      </header>
      {notice ? (
        <p role="status" className="text-sm text-emerald-300">
          {notice}
        </p>
      ) : null}
      {readError || writeError ? (
        <p role="alert" className="text-sm text-destructive">
          {readError ?? writeError}
        </p>
      ) : null}
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Create a group</CardTitle>
          <CardDescription className="text-slate-400">
            A name is required. Description is optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Description <span className="text-slate-400">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        onChange={(event) => field.onChange(event.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button disabled={form.formState.isSubmitting || createPending.current} type="submit">
                {createPending.current ? "Creating group…" : "Create group"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Active groups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {page.items.length === 0 ? (
            <p className="text-sm text-slate-400">No active organization groups yet.</p>
          ) : (
            <ul aria-label="Organization groups" className="space-y-3">
              {page.items.map((group) => (
                <li key={group.id}>
                  <Link
                    className="block rounded-md border border-slate-800 p-4 hover:border-cyan-700 hover:bg-slate-800"
                    to="/organizations/$organizationId/groups/$groupId"
                    params={{ organizationId, groupId: group.id }}
                  >
                    <span className="block font-medium">{group.name}</span>
                    {group.description ? (
                      <span className="mt-1 block text-sm text-slate-400">{group.description}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {page.hasMore ? (
            <Button
              disabled={loading || createPending.current}
              onClick={() => load(page.nextCursor)}
              type="button"
              variant="outline"
            >
              {loading ? "Loading groups…" : "Load more groups"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
function AccessLost() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-white">Coaching access required</h1>
      <p className="mt-2 text-sm text-slate-400">
        Your access changed. Organization groups are no longer shown.
      </p>
    </div>
  );
}
