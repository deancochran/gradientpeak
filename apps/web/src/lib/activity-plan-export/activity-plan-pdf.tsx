import type { ActivityPlanPrintModel } from "@repo/core/activity-plan";

function safeFilename(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${normalized || "activity-plan"}.pdf`;
}

async function createPdfBlob(model: ActivityPlanPrintModel): Promise<Blob> {
  const [{ pdf }, { ActivityPlanPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./activity-plan-pdf-document"),
  ]);
  return pdf(<ActivityPlanPdfDocument model={model} />).toBlob();
}

export async function downloadActivityPlanPdf(model: ActivityPlanPrintModel): Promise<void> {
  const blob = await createPdfBlob(model);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename(model.title);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function openActivityPlanPdfForPrint(model: ActivityPlanPrintModel): Promise<void> {
  const popup = window.open("", "_blank");
  const blob = await createPdfBlob(model);
  const url = URL.createObjectURL(blob);
  if (popup) popup.location.href = url;
  else window.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function shareActivityPlanPdf(model: ActivityPlanPrintModel): Promise<boolean> {
  const blob = await createPdfBlob(model);
  const file = new File([blob], safeFilename(model.title), { type: "application/pdf" });
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) return false;
  await navigator.share({ files: [file], title: model.title });
  return true;
}
