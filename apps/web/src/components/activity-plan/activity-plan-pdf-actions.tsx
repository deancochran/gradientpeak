import {
  type ActivityPlanPrintFormat,
  type ActivityPlanPrintModel,
  getActivityPlanPrintFormatLabel,
  getActivityPlanPrintFormats,
} from "@repo/core/activity-plan";
import { Button } from "@repo/ui/components/button";
import { Download, Printer, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  downloadActivityPlanPdf,
  openActivityPlanPdfForPrint,
  shareActivityPlanPdf,
} from "../../lib/activity-plan-export/activity-plan-pdf";

export function ActivityPlanPdfActions({ model }: { model: ActivityPlanPrintModel }) {
  const [format, setFormat] = useState<ActivityPlanPrintFormat>(model.format);
  const [busy, setBusy] = useState(false);
  const selectedModel = { ...model, format };
  const formats = getActivityPlanPrintFormats(model.activityCategory);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    try {
      await operation();
    } catch {
      toast.error("The PDF could not be created");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <label className="sr-only" htmlFor="activity-plan-pdf-format">
        PDF format
      </label>
      <select
        className="h-9 rounded-md border bg-background px-3 text-sm"
        id="activity-plan-pdf-format"
        onChange={(event) => setFormat(event.target.value as ActivityPlanPrintFormat)}
        value={format}
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
    </div>
  );
}
