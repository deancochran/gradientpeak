import { ExternalAuthGuard } from "@/components/auth/external-auth-guard";

export default function ExternalLayout({ children }: { children: React.ReactNode }) {
  return <ExternalAuthGuard>{children}</ExternalAuthGuard>;
}
