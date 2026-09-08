import type { ActivityPlanPrintModel } from "@repo/core/activity-plan";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pageDimensions(model: ActivityPlanPrintModel) {
  if (model.format === "swim-deck-card") return { height: 432, width: 288 };
  if (model.format === "bike-cue-strip") return { height: 504, width: 162 };
  return { height: 842, width: 595 };
}

export function renderActivityPlanPrintHtml(model: ActivityPlanPrintModel): string {
  const { height, width } = pageDimensions(model);
  const compact = model.format !== "full-page";
  const sections = model.sections
    .map(
      (section) => `
        <section>
          <h2>${escapeHtml(section.name)}</h2>
          ${section.notes ? `<small>${escapeHtml(section.notes)}</small>` : ""}
          ${section.groups
            .map(
              (group) => `
                <div class="group ${group.repetitions > 1 ? "repeated" : ""}">
                  ${group.name || group.repetitions > 1 ? `<h3>${escapeHtml([group.name, group.repetitions > 1 ? `Repeat ${group.repetitions}×` : null].filter(Boolean).join(" · "))}</h3>` : ""}
                  ${group.notes ? `<small>${escapeHtml(group.notes)}</small>` : ""}
                  ${group.steps
                    .map(
                      (step) => `
                        <div class="step">
                          <strong>${escapeHtml(step.name)}</strong>
                          <div>${escapeHtml(step.instruction)}</div>
                          ${step.description ? `<small>${escapeHtml(step.description)}</small>` : ""}
                          ${step.notes ? `<small>${escapeHtml(step.notes)}</small>` : ""}
                        </div>`,
                    )
                    .join("")}
                </div>`,
            )
            .join("")}
        </section>`,
    )
    .join("");
  const reference = model.intensityReferences.length
    ? `<aside><b>Intensity reference</b><div>${model.intensityReferences.map(escapeHtml).join(" · ")}</div></aside>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@page { size: ${width}px ${height}px; margin: 0; }
* { box-sizing: border-box; }
body { color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: ${compact ? 14 : 32}px; }
header { border-bottom: 1px solid #d1d5db; margin-bottom: ${compact ? 9 : 14}px; padding-bottom: 9px; }
.brand { color: #6b7280; font-size: 8px; letter-spacing: 1.2px; margin-bottom: 4px; }
h1 { font-size: ${compact ? 15 : 22}px; line-height: 1.1; margin: 0; }
.meta { color: #4b5563; font-size: ${compact ? 8 : 10}px; margin-top: 5px; }
.description, small { color: #6b7280; display: block; font-size: 8px; line-height: 1.35; margin-top: 2px; }
section { border-bottom: 1px solid #e5e7eb; break-inside: avoid; margin-bottom: ${compact ? 7 : 12}px; padding-bottom: ${compact ? 5 : 9}px; }
h2 { font-size: ${compact ? 10 : 14}px; margin: 0 0 5px; text-transform: uppercase; }
h3 { font-size: ${compact ? 8 : 10}px; font-weight: 400; margin: 0 0 4px; }
.group { margin-bottom: ${compact ? 5 : 8}px; }
.repeated { border-left: 2px solid #9ca3af; padding-left: ${compact ? 5 : 8}px; }
.step { font-size: ${compact ? 8 : 10}px; line-height: 1.3; margin-bottom: ${compact ? 4 : 7}px; }
.step strong { display: block; font-size: ${compact ? 9 : 12}px; }
aside { border: 1px solid #d1d5db; font-size: ${compact ? 7 : 9}px; line-height: 1.4; margin-top: 6px; padding: ${compact ? 5 : 8}px; }
aside b { display: block; margin-bottom: 3px; text-transform: uppercase; }
</style></head><body>
<header><div class="brand">GRADIENTPEAK</div><h1>${escapeHtml(model.title)}</h1>
<div class="meta">${escapeHtml([model.activityCategory.toUpperCase(), ...model.totals].join(" · "))}</div>
${!compact && model.description ? `<div class="description">${escapeHtml(model.description)}</div>` : ""}</header>
${sections}${reference}${!compact && model.notes ? `<p class="description">${escapeHtml(model.notes)}</p>` : ""}
</body></html>`;
}

async function createActivityPlanPdf(model: ActivityPlanPrintModel) {
  const Print = await import("expo-print");
  const dimensions = pageDimensions(model);
  return Print.printToFileAsync({
    height: dimensions.height,
    html: renderActivityPlanPrintHtml(model),
    width: dimensions.width,
  });
}

export async function shareActivityPlanPdf(model: ActivityPlanPrintModel): Promise<void> {
  const Sharing = await import("expo-sharing");
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing is unavailable on this device.");
  const file = await createActivityPlanPdf(model);
  await Sharing.shareAsync(file.uri, {
    dialogTitle: model.title,
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
  });
}

export async function printActivityPlanPdf(model: ActivityPlanPrintModel): Promise<void> {
  const Print = await import("expo-print");
  const file = await createActivityPlanPdf(model);
  await Print.printAsync({ uri: file.uri });
}
