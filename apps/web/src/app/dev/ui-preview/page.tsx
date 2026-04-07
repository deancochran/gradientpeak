import { UiPreviewSurface } from "@repo/ui/testing/ui-preview";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "UI Preview",
  description: "Development-only UI preview surface.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UiPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <UiPreviewSurface />;
}
