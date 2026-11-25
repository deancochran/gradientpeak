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
      <Card className="max-w-xl border-border bg-card text-foreground">
        <CardHeader>
          <CardTitle>Start an organization</CardTitle>
          <CardDescription className="text-muted-foreground">
            You will be its root owner. Invitations and athlete enrollment are managed separately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <OrganizationCreateForm />
          <Button
            asChild
            variant="outline"
            className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
          >
            <Link to="/organizations">Cancel</Link>
          </Button>
        </CardContent>
      </Card>
    </OrganizationSelectorFrame>
  );
}
