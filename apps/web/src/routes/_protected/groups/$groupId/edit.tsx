import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { GroupForm } from "../../../../components/groups/group-form";
import { QueryState, type WebGroupSummary } from "../../../../components/groups/group-ui";
import { api } from "../../../../lib/api/client";

export const Route = createFileRoute("/_protected/groups/$groupId/edit")({
  component: EditGroupPage,
});

function EditGroupPage() {
  const { groupId } = Route.useParams();
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const detail = api.groups.detail.useQuery({ groupId });
  const updateMutation = api.groups.update.useMutation();
  return (
    <main className="container mx-auto max-w-3xl space-y-6 py-4">
      <h1 className="text-3xl font-semibold tracking-tight">Edit group</h1>
      <QueryState
        error={detail.error}
        isLoading={detail.isLoading}
        onRetry={() => void detail.refetch()}
      >
        {detail.data?.viewer.canEditGroup ? (
          <Card>
            <CardHeader>
              <CardTitle>Group details</CardTitle>
            </CardHeader>
            <CardContent>
              <GroupForm
                group={detail.data.group as WebGroupSummary}
                isSubmitting={updateMutation.isPending}
                onCancel={() => void navigate({ to: "/groups/$groupId", params: { groupId } })}
                onSubmit={async (value) => {
                  await updateMutation.mutateAsync({ groupId, ...value });
                  await utils.groups.invalidate();
                  toast.success("Group updated");
                  void navigate({ to: "/groups/$groupId", params: { groupId } });
                }}
                submitLabel="Save changes"
              />
            </CardContent>
          </Card>
        ) : (
          <p role="alert">You do not have permission to edit this group.</p>
        )}
      </QueryState>
    </main>
  );
}
