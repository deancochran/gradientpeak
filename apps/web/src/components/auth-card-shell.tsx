import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";

type AuthCardShellProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function AuthCardShell({ title, description, children }: AuthCardShellProps) {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
