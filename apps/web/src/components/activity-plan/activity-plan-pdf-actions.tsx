import {
  type ActivityPlanPrintFormat,
  type ActivityPlanPrintModel,
  getActivityPlanPrintFormatLabel,
  getActivityPlanPrintFormats,
} from "@repo/core/activity-plan";
import { Button } from "@repo/ui/components/button";
import { Download, Printer, Share2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  downloadActivityPlanPdf,
  openActivityPlanPdfForPrint,
  shareActivityPlanPdf,
} from "../../lib/activity-plan-export/activity-plan-pdf";

export function ActivityPlanPdfActions({ model }: { model: ActivityPlanPrintModel }) {
  const [format, setFormat] = useState<ActivityPlanPrintFormat>(model.format);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState(false);
  const formats = getActivityPlanPrintFormats(model.activityCategory);
  const selectedFormat = formats.includes(format) ? format : model.format;
  const selectedModel = { ...model, format: selectedFormat };

  const run = async (operation: () => Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError(false);
    try {
      await operation();
    } catch {
      setError(true);
      toast.error("The PDF could not be created");
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <label className="sr-only" htmlFor="activity-plan-pdf-format">
        PDF format
      </label>
      <select
        disabled={busy}
        className="h-9 rounded-md border bg-background px-3 text-sm"
        id="activity-plan-pdf-format"
        onChange={(event) => setFormat(event.target.value as ActivityPlanPrintFormat)}
        value={selectedFormat}
      >
        {formats.map((candidate) => (
          <option key={candidate} value={candidate}>
            {getActivityPlanPrintFormatLabel(candidate)}
          </option>
        ))}
      </select>
      <Button
        disabled={busy}
        onClick={() => void run(() => downloadActivityPlanPdf(selectedModel))}
        type="button"
        variant="outline"
      >
        <Download className="mr-2 h-4 w-4" /> Download PDF
      </Button>
      <Button
        disabled={busy}
        onClick={() => void run(() => openActivityPlanPdfForPrint(selectedModel))}
        type="button"
        variant="outline"
      >
        <Printer className="mr-2 h-4 w-4" /> Open / Print
      </Button>
      <Button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const shared = await shareActivityPlanPdf(selectedModel);
            if (!shared) {
              await downloadActivityPlanPdf(selectedModel);
              toast.info("Sharing is unavailable in this browser, so the PDF was downloaded");
            }
          })
        }
        type="button"
        variant="outline"
      >
        <Share2 className="mr-2 h-4 w-4" /> Share PDF
      </Button>
      {busy ? <p role="status">Preparing PDF...</p> : null}
      {error ? (
        <p role="alert">The PDF could not be created. Your format is kept; try again.</p>
      ) : null}
    </div>
  );
}
