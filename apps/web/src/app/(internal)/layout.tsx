import { AuthGuard } from "@/components/auth-guard";

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      {children}
    </AuthGuard>
  );
}
