import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";

import { OrganizationCreateForm } from "../../../components/coaching/organization-create-form";
import { OrganizationSelectorFrame } from "../../../components/coaching/organization-selector";

export const Route = createFileRoute("/_coaching/organizations/new")({
  component: CreateOrganizationPage,
});

function CreateOrganizationPage() {
  return (
    <OrganizationSelectorFrame heading="Create a coaching organization">
      <Card className="max-w-xl border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Start an organization</CardTitle>
          <CardDescription className="text-slate-400">
            You will be its root owner. Invitations and athlete enrollment are managed separately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <OrganizationCreateForm />
          <Button asChild variant="outline" className="border-slate-700 text-slate-100">
            <Link to="/organizations">Cancel</Link>
          </Button>
        </CardContent>
      </Card>
    </OrganizationSelectorFrame>
  );
}
