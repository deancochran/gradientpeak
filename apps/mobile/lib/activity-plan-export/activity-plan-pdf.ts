import {
  type ActivityPlanPrintModel,
  getActivityPlanBikeCueLength,
} from "@repo/core/activity-plan";

const GRADIENTPEAK_APP_URL = "https://gradientpeak.app";
const GRADIENTPEAK_MARK_PATH =
  "M128 128 H896 V896 H128 Z M128 286 H748 V896 H128 Z M428 616 m-280,0 a280,280 0 1,0 560,0 a280,280 0 1,0 -560,0";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pageDimensions(model: ActivityPlanPrintModel) {
  if (model.format === "swim-deck-card") return { height: 216, width: 360 };
  if (model.format === "bike-cue-strip") {
    return {
      height: getActivityPlanBikeCueLength(model) === "short" ? 360 : 504,
      width: 162,
    };
  }
  return { height: 842, width: 595 };
}

export function renderActivityPlanPrintHtml(model: ActivityPlanPrintModel): string {
  const { height, width } = pageDimensions(model);
  const compact = model.format !== "full-page";
  const swimDeckCard = model.format === "swim-deck-card";
  const bikeCueStrip = model.format === "bike-cue-strip";
  const profileHeight = swimDeckCard
    ? 28
    : compact
      ? 38
      : model.intensityProfile.length === 1
        ? 42
        : 68;
  const sections = model.sections
    .map(
      (section) => `
        <section>
          ${section.name ? `<h2>${escapeHtml(section.name)}</h2>` : ""}
          ${!bikeCueStrip && section.notes ? `<small>${escapeHtml(section.notes)}</small>` : ""}
          ${section.groups
            .map(
              (group) => `
                <div class="group ${group.repetitions > 1 ? "repeated" : ""}">
                  ${group.name || group.repetitions > 1 ? `<h3>${escapeHtml([group.name, group.repetitions > 1 ? `Repeat ${group.repetitions}×` : null].filter(Boolean).join(" · "))}</h3>` : ""}
                  ${!bikeCueStrip && group.notes ? `<small>${escapeHtml(group.notes)}</small>` : ""}
                  ${group.steps
                    .map(
                      (step) => `
                        <div class="step">
                           ${step.name ? `<strong>${escapeHtml(step.name)}</strong>` : swimDeckCard ? "<strong></strong>" : ""}
                          <div>${escapeHtml(step.instruction)}</div>
                           ${!compact && step.description ? `<small>${escapeHtml(step.description)}</small>` : ""}
                           ${!bikeCueStrip && step.notes ? `<small>${escapeHtml(step.notes)}</small>` : ""}
                        </div>`,
                    )
                    .join("")}
                </div>`,
            )
            .join("")}
        </section>`,
    )
    .join("");
  const intensityProfile = model.intensityProfile.length
    ? `<figure class="profile" aria-label="Authored intensity profile">${model.intensityProfile.length === 1 ? `<figcaption>${escapeHtml(`${model.intensityProfile[0]?.label} · ${model.intensityProfile[0]?.duration}`)}</figcaption>` : ""}<div class="profile-bars ${model.intensityProfile.length === 1 ? "single-profile" : ""}"${model.intensityProfile.length === 1 ? ` style="--profile-color:${model.intensityProfile[0]?.color};--profile-height:${model.intensityProfile[0]?.heightPercent}%"` : ""}>${model.intensityProfile
        .map(
          (bar) =>
            `<i title="${escapeHtml(`${bar.label} · ${bar.duration}`)}" style="background-color:${bar.color};border-color:${bar.color};flex-grow:${bar.weight};height:${bar.heightPercent}%"></i>`,
        )
        .join("")}</div></figure>`
    : "";
  const brand = `<a class="brand-link" href="${GRADIENTPEAK_APP_URL}"><svg aria-hidden="true" viewBox="0 0 1024 1024"><path d="${GRADIENTPEAK_MARK_PATH}" fill="#111827" fill-rule="evenodd"></path></svg><span>GRADIENTPEAK</span></a>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@page { size: ${width}px ${height}px; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: ${swimDeckCard ? "6px 10px 8px" : compact ? "14px" : "32px"}; }
header { margin-bottom: ${compact ? 9 : 14}px; }
.brand-link { align-items: center; color: #6b7280; display: inline-flex; font-size: 8px; gap: 3px; letter-spacing: 1.2px; margin-bottom: 4px; text-decoration: none; }
.brand-link svg { height: 12px; width: 12px; }
h1 { font-size: ${compact ? 15 : 22}px; line-height: 1.1; margin: 0; }
.meta { color: #4b5563; font-size: ${compact ? 8 : 10}px; margin-top: 5px; }
.description, small { color: #6b7280; display: block; font-size: 8px; line-height: 1.35; margin-top: 2px; }
.profile { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: ${compact ? 4 : 6}px; margin: 0 0 ${compact ? 8 : 14}px; padding: ${compact ? 4 : 7}px; }
.profile figcaption { color: #64748b; font-size: 7px; font-weight: 700; letter-spacing: .8px; margin-bottom: 4px; text-transform: uppercase; }
.profile figcaption { text-align: right; }
.profile-bars { align-items: flex-end; background-color: #fff; background-image: linear-gradient(to top, #e2e8f0 1px, transparent 1px); background-size: 100% 25%; display: flex; gap: 2px; height: ${profileHeight}px; overflow: hidden; }
.profile-bars i { border-style: solid; border-width: 1px; border-radius: 2px 2px 1px 1px; display: block; flex-basis: 0; min-width: 1px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.single-profile { position: relative; }
.single-profile i { border: 0; opacity: .18; width: 100%; }
.single-profile::after { border-top: 2px solid var(--profile-color); bottom: var(--profile-height); content: ""; left: 0; position: absolute; right: 0; }
section { border-bottom: 1px solid #e5e7eb; break-inside: avoid; margin-bottom: ${compact ? 7 : 12}px; padding-bottom: ${compact ? 5 : 9}px; }
h2 { font-size: ${compact ? 10 : 14}px; margin: 0 0 5px; text-transform: uppercase; }
h3 { font-size: ${compact ? 8 : 10}px; font-weight: 400; margin: 0 0 4px; }
.group { margin-bottom: ${compact ? 5 : 8}px; }
.repeated { border-left: 2px solid #9ca3af; padding-left: ${compact ? 5 : 8}px; }
.step { font-size: ${compact ? 8 : 10}px; line-height: 1.3; margin-bottom: ${compact ? 4 : 7}px; }
.step strong { display: block; font-size: ${compact ? 9 : 12}px; }
.swim-deck header { margin-bottom: 3px; }
.swim-deck .brand-link { font-size: 6px; gap: 2px; margin-bottom: 2px; }
.swim-deck .brand-link svg { height: 8px; width: 8px; }
.swim-deck h1 { font-size: 10px; }
.swim-deck .meta { font-size: 6px; margin-top: 1px; }
.swim-deck .profile { margin-bottom: 3px; padding: 2px; }
.swim-deck .profile figcaption { font-size: 5.5px; margin-bottom: 1px; }
.swim-deck main { width: 100%; }
.swim-deck section { border: 0; break-inside: auto; margin: 0; padding: 0; }
.swim-deck .group { break-inside: auto; margin-bottom: 2px; }
.swim-deck .repeated { padding-left: 4px; }
.swim-deck h3 { font-size: 7px; margin-bottom: 1px; }
.swim-deck .step { break-inside: avoid; display: grid; font-size: 7px; grid-template-columns: 25% 31% 44%; line-height: 1.1; margin-bottom: 3px; }
.swim-deck .step strong { font-size: 8px; padding-right: 3px; }
.swim-deck .step > div { padding-right: 3px; }
.swim-deck .step small { font-size: 6.5px; grid-column: 3; line-height: 1.1; margin-top: 0; }
.swim-deck section > small, .swim-deck .group > small { font-size: 6.5px; line-height: 1.1; margin-top: 1px; }
</style></head><body class="${swimDeckCard ? "swim-deck" : ""}">
<header>${brand}<h1>${escapeHtml(model.title)}</h1>
<div class="meta">${escapeHtml([model.activityCategory.toUpperCase(), ...model.totals].join(" · "))}</div>
${!compact && model.description ? `<div class="description">${escapeHtml(model.description)}</div>` : ""}</header>
${intensityProfile}<main>${sections}</main>${!bikeCueStrip && model.notes ? `<p class="description">${escapeHtml(model.notes)}</p>` : ""}
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
