import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { RouteUploadForm } from "../../../components/protected/route-upload-form";
import { readTextFile } from "../../../lib/activity-route-upload";
import { api } from "../../../lib/api/client";

export const Route = createFileRoute("/_protected/routes/upload")({
  component: RouteUploadPage,
});

function RouteUploadPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const uploadMutation = api.routes.upload.useMutation({
    onSuccess: async (route) => {
      await utils.routes.invalidate();
      toast.success("Route uploaded");
      void navigate({ to: "/routes/$routeId", params: { routeId: route.id } });
    },
  });

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Upload route</h1>
        <p className="text-sm text-muted-foreground">
          Import one GPX or TCX route into your personal route library for reuse in planning and
          route preview flows.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>GPX or TCX route file</CardTitle>
        </CardHeader>
        <CardContent>
          <RouteUploadForm
            onCancel={() => void navigate({ to: "/routes" })}
            onSubmit={async (values, selectedFile) => {
              if (!selectedFile.file) {
                throw new Error("Choose a GPX or TCX file to upload.");
              }

              const fileContent = await readTextFile(selectedFile.file);
              await uploadMutation.mutateAsync({
                description: values.description.trim() || undefined,
                fileContent,
                fileName: selectedFile.name,
                name: values.name.trim(),
              });
            }}
            onSubmitError={() => toast.error("Route upload failed")}
            pending={uploadMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
