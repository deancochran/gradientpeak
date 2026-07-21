import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { GroupForm } from "../../../components/groups/group-form";
import { api } from "../../../lib/api/client";

export const Route = createFileRoute("/_protected/groups/new")({ component: CreateGroupPage });

function CreateGroupPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const createMutation = api.groups.create.useMutation();
  return (
    <main className="container mx-auto max-w-3xl space-y-6 py-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Create group</h1>
        <p className="text-sm text-muted-foreground">
          Set the group identity, visibility, and joining policy.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Group details</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupForm
            isSubmitting={createMutation.isPending}
            onCancel={() => void navigate({ to: "/groups" })}
            onSubmit={async (value) => {
              const result = await createMutation.mutateAsync(value);
              await utils.groups.invalidate();
              toast.success("Group created");
              void navigate({ to: "/groups/$groupId", params: { groupId: result.group.id } });
            }}
            submitLabel="Create group"
          />
        </CardContent>
      </Card>
    </main>
  );
}
