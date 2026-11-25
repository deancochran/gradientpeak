import {
  Circle,
  Document,
  Image,
  Link,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { isReferenceAssessmentTemplateId, REFERENCE_ASSESSMENT_TEMPLATE_IDS } from "@repo/core";
import type { ActivityPlanPrintGroup, ActivityPlanPrintModel } from "@repo/core/activity-plan";
import React from "react";
import type {
  ActivityPlanCatalogFragment,
  ActivityPlanCatalogTrainingPlan,
  ActivityPlanCatalogTrainingWeek,
} from "./activity-plan-catalog";

// The standalone tsx exporter uses the classic JSX transform.
void React;

import {
  formatActivityPlanCatalogDuration,
  formatActivityPlanCatalogInstruction,
  formatActivityPlanCatalogTotal,
  getActivityPlanCatalogTimedProfileWidths,
} from "./activity-plan-catalog";

const NEUTRAL_STEP_COLOR = "#94a3b8";
export type ActivityPlanDistanceCatalogGeometry = "landscape" | "portrait";
export type ActivityPlanDistanceCatalogPrescriptionPlacement = "inline" | "below";
export type ActivityPlanDistanceCatalogPrescriptionPlacementDetail = {
  placement: ActivityPlanDistanceCatalogPrescriptionPlacement;
  /** Exact 14 pt rendered target width, supplied by the exporter font measurement. */
  prescriptionWidth: number;
};
export type ActivityPlanDistanceCatalogPrescriptionPlacementByStepId = ReadonlyMap<
  string,
  ActivityPlanDistanceCatalogPrescriptionPlacementDetail
>;

export const DISTANCE_CATALOG_INLINE_GAP = 8;
/** Shared with the exporter so measured placement always matches rendered step type. */
export const DISTANCE_CATALOG_STEP_FONT_SIZE = 14;
/** Exact A5 trim, in points. Bleed is added only to the upload files. */
export const DISTANCE_CATALOG_A5_TRIM: [number, number] = [419.527559, 595.275591];

function catalogPageSize(geometry: ActivityPlanDistanceCatalogGeometry) {
  return geometry === "portrait" ? DISTANCE_CATALOG_A5_TRIM : "LETTER";
}

/** Step IDs are authored locally, so a placement key must include its activityPlan. */
export function getDistanceCatalogPrescriptionPlacementKey(
  activityPlanId: string,
  stepId: string,
): string {
  return `${activityPlanId}:${stepId}`;
}

/**
 * Widths are supplied by the Node exporter's registered-font measurement service.
 * A target is inline only when both actual shaped runs and the readable gap fit the
 * narrowest physical row. This intentionally does not reserve a 60/40 split.
 */
export function getDistanceCatalogPrescriptionPlacement(
  nameWidth: number,
  prescriptionWidth: number,
  rowWidth: number,
  readableGap = DISTANCE_CATALOG_INLINE_GAP,
): ActivityPlanDistanceCatalogPrescriptionPlacement {
  if (prescriptionWidth > rowWidth)
    throw new Error(
      `Prescription is wider than its full step width (${prescriptionWidth.toFixed(2)} > ${rowWidth.toFixed(2)} pt)`,
    );
  return nameWidth + readableGap + prescriptionWidth <= rowWidth ? "inline" : "below";
}

// Portrait Letter has enough vertical room for twenty readable 18 pt entries,
// including the occasional wrapped title and section heading. This keeps the
// contents compact without reducing type size or artificially distributing rows.
const COMPLETE_BOOK_CONTENTS_ENTRIES_PER_PAGE = {
  landscape: 25,
  // This is deliberately below the measured A5 page capacity: category headings
  // and wrapped authored titles still have room without a renderer-made spill.
  portrait: 20,
} as const;
// The first portrait contents page carries the guide and the opening chapter
// labels. Reserve room for those headings, then use the proven 20-row capacity
// for subsequent pages.
const COMPLETE_BOOK_PORTRAIT_FIRST_CONTENTS_PAGE_ENTRIES = 15;
const COMPLETE_BOOK_PORTRAIT_FOLLOWING_CONTENTS_PAGE_ENTRIES = 19;

type CompleteBookGuidePageDefinition =
  | {
      kind: "guide";
      sections: readonly { body: string; heading: string }[];
      title: string;
    }
  | { kind: "glossary" }
  | {
      kind: "conversion";
      percentages: readonly number[];
      reference: ConversionReference;
    };

const COMPLETE_BOOK_GUIDE_PAGES: readonly CompleteBookGuidePageDefinition[] = [
  {
    kind: "guide",
    title: "Quick start",
    sections: [
      {
        heading: "1. Choose and read a activityPlan",
        body: "Choose a activityPlan and follow its steps from top to bottom. Bold text at right is the prescription; smaller text is a cue. “Continue →” means the activityPlan continues. Header distance sums prescribed distances only. Duration includes rest when every step is timed; otherwise it is variable.",
      },
      {
        heading: "2. Work, repeat, rest",
        body: "Do each step in order. Repeat every step inside a Repeat block the stated number of times. Rest means stop exercising for the written time; easy recovery with an intensity target means keep moving. Example: “8min @ 95%THR” means eight minutes at 95% of your own threshold heart rate—not maximum heart rate.",
      },
      {
        heading: "3. Use the conversion charts",
        body: "For a percentage target, choose the chart named by the target, find your own reference value in the first column, then read across to the percentage. Values are reference × percentage ÷ 100, rounded to a whole unit. The charts are lookups only: keep the written target, and do not substitute one reference for another.",
      },
    ],
  },
  { kind: "glossary" },
] as const;

export type ConversionReference = "heart-rate" | "ftp";

/** Distribute the final band rather than creating an unreadable one-column page. */
function conversionPercentagePanels(
  values: readonly number[],
  maximumColumns = 16,
): readonly (readonly number[])[] {
  const pageCount = Math.ceil(values.length / maximumColumns);
  const baseSize = Math.floor(values.length / pageCount);
  const largerPageCount = values.length % pageCount;
  let offset = 0;
  return Array.from({ length: pageCount }, (_, index) => {
    const size = baseSize + (index < largerPageCount ? 1 : 0);
    const panel = values.slice(offset, offset + size);
    offset += size;
    return panel;
  });
}

export const DISTANCE_CATALOG_CONVERSION_PERCENTAGES = {
  "heart-rate": Array.from({ length: 12 }, (_, index) => index * 10),
  ftp: Array.from({ length: 16 }, (_, index) => index * 10),
} as const;

export const DISTANCE_CATALOG_CONVERSION_PANELS = {
  "heart-rate": conversionPercentagePanels(DISTANCE_CATALOG_CONVERSION_PERCENTAGES["heart-rate"]),
  ftp: conversionPercentagePanels(DISTANCE_CATALOG_CONVERSION_PERCENTAGES.ftp),
};

const COMPLETE_BOOK_CONVERSION_PAGES: readonly CompleteBookGuidePageDefinition[] = [
  ...DISTANCE_CATALOG_CONVERSION_PANELS["heart-rate"].map((percentages) => ({
    kind: "conversion" as const,
    percentages,
    reference: "heart-rate" as const,
  })),
  ...DISTANCE_CATALOG_CONVERSION_PANELS.ftp.map((percentages) => ({
    kind: "conversion" as const,
    percentages,
    reference: "ftp" as const,
  })),
];

const COMPLETE_BOOK_ALL_GUIDE_PAGES: readonly CompleteBookGuidePageDefinition[] = [
  ...COMPLETE_BOOK_GUIDE_PAGES,
  ...COMPLETE_BOOK_CONVERSION_PAGES,
];

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#172033",
    fontFamily: "GradientPeakCatalogSans",
    fontFeatureSettings: { dlig: false, liga: false },
    // The top margin is deliberately larger than the 0.6 in Wire-O punch
    // quiet area (43.2 pt). Other trim margins remain at least 18 pt.
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 43.2,
  },
  pageNumber: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    position: "absolute",
    right: 24,
    textAlign: "right",
    top: 43.2,
  },
  continueIndicator: {
    bottom: 28,
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    position: "absolute",
    right: 24,
  },
  identity: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    marginBottom: 8,
    paddingBottom: 7,
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.08,
    paddingRight: 48,
  },
  titleWithCategory: { alignItems: "center", flexDirection: "row", gap: 8 },
  continuationTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.12,
    paddingRight: 48,
  },
  badges: { flexDirection: "row", flexWrap: "wrap", marginTop: 5 },
  badge: {
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    color: "#334155",
    fontSize: 10.5,
    marginBottom: 2,
    marginRight: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  description: {
    color: "#475569",
    fontSize: 11,
    lineHeight: 1.25,
    marginTop: 4,
  },
  profile: {
    backgroundColor: "#f1f5f9",
    borderRadius: 5,
    height: 36,
    marginBottom: 10,
    padding: 5,
  },
  group: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    marginBottom: 8,
    paddingBottom: 4,
  },
  repeat: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    borderLeftColor: "#94a3b8",
    borderLeftWidth: 3,
    marginBottom: 8,
    paddingBottom: 4,
    paddingLeft: 7,
  },
  repeatHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  repeatTitle: { color: "#475569", fontSize: 12, fontWeight: 700 },
  repeatCount: {
    backgroundColor: "#e2e8f0",
    borderRadius: 7,
    color: "#334155",
    fontSize: 12,
    fontWeight: 700,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  continuation: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 1.15,
    marginBottom: 4,
  },
  step: { flexDirection: "row", marginBottom: 7 },
  accent: { borderRadius: 1, marginRight: 6, width: 3 },
  stepContent: { flexBasis: 0, flexGrow: 1, flexShrink: 1 },
  stepTop: { alignItems: "flex-start", flexDirection: "row" },
  stackedStepTop: { width: "100%" },
  name: {
    color: "#0f172a",
    fontSize: DISTANCE_CATALOG_STEP_FONT_SIZE,
    fontWeight: 700,
    lineHeight: 1.12,
    // The exporter only chooses this layout after shaping both this run and
    // the target. It receives the remaining row width after the 12 pt gap.
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  nameAbovePrescription: {
    color: "#0f172a",
    fontSize: DISTANCE_CATALOG_STEP_FONT_SIZE,
    fontWeight: 700,
    lineHeight: 1.12,
  },
  duration: {
    color: "#0f172a",
    fontSize: DISTANCE_CATALOG_STEP_FONT_SIZE,
    fontWeight: 700,
    lineHeight: 1.12,
    textAlign: "right",
    marginLeft: DISTANCE_CATALOG_INLINE_GAP,
    // The exact target width is supplied as a per-step style. Do not reserve
    // a fixed column: that strands usable row width and creates false fallbacks.
    flexBasis: 0,
    flexGrow: 0,
    flexShrink: 0,
  },
  durationBelowName: {
    color: "#0f172a",
    fontSize: DISTANCE_CATALOG_STEP_FONT_SIZE,
    fontWeight: 700,
    lineHeight: 1.12,
    marginTop: 2,
    // A fallback prescription owns the entire step-content row. Align its
    // complete duration-and-target run to that row's right edge; this is not
    // word justification and preserves the inline layout unchanged.
    textAlign: "right",
    width: "100%",
  },
  unit: { fontWeight: 400 },
  cue: { color: "#64748b", fontSize: 11, lineHeight: 1.25, marginTop: 3 },
  templateTitle: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.12,
    marginBottom: 8,
    paddingRight: 48,
  },
  templateMeta: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 1.2,
    marginBottom: 12,
  },
  weekTitle: {
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 1,
    color: "#334155",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 7,
    paddingBottom: 4,
  },
  session: {
    flexDirection: "row",
    fontSize: 12,
    lineHeight: 1.2,
    marginBottom: 6,
  },
  sessionDay: { fontWeight: 700, width: "16%" },
  sessionTitle: { paddingRight: 8, width: "52%" },
  sessionPage: { textAlign: "right", width: "32%" },
  bookCover: {
    backgroundColor: "#000000",
    color: "#ffffff",
    fontFamily: "GradientPeakCatalogSans",
    alignItems: "center",
    justifyContent: "center",
    padding: 52,
  },
  bookKicker: { color: "#7dd3fc", fontSize: 18, letterSpacing: 2.5 },
  bookTitle: {
    fontSize: 42,
    fontWeight: 700,
    lineHeight: 1.05,
    marginTop: 172,
  },
  bookSubtitle: {
    color: "#cbd5e1",
    fontSize: 11.5,
    lineHeight: 1.3,
    marginTop: 16,
  },
  bookMeta: { color: "#94a3b8", fontSize: 16, lineHeight: 1.35 },
  bookCoverLogo: { height: 144, width: 144 },
  bookFront: {
    backgroundColor: "#ffffff",
    color: "#172033",
    fontFamily: "GradientPeakCatalogSans",
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 43.2,
  },
  bookFrontTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 16,
    paddingRight: 48,
  },
  chapterDivider: {
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontFamily: "GradientPeakCatalogSans",
    justifyContent: "center",
    padding: 52,
  },
  chapterDividerKicker: {
    color: "#64748b",
    fontSize: 12,
    letterSpacing: 2.2,
  },
  chapterDividerTitle: {
    color: "#0f172a",
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1.08,
    marginTop: 12,
  },
  chapterDividerRule: { backgroundColor: "#0f172a", height: 2, marginTop: 18, width: 56 },
  chapterPageNumber: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    position: "absolute",
    right: 24,
    textAlign: "right",
    top: 43.2,
  },
  contentsColumns: { flexDirection: "row" },
  contentsColumn: { paddingRight: 18, width: "50%" },
  contentsRow: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 0.7,
    color: "#172033",
    flexDirection: "row",
    fontSize: 11.5,
    lineHeight: 1.2,
    paddingBottom: 2,
    paddingTop: 2,
    textDecoration: "none",
  },
  contentsName: { paddingRight: 10, width: "88%" },
  contentsChapterName: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    paddingRight: 10,
    width: "88%",
  },
  contentsChapterRow: { marginTop: 8 },
  contentsChapterTitle: { color: "#0f172a", fontWeight: 700 },
  contentsPage: { color: "#0369a1", textAlign: "right", width: "12%" },
  contentsKind: {
    color: "#64748b",
    fontSize: 12,
    marginBottom: 3,
    marginTop: 8,
  },
  guideHeading: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
    marginTop: 8,
  },
  guideBody: {
    color: "#334155",
    fontSize: 11.5,
    lineHeight: 1.3,
    marginBottom: 6,
    maxWidth: 360,
  },
  glossaryEntry: { color: "#334155", fontSize: 10.5, lineHeight: 1.22, marginBottom: 7 },
  glossaryTerm: { color: "#0f172a", fontWeight: 700 },
  // These pages are reference tables, not activityPlan charts: keep their print
  // treatment strictly black and white. A compact two-line percentage header
  // allows all 10% columns to remain together on an A5 page.
  conversionTable: { borderColor: "#000000", borderWidth: 0.7 },
  conversionRow: { flexDirection: "row" },
  conversionCell: {
    alignItems: "center",
    borderRightColor: "#000000",
    borderRightWidth: 0.5,
    justifyContent: "center",
    minHeight: 17,
    paddingHorizontal: 1,
    textAlign: "center",
  },
  conversionHeaderCell: {
    backgroundColor: "#000000",
    borderRightColor: "#000000",
    color: "#ffffff",
    fontSize: 9,
    fontWeight: 700,
    minHeight: 27,
  },
  conversionReferenceHeaderCell: { fontSize: 9 },
  conversionReferenceCell: {
    backgroundColor: "#ffffff",
    color: "#000000",
    fontSize: 9,
    fontWeight: 700,
  },
  conversionValueCell: { color: "#000000", fontSize: 9 },
  bookBack: {
    alignItems: "center",
    backgroundColor: "#000000",
    color: "#ffffff",
    fontFamily: "GradientPeakCatalogSans",
    justifyContent: "center",
    padding: 52,
  },
  bookBackTitle: { fontSize: 32, fontWeight: 700 },
  bookBackBody: { color: "#cbd5e1", fontSize: 18, marginTop: 14 },
});

function LightUnits({ value }: { value: string }) {
  return (
    <>
      {Array.from(
        value.matchAll(
          /(?:min|sec|km|mi|yd|FTP|THR|HRmax|bpm|rpm|kg|lb|reps?|W|m)\b|[^a-zA-Z]+|[a-zA-Z]+/gu,
        ),
      ).map((match) => (
        <Text
          key={match.index}
          style={
            /^(?:min|sec|km|mi|yd|FTP|THR|HRmax|bpm|rpm|kg|lb|reps?|W|m)$/u.test(match[0])
              ? styles.unit
              : {}
          }
        >
          {match[0]}
        </Text>
      ))}
    </>
  );
}

/** Keep authored words intact; placement measurement chooses a non-wrapping target row. */
function noHyphenation(word: string): string[] {
  return [word];
}

export function formatDistanceCatalogPrescription(step: {
  durationLabel?: string;
  targetLabels?: readonly string[];
}): string {
  const compact = (value: string) =>
    value
      .replace(/\bThreshold HR\b|\bThresholdHR\b/gu, "THR")
      .replace(/\bMax HR\b|\bMaxHR\b/gu, "HRmax")
      .replace(/(\d)\s+(min|sec|km|m|mi|yd|bpm|rpm|kg|lb|reps?|W)\b/gu, "$1$2")
      .replace(/%\s+(FTP|HRmax|THR)/gu, "%$1");
  const duration = compact(formatActivityPlanCatalogDuration(step.durationLabel ?? ""));
  const targets = (step.targetLabels ?? []).map(compact).join(" ");
  return targets ? `${duration}${duration ? " @ " : ""}${targets}` : duration;
}

/**
 * The migrated V5 sample fixtures put an interval name behind two exact
 * metadata paragraphs. In this reading edition, promote that name to the
 * group heading instead of printing it again below the coaching cue. This is
 * deliberately narrower than general cue cleanup: hand-authored paragraphs
 * and unknown migration text remain untouched.
 */
export function getDistanceCatalogCuePresentation(step: {
  activityCategory: string;
  instructions: string | null;
  name: string | null;
}): { cue: string | null; groupContext: string | null } {
  const paragraphs = step.instructions?.trim().split("\n\n") ?? [];
  const blockContext = `Block context:\nSegment: ${step.activityCategory} activity`;
  const blockIndex = paragraphs.indexOf(blockContext);
  const interval = paragraphs[blockIndex + 1];
  const intervalMatch = interval ? /^Interval:\n(.+)$/u.exec(interval) : null;
  if (blockIndex >= 0 && intervalMatch) {
    paragraphs.splice(blockIndex, 2);
    const groupContext = intervalMatch[1]?.trim() ?? "";
    const originalCue = formatActivityPlanCatalogInstruction(step);
    return {
      cue: formatActivityPlanCatalogInstruction({
        ...step,
        instructions: paragraphs.join("\n\n") || null,
      }),
      groupContext:
        groupContext &&
        normalizedGroupContext(groupContext) !== normalizedGroupContext(step.name ?? "") &&
        normalizedGroupContext(groupContext) !== "rest" &&
        originalCue?.includes(groupContext)
          ? groupContext
          : null,
    };
  }
  return {
    cue: formatActivityPlanCatalogInstruction(step),
    groupContext: null,
  };
}

function normalizedGroupContext(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

export function getDistanceCatalogProfileBars(fragment: ActivityPlanCatalogFragment) {
  const bars = fragment.model.intensityProfile;
  const widths = getActivityPlanCatalogTimedProfileWidths(bars);
  return bars.map((bar, index) => ({
    ...bar,
    width: widths ? (widths[index] ?? 0) : 100 / bars.length,
  }));
}

export function getDistanceCatalogStepAccent(
  fragment: ActivityPlanCatalogFragment,
  stepId: string,
): string {
  return (
    fragment.model.intensityProfile.find((bar) => bar.id.includes(stepId))?.color ??
    NEUTRAL_STEP_COLOR
  );
}

function ActivityPlanProfile({ fragment }: { fragment: ActivityPlanCatalogFragment }) {
  const bars = getDistanceCatalogProfileBars(fragment);
  if (!bars.length) return null;
  let offset = 0;
  return (
    <View style={styles.profile} wrap={false}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
        {bars.map((bar) => {
          const x = offset;
          offset += bar.width;
          return (
            <Rect
              fill={bar.color}
              height={bar.heightPercent}
              key={bar.id}
              rx={1}
              width={bar.width}
              x={x}
              y={100 - bar.heightPercent}
            />
          );
        })}
      </Svg>
    </View>
  );
}

function CatalogPageNumber({ pageNumber }: { pageNumber: number }) {
  return (
    <Text fixed style={styles.pageNumber}>
      {pageNumber}
    </Text>
  );
}

function ChapterPageNumber({ pageNumber }: { pageNumber: number }) {
  return (
    <Text fixed style={styles.chapterPageNumber}>
      {pageNumber}
    </Text>
  );
}

function ContinueIndicator() {
  return (
    <Text fixed style={styles.continueIndicator}>
      Continue →
    </Text>
  );
}

export function getDistanceCatalogHeaderChips(model: ActivityPlanPrintModel): readonly string[] {
  const distance = model.totals.find((total) => /^Distance(?: subtotal)?:/u.test(total));
  const bars = model.intensityProfile;
  const fullyTimed = bars.length > 0 && bars.every((bar) => bar.durationSeconds != null);
  const seconds = bars.reduce((total, bar) => total + (bar.durationSeconds ?? 0), 0);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const duration = fullyTimed
    ? [minutes ? `${minutes} min` : "", remainder ? `${remainder} sec` : ""]
        .filter(Boolean)
        .join(" ") || "0 min"
    : "Variable";
  return [
    distance ? formatActivityPlanCatalogTotal(distance) : "Distance: Not prescribed",
    `Duration: ${duration}`,
  ];
}

function renderGroup(
  group: ActivityPlanPrintGroup,
  fragment: ActivityPlanCatalogFragment,
  prescriptionPlacementByStepId: ActivityPlanDistanceCatalogPrescriptionPlacementByStepId,
): React.ReactNode {
  const continued = fragment.continuedGroupIds.includes(group.id);
  const continues = fragment.continuesAfterGroupIds.includes(group.id);
  const repeated = group.repetitions > 1;
  const cuePresentations = group.steps.map((step) =>
    getDistanceCatalogCuePresentation({
      activityCategory: fragment.model.activityCategory,
      instructions: step.instructions,
      name: step.name,
    }),
  );
  const groupContext = cuePresentations.find(
    (presentation) => presentation.groupContext,
  )?.groupContext;
  return (
    <View key={group.id} style={repeated ? styles.repeat : styles.group} wrap={false}>
      {repeated || groupContext ? (
        <View style={styles.repeatHeader}>
          <Text style={styles.repeatTitle}>
            {repeated ? "Repeat block" : "Block"}
            {groupContext ? ` · ${groupContext}` : ""}
          </Text>
          {repeated ? <Text style={styles.repeatCount}>{group.repetitions}×</Text> : null}
        </View>
      ) : null}
      {continued ? <Text style={styles.continuation}>Repeat block continued</Text> : null}
      {group.steps.map((step, stepIndex) => {
        const cue = cuePresentations[stepIndex]?.cue ?? null;
        const prescription = formatDistanceCatalogPrescription(step);
        // Step IDs are only unique within an authored activityPlan; qualify the
        // measured placement so one activityPlan cannot overwrite another's width.
        const placementDetail = prescriptionPlacementByStepId.get(
          getDistanceCatalogPrescriptionPlacementKey(fragment.entry.key, step.id),
        );
        const prescriptionPlacement = placementDetail?.placement ?? "inline";
        const stepName = step.name === "Warmup" ? "Warm-up" : step.name;
        return (
          <View key={step.id} style={styles.step} wrap={false}>
            <View
              style={[
                styles.accent,
                {
                  backgroundColor: getDistanceCatalogStepAccent(fragment, step.id),
                },
              ]}
            />
            <View style={styles.stepContent}>
              {prescriptionPlacement === "inline" ? (
                <View style={styles.stepTop}>
                  <Text hyphenationCallback={noHyphenation} style={styles.name}>
                    {stepName}
                  </Text>
                  <Text
                    hyphenationCallback={noHyphenation}
                    style={[
                      styles.duration,
                      ...(placementDetail
                        ? [{ flexBasis: placementDetail.prescriptionWidth }]
                        : []),
                    ]}
                  >
                    <LightUnits value={prescription} />
                  </Text>
                </View>
              ) : (
                <View style={styles.stackedStepTop}>
                  <Text hyphenationCallback={noHyphenation} style={styles.nameAbovePrescription}>
                    {stepName}
                  </Text>
                  <Text hyphenationCallback={noHyphenation} style={styles.durationBelowName}>
                    <LightUnits value={prescription} />
                  </Text>
                </View>
              )}
              {cue ? <Text style={styles.cue}>{cue}</Text> : null}
            </View>
          </View>
        );
      })}
      {continues ? <Text style={styles.continuation}>Repeat block continues</Text> : null}
    </View>
  );
}

export function ActivityPlanDistanceCatalogActivityPlanPage({
  anchor,
  fragment,
  geometry = "landscape",
  pageNumber,
  prescriptionPlacementByStepId = new Map(),
}: {
  anchor?: string;
  fragment: ActivityPlanCatalogFragment;
  geometry?: ActivityPlanDistanceCatalogGeometry;
  pageNumber: number;
  prescriptionPlacementByStepId?: ActivityPlanDistanceCatalogPrescriptionPlacementByStepId;
}) {
  const groups = fragment.model.sections.flatMap((section) => section.groups);
  return (
    <Page
      {...(anchor === undefined ? {} : { id: anchor })}
      size={catalogPageSize(geometry)}
      style={styles.page}
      wrap
    >
      {fragment.showContext ? (
        <View style={styles.identity}>
          <View style={styles.titleWithCategory}>
            <ActivityCategoryPdfIcon category={getCatalogActivityPlanCategory(fragment)} />
            <Text style={styles.title}>{fragment.model.title}</Text>
          </View>
          <View style={styles.badges}>
            {getDistanceCatalogHeaderChips(fragment.entry.model).map((badge) => (
              <Text key={badge} style={styles.badge}>
                {badge}
              </Text>
            ))}
          </View>
          {fragment.model.description ? (
            <Text style={styles.description}>{fragment.model.description}</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.titleWithCategory}>
          <ActivityCategoryPdfIcon category={getCatalogActivityPlanCategory(fragment)} />
          <Text style={[styles.continuationTitle, { marginBottom: 12 }]}>
            {fragment.model.title} · continued
          </Text>
        </View>
      )}
      {fragment.showContext ? <ActivityPlanProfile fragment={fragment} /> : null}
      {groups.map((group) => renderGroup(group, fragment, prescriptionPlacementByStepId))}
      {fragment.partCount > 1 && fragment.partIndex < fragment.partCount - 1 ? (
        <ContinueIndicator />
      ) : null}
      <CatalogPageNumber pageNumber={pageNumber} />
    </Page>
  );
}

export function ActivityPlanDistanceCatalogTrainingPage({
  anchor,
  geometry = "landscape",
  plan,
  pageNumber,
  week,
  activityPlanPageNumbers,
}: {
  anchor?: string;
  geometry?: ActivityPlanDistanceCatalogGeometry;
  plan: ActivityPlanCatalogTrainingPlan;
  pageNumber: number;
  week: ActivityPlanCatalogTrainingWeek;
  activityPlanPageNumbers?: ReadonlyMap<string, number>;
}) {
  return (
    <Page
      {...(anchor === undefined ? {} : { id: anchor })}
      size={catalogPageSize(geometry)}
      style={styles.page}
      wrap
    >
      <Text style={styles.templateTitle}>{plan.name}</Text>
      <Text style={styles.templateMeta}>
        {plan.weeks.length} weeks · {plan.sessionsPerWeekTarget} sessions per week
      </Text>
      <View wrap={false}>
        <Text style={styles.weekTitle}>WEEK {week.weekIndex + 1}</Text>
        {week.sessions.map((session) => (
          <View key={session.key} style={styles.session}>
            <Text style={styles.sessionDay}>Day {session.dayIndex + 1}</Text>
            <Text style={styles.sessionTitle}>{session.title}</Text>
            <Text style={styles.sessionPage}>
              ActivityPlan page{" "}
              {activityPlanPageNumbers?.get(session.activityPlanId) ?? session.activityPageNumber}
            </Text>
          </View>
        ))}
      </View>
      <CatalogPageNumber pageNumber={pageNumber} />
    </Page>
  );
}

export type ActivityPlanDistanceCatalogCompleteBookPlan = {
  chapters: readonly ActivityPlanDistanceCatalogChapter[];
  contentsPages: readonly (readonly ActivityPlanDistanceCatalogContentsEntry[])[];
  frontMatterPageCount: number;
  guideFirstPageNumber: number;
  guidePageCount: number;
  trainingStartPageNumber: number;
  trainingFirstPageNumbers: ReadonlyMap<string, number>;
  totalPageCount: number;
  activityPlanPageNumbers: ReadonlyMap<string, number>;
  activityPlanSlots: readonly ActivityPlanDistanceCatalogActivityPlanSlot[];
};

export type ActivityPlanDistanceCatalogActivityPlanSlot = {
  contentFragments: readonly ActivityPlanCatalogFragment[];
  firstPageNumber: number;
  activityPlanId: string;
};

export type CatalogChapter = "tests" | CatalogActivityPlanCategory;
export type ActivityPlanDistanceCatalogChapter = {
  pageNumber: number;
  slots: readonly ActivityPlanDistanceCatalogActivityPlanSlot[];
  title: string;
  type: CatalogChapter;
};

type ActivityPlanDistanceCatalogContentsEntry = {
  anchor: string;
  category?: CatalogActivityPlanCategory;
  kind: "Assessment" | "Chapter" | "Guide" | "Training schedule" | "ActivityPlan";
  pageNumber: number;
  title: string;
};

export type CatalogActivityPlanCategory = "bike" | "other" | "run" | "strength" | "swim";
type LucidePdfIconNode =
  | readonly ["circle", { cx: string; cy: string; r: string }]
  | readonly ["path", { d: string }];

/**
 * Canonical category icons from the app's lucide-react 0.577.0 dependency.
 * These are copied icon nodes rather than React components because
 * @react-pdf/renderer owns its SVG primitives. Keep this map aligned with
 * apps/mobile/lib/constants/activities.ts: Bike, Footprints, Waves,
 * Dumbbell, and Activity respectively.
 */
export const ACTIVITY_CATEGORY_PDF_LUCIDE_NODES: Readonly<
  Record<CatalogActivityPlanCategory, readonly LucidePdfIconNode[]>
> = {
  bike: [
    ["circle", { cx: "18.5", cy: "17.5", r: "3.5" }],
    ["circle", { cx: "5.5", cy: "17.5", r: "3.5" }],
    ["circle", { cx: "15", cy: "5", r: "1" }],
    ["path", { d: "M12 17.5V14l-3-3 4-3 2 3h2" }],
  ],
  run: [
    [
      "path",
      {
        d: "M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z",
      },
    ],
    [
      "path",
      {
        d: "M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z",
      },
    ],
    ["path", { d: "M16 17h4" }],
    ["path", { d: "M4 13h4" }],
  ],
  swim: [
    [
      "path",
      {
        d: "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      },
    ],
    [
      "path",
      {
        d: "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      },
    ],
    [
      "path",
      {
        d: "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      },
    ],
  ],
  strength: [
    [
      "path",
      {
        d: "M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z",
      },
    ],
    ["path", { d: "m2.5 21.5 1.4-1.4" }],
    ["path", { d: "m20.1 3.9 1.4-1.4" }],
    [
      "path",
      {
        d: "M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z",
      },
    ],
    ["path", { d: "m9.6 14.4 4.8-4.8" }],
  ],
  other: [
    [
      "path",
      {
        d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
      },
    ],
  ],
};
const CATALOG_ACTIVITY_PLAN_CATEGORIES: readonly CatalogActivityPlanCategory[] = [
  "bike",
  "run",
  "swim",
  "strength",
  "other",
];
const CATALOG_CATEGORY_LABELS: Record<CatalogActivityPlanCategory, string> = {
  bike: "Cycling",
  other: "Cross-training & recovery",
  run: "Running",
  strength: "Strength",
  swim: "Swimming",
};
const CATALOG_CHAPTER_LABELS: Record<CatalogChapter, string> = {
  tests: "Tests",
  ...CATALOG_CATEGORY_LABELS,
};

function getCatalogActivityPlanCategory(
  fragment: ActivityPlanCatalogFragment,
): CatalogActivityPlanCategory {
  const category = fragment.model.activityCategory;
  if (category in CATALOG_CATEGORY_LABELS) return category as CatalogActivityPlanCategory;
  throw new Error(`Catalog has no PDF icon mapping for activity category: ${category}`);
}

function getCatalogActivityPlanSlotCategory(slot: ActivityPlanDistanceCatalogActivityPlanSlot) {
  const fragment = slot.contentFragments[0];
  if (!fragment) throw new Error(`ActivityPlan slot ${slot.activityPlanId} has no first fragment`);
  return getCatalogActivityPlanCategory(fragment);
}

export function ActivityCategoryPdfIcon({ category }: { category: CatalogActivityPlanCategory }) {
  return (
    <Svg
      fill="none"
      height={16}
      stroke="#0369a1"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={16}
    >
      {ACTIVITY_CATEGORY_PDF_LUCIDE_NODES[category].map(([element, attributes]) => {
        const key = element === "circle" ? `circle-${attributes.cx}` : `path-${attributes.d}`;
        return element === "circle" ? (
          <Circle
            {...attributes}
            fill="none"
            key={key}
            stroke="#0369a1"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : (
          <Path
            {...attributes}
            fill="none"
            key={key}
            stroke="#0369a1"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        );
      })}
    </Svg>
  );
}

/** Maps every visible physical page before rendering so contents and schedule references cannot drift. */
export function buildActivityPlanDistanceCatalogCompleteBookPlan(
  fragments: readonly ActivityPlanCatalogFragment[],
  trainingPages: readonly {
    plan: ActivityPlanCatalogTrainingPlan;
    week: ActivityPlanCatalogTrainingWeek;
  }[],
  geometry: ActivityPlanDistanceCatalogGeometry = "landscape",
): ActivityPlanDistanceCatalogCompleteBookPlan {
  const activityPlanSlots = fragments.reduce<ActivityPlanDistanceCatalogActivityPlanSlot[]>(
    (slots, fragment) => {
      const current = slots.at(-1);
      if (fragment.partIndex === 0) {
        slots.push({
          contentFragments: [fragment],
          firstPageNumber: 0,
          activityPlanId: fragment.entry.key,
        });
      } else if (current?.activityPlanId === fragment.entry.key) {
        current.contentFragments = [...current.contentFragments, fragment];
      } else {
        throw new Error(`ActivityPlan fragment order is invalid for ${fragment.model.title}`);
      }
      return slots;
    },
    [],
  );
  activityPlanSlots.sort(
    (left, right) =>
      Number(!isReferenceAssessmentTemplateId(left.activityPlanId)) -
        Number(!isReferenceAssessmentTemplateId(right.activityPlanId)) ||
      (isReferenceAssessmentTemplateId(left.activityPlanId) &&
      isReferenceAssessmentTemplateId(right.activityPlanId)
        ? REFERENCE_ASSESSMENT_TEMPLATE_IDS.indexOf(left.activityPlanId) -
          REFERENCE_ASSESSMENT_TEMPLATE_IDS.indexOf(right.activityPlanId)
        : CATALOG_ACTIVITY_PLAN_CATEGORIES.indexOf(getCatalogActivityPlanSlotCategory(left)) -
          CATALOG_ACTIVITY_PLAN_CATEGORIES.indexOf(getCatalogActivityPlanSlotCategory(right))),
  );
  const activityPlanFirstFragments = activityPlanSlots
    .map((slot) => slot.contentFragments[0])
    .filter((fragment): fragment is ActivityPlanCatalogFragment => Boolean(fragment));
  const trainingFirstPages = trainingPages.filter(
    ({ plan, week }) =>
      week.weekIndex === Math.min(...plan.weeks.map((candidate) => candidate.weekIndex)),
  );
  // Chapters are real reader pages, not contents-only labels. Keep the three
  // reference assessments together before the active activity categories.
  const chapters = (["tests", ...CATALOG_ACTIVITY_PLAN_CATEGORIES] as const).flatMap(
    (type): ActivityPlanDistanceCatalogChapter[] => {
      const slots = activityPlanSlots.filter((slot) =>
        type === "tests"
          ? isReferenceAssessmentTemplateId(slot.activityPlanId)
          : !isReferenceAssessmentTemplateId(slot.activityPlanId) &&
            getCatalogActivityPlanSlotCategory(slot) === type,
      );
      return slots.length
        ? [{ pageNumber: 0, slots, title: CATALOG_CHAPTER_LABELS[type], type }]
        : [];
    },
  );
  const contentsEntryCount =
    activityPlanFirstFragments.length +
    chapters.length +
    trainingFirstPages.length +
    COMPLETE_BOOK_ALL_GUIDE_PAGES.length;
  const contentsPageCount =
    geometry === "portrait"
      ? Math.max(
          1,
          1 +
            Math.ceil(
              Math.max(0, contentsEntryCount - COMPLETE_BOOK_PORTRAIT_FIRST_CONTENTS_PAGE_ENTRIES) /
                COMPLETE_BOOK_PORTRAIT_FOLLOWING_CONTENTS_PAGE_ENTRIES,
            ),
        )
      : Math.max(
          1,
          Math.ceil(contentsEntryCount / COMPLETE_BOOK_CONTENTS_ENTRIES_PER_PAGE.landscape),
        );
  // Each guide section is allowed to take its natural rendered page count. The
  // A5 renderer currently starts each section fresh, so this is a lower bound
  // used for stable anchors; the exporter verifies the resulting page count.
  const guidePageCount = COMPLETE_BOOK_ALL_GUIDE_PAGES.length;
  const guideFirstPageNumber = 2 + contentsPageCount;
  // Front cover + contents + user guide. Upload cover inside faces are created
  // only in the separate cover PDF; the reader has no publication-information
  // or placeholder interior page.
  const frontMatterWithoutAlignment = 1 + contentsPageCount + guidePageCount;
  const frontMatterPageCount = frontMatterWithoutAlignment;
  const activityPlanPageNumbers = new Map<string, number>();
  let nextActivityPlanPageNumber = frontMatterPageCount + 1;
  chapters.forEach((chapter) => {
    chapter.pageNumber = nextActivityPlanPageNumber;
    nextActivityPlanPageNumber += 1;
    chapter.slots.forEach((slot) => {
      const firstPageNumber = nextActivityPlanPageNumber;
      slot.firstPageNumber = firstPageNumber;
      activityPlanPageNumbers.set(slot.activityPlanId, firstPageNumber);
      nextActivityPlanPageNumber += slot.contentFragments.length;
    });
  });
  const allocatedActivityPlanPages = activityPlanSlots.reduce(
    (total, slot) => total + slot.contentFragments.length,
    0,
  );
  const trainingStartPageNumber = nextActivityPlanPageNumber;
  const trainingFirstPageNumbers = new Map<string, number>();
  trainingPages.forEach(({ plan }, index) => {
    if (!trainingFirstPageNumbers.has(plan.id))
      trainingFirstPageNumbers.set(plan.id, trainingStartPageNumber + index);
  });
  const entries: ActivityPlanDistanceCatalogContentsEntry[] = [
    ...COMPLETE_BOOK_ALL_GUIDE_PAGES.map((guide, index) => {
      if (guide.kind === "conversion") {
        const range = `${guide.percentages[0]}–${guide.percentages.at(-1)}%`;
        return {
          anchor: `#conversion-${guide.reference}-${guide.percentages[0]}`,
          kind: "Guide" as const,
          pageNumber: guideFirstPageNumber + index,
          title: `${guide.reference === "heart-rate" ? "HR conversion" : "FTP conversion"} · ${range}`,
        };
      }
      return {
        anchor: guide.kind === "glossary" ? "#glossary" : "#user-guide",
        kind: "Guide" as const,
        pageNumber: guideFirstPageNumber + index,
        title: guide.kind === "glossary" ? "Glossary" : guide.title,
      };
    }),
    ...chapters.flatMap((chapter) => [
      {
        anchor: `#chapter-${chapter.type}`,
        ...(chapter.type === "tests" ? {} : { category: chapter.type }),
        kind: "Chapter" as const,
        pageNumber: chapter.pageNumber,
        title: chapter.title,
      },
      ...chapter.slots.map((slot) => {
        const fragment = slot.contentFragments[0];
        if (!fragment)
          throw new Error(`ActivityPlan slot ${slot.activityPlanId} has no first fragment`);
        return {
          anchor: `#activityPlan-${fragment.entry.key}`,
          category: getCatalogActivityPlanCategory(fragment),
          kind: isReferenceAssessmentTemplateId(fragment.entry.key)
            ? ("Assessment" as const)
            : ("ActivityPlan" as const),
          pageNumber: activityPlanPageNumbers.get(fragment.entry.key) ?? 0,
          title: fragment.model.title,
        };
      }),
    ]),
    ...trainingFirstPages.map(({ plan }) => ({
      anchor: `#training-${plan.id}`,
      kind: "Training schedule" as const,
      pageNumber: trainingFirstPageNumbers.get(plan.id) ?? 0,
      title: plan.name,
    })),
  ];
  return {
    contentsPages: Array.from({ length: contentsPageCount }, (_, index) => {
      const firstPageLimit =
        geometry === "portrait" ? COMPLETE_BOOK_PORTRAIT_FIRST_CONTENTS_PAGE_ENTRIES : 0;
      const start = !firstPageLimit
        ? index * COMPLETE_BOOK_CONTENTS_ENTRIES_PER_PAGE[geometry]
        : index === 0
          ? 0
          : firstPageLimit + (index - 1) * COMPLETE_BOOK_PORTRAIT_FOLLOWING_CONTENTS_PAGE_ENTRIES;
      const size =
        index === 0 && firstPageLimit
          ? firstPageLimit
          : firstPageLimit
            ? COMPLETE_BOOK_PORTRAIT_FOLLOWING_CONTENTS_PAGE_ENTRIES
            : COMPLETE_BOOK_CONTENTS_ENTRIES_PER_PAGE[geometry];
      return entries.slice(start, start + size);
    }),
    chapters,
    frontMatterPageCount,
    guideFirstPageNumber,
    guidePageCount,
    // The reader has no blank reverse clutter; its only final face is the back cover.
    totalPageCount:
      frontMatterPageCount +
      chapters.length +
      allocatedActivityPlanPages +
      trainingPages.length +
      1,
    trainingStartPageNumber,
    trainingFirstPageNumbers,
    activityPlanPageNumbers,
    activityPlanSlots,
  };
}

function CompleteBookContentsPage({
  entries,
  geometry,
  index,
  pageNumber,
  total,
}: {
  entries: readonly ActivityPlanDistanceCatalogContentsEntry[];
  geometry: ActivityPlanDistanceCatalogGeometry;
  index: number;
  pageNumber: number;
  total: number;
}) {
  const midpoint = Math.ceil(entries.length / 2);
  const columns =
    geometry === "portrait" ? [entries] : [entries.slice(0, midpoint), entries.slice(midpoint)];
  return (
    <Page size={catalogPageSize(geometry)} style={styles.bookFront} wrap>
      <Text style={styles.bookFrontTitle}>
        Contents · {index + 1} of {total}
      </Text>
      <View style={styles.contentsColumns}>
        {columns.map((column, columnIndex) => (
          <View
            key={columnIndex === 0 ? "left" : "right"}
            style={[styles.contentsColumn, geometry === "portrait" ? { width: "100%" } : {}]}
          >
            {column.map((entry, entryIndex) => (
              <React.Fragment key={entry.anchor}>
                {(entry.kind === "Guide" || entry.kind === "Training schedule") &&
                (entryIndex === 0 || column[entryIndex - 1]?.kind !== entry.kind) ? (
                  <Text style={styles.contentsKind}>
                    {entry.kind === "Guide" ? "Guide" : "Training schedules"}
                  </Text>
                ) : null}
                <Link
                  src={entry.anchor}
                  style={[
                    styles.contentsRow,
                    ...(entry.kind === "Chapter" ? [styles.contentsChapterRow] : []),
                  ]}
                >
                  {entry.kind === "Chapter" ? (
                    <View style={styles.contentsChapterName}>
                      {entry.category ? (
                        <ActivityCategoryPdfIcon category={entry.category} />
                      ) : null}
                      <Text style={styles.contentsChapterTitle}>{entry.title}</Text>
                    </View>
                  ) : (
                    <Text style={styles.contentsName}>{entry.title}</Text>
                  )}
                  <Text style={styles.contentsPage}>{entry.pageNumber}</Text>
                </Link>
              </React.Fragment>
            ))}
          </View>
        ))}
      </View>
      <CatalogPageNumber pageNumber={pageNumber} />
    </Page>
  );
}

function CompleteBookChapterDivider({
  anchor,
  geometry,
  pageNumber,
  title,
}: {
  anchor: string;
  geometry: ActivityPlanDistanceCatalogGeometry;
  pageNumber: number;
  title: string;
}) {
  return (
    <Page id={anchor} size={catalogPageSize(geometry)} style={styles.chapterDivider} wrap>
      <Text style={styles.chapterDividerKicker}>ACTIVITY PLAN CATALOG</Text>
      <Text style={styles.chapterDividerTitle}>{title}</Text>
      <View style={styles.chapterDividerRule} />
      <ChapterPageNumber pageNumber={pageNumber} />
    </Page>
  );
}

function CompleteBookGuidePage({
  anchor,
  geometry,
  pageNumber,
  sections,
  title = "Quick start",
}: {
  anchor?: string;
  geometry: ActivityPlanDistanceCatalogGeometry;
  pageNumber: number;
  sections: readonly { body: string; heading: string }[];
  title?: string;
}) {
  return (
    <Page
      {...(anchor === undefined ? {} : { id: anchor })}
      size={catalogPageSize(geometry)}
      style={styles.bookFront}
      wrap
    >
      <Text style={styles.bookFrontTitle}>{title}</Text>
      {sections.map((section) => (
        <React.Fragment key={section.heading}>
          <Text style={styles.guideHeading}>{section.heading}</Text>
          <Text style={styles.guideBody}>{section.body}</Text>
        </React.Fragment>
      ))}
      <CatalogPageNumber pageNumber={pageNumber} />
    </Page>
  );
}

const GLOSSARY_ENTRIES = [
  [
    "FTP",
    "Functional threshold power: the cycling power baseline used by %FTP targets. W means watts, the unit of power.",
  ],
  [
    "THR / Threshold HR",
    "Threshold heart rate: the heart-rate baseline used by %THR targets. THR is not HRmax.",
  ],
  [
    "HRmax / MaxHR",
    "Maximum heart rate: the highest heart-rate baseline used by %HRmax targets; it is distinct from THR.",
  ],
  [
    "HR; bpm / BPM",
    "Heart rate; beats per minute. A target such as 150bpm is an absolute heart-rate value, not a percentage.",
  ],
  [
    "RPE / RIR",
    "Rating of perceived exertion (RPE) uses 1–10; RIR is repetitions in reserve. For lifting sets, RPE 7/8/9 means about 3/2/1 clean reps left. Running RPE describes overall effort, not reps left. Power exercises stop before speed or technique declines; do not chase failure.",
  ],
  [
    "rpm / RPM",
    "Revolutions per minute: cycling cadence, or pedal turns each minute. It is not BPM.",
  ],
  [
    "CSS",
    "Critical Swim Speed: an individually estimated swim pace. The swim assessment shows CSS = (400 m time − 200 m time) ÷ 2, in seconds per 100 m. Record CSS manually; the app’s threshold view is read-only and does not write it automatically.",
  ],
  [
    "VO2",
    "Oxygen uptake; in this catalog, VO2 Max names high-intensity activityPlan sessions rather than a target unit.",
  ],
  [
    "%",
    "A percentage target is anchored to your own named baseline: %FTP uses FTP, %THR uses threshold heart rate, and %HRmax uses maximum heart rate. Those baselines are not interchangeable.",
  ],
  ["min; sec", "Minutes; seconds. For example, 2min 30sec is two minutes and 30 seconds."],
  ["m; km", "Metres; kilometres. Reps means repetitions, a count rather than time or distance."],
  [
    "Pace notation",
    "5:00/km means five minutes per kilometre. The CSS assessment uses seconds/100 m; both express time per distance.",
  ],
  ["5K", "Five kilometres."],
] as const;

function CompleteBookGlossaryPage({
  geometry,
  pageNumber,
}: {
  geometry: ActivityPlanDistanceCatalogGeometry;
  pageNumber: number;
}) {
  return (
    <Page id="glossary" size={catalogPageSize(geometry)} style={styles.bookFront} wrap>
      <Text style={styles.bookFrontTitle}>Glossary</Text>
      {GLOSSARY_ENTRIES.map(([term, definition]) => (
        <Text key={term} style={styles.glossaryEntry}>
          <Text style={styles.glossaryTerm}>{term}: </Text>
          {definition}
        </Text>
      ))}
      <CatalogPageNumber pageNumber={pageNumber} />
    </Page>
  );
}

export function getDistanceCatalogConversionValue(reference: number, percentage: number): number {
  return Math.round((reference * percentage) / 100);
}

function CompleteBookConversionPage({
  anchor,
  geometry,
  pageNumber,
  percentages,
  reference,
}: {
  anchor: string;
  geometry: ActivityPlanDistanceCatalogGeometry;
  pageNumber: number;
  percentages: readonly number[];
  reference: ConversionReference;
}) {
  const isHeartRate = reference === "heart-rate";
  const references = isHeartRate
    ? Array.from({ length: 11 }, (_, index) => 120 + index * 10)
    : Array.from({ length: 17 }, (_, index) => 100 + index * 25);
  const title = isHeartRate ? "Heart-rate conversion" : "FTP conversion";
  const range = `${percentages[0]}–${percentages.at(-1)}%`;
  // 9 pt numeric cells retain enough room for 750 W at 1 pt horizontal
  // padding. Percentage labels intentionally use two centered lines so their
  // percent sign does not force a narrower value column.
  const referenceCellWidth = isHeartRate ? "10%" : "9%";
  const valueCellWidth = `${(isHeartRate ? 90 : 91) / percentages.length}%`;
  return (
    <Page id={anchor} size={catalogPageSize(geometry)} style={styles.bookFront} wrap>
      <Text style={styles.bookFrontTitle}>
        {title} · {range}
      </Text>
      <View style={styles.conversionTable} wrap={false}>
        <View style={styles.conversionRow}>
          <Text
            style={[
              styles.conversionCell,
              styles.conversionHeaderCell,
              { width: referenceCellWidth },
            ]}
          >
            {isHeartRate ? "HR" : "Watts"}
          </Text>
          {percentages.map((percentage) => (
            <Text
              key={percentage}
              style={[
                styles.conversionCell,
                styles.conversionHeaderCell,
                { width: valueCellWidth },
              ]}
            >
              {percentage}
              {"\n"}%
            </Text>
          ))}
        </View>
        {references.map((referenceValue) => (
          <View key={referenceValue} style={styles.conversionRow}>
            <Text
              style={[
                styles.conversionCell,
                styles.conversionReferenceCell,
                { width: referenceCellWidth },
              ]}
            >
              {referenceValue}
            </Text>
            {percentages.map((percentage) => (
              <Text
                key={percentage}
                style={[
                  styles.conversionCell,
                  styles.conversionValueCell,
                  { width: valueCellWidth },
                ]}
              >
                {getDistanceCatalogConversionValue(referenceValue, percentage)}
              </Text>
            ))}
          </View>
        ))}
      </View>
      <CatalogPageNumber pageNumber={pageNumber} />
    </Page>
  );
}

export function ActivityPlanDistanceCatalogCompleteBookDocument({
  coverLogoDataUri,
  geometry = "landscape",
  plan,
  prescriptionPlacementByStepId = new Map(),
  trainingPages,
}: {
  /** Node exporter-owned data URI; the browser document module never reads the asset from disk. */
  coverLogoDataUri: string;
  fragments: readonly ActivityPlanCatalogFragment[];
  geometry?: ActivityPlanDistanceCatalogGeometry;
  plan: ActivityPlanDistanceCatalogCompleteBookPlan;
  prescriptionPlacementByStepId?: ActivityPlanDistanceCatalogPrescriptionPlacementByStepId;
  trainingPages: readonly {
    plan: ActivityPlanCatalogTrainingPlan;
    week: ActivityPlanCatalogTrainingWeek;
  }[];
}) {
  return (
    <Document
      author="GradientPeak"
      title="GradientPeak complete activityPlan catalog — review edition"
    >
      <Page size={catalogPageSize(geometry)} style={styles.bookCover} wrap>
        <Image src={coverLogoDataUri} style={styles.bookCoverLogo} />
      </Page>
      {plan.contentsPages.map((entries, index) => (
        <CompleteBookContentsPage
          entries={entries}
          geometry={geometry}
          index={index}
          key={entries[0]?.anchor ?? `contents-page-${index + 1}`}
          pageNumber={index + 2}
          total={plan.contentsPages.length}
        />
      ))}
      {COMPLETE_BOOK_ALL_GUIDE_PAGES.map((guide, index) => {
        if (guide.kind === "conversion")
          return (
            <CompleteBookConversionPage
              anchor={`conversion-${guide.reference}-${guide.percentages[0]}`}
              geometry={geometry}
              key={`conversion-${guide.reference}-${guide.percentages[0]}`}
              pageNumber={plan.guideFirstPageNumber + index}
              percentages={guide.percentages}
              reference={guide.reference}
            />
          );
        if (guide.kind === "glossary")
          return (
            <CompleteBookGlossaryPage
              geometry={geometry}
              key="glossary"
              pageNumber={plan.guideFirstPageNumber + index}
            />
          );
        return (
          <CompleteBookGuidePage
            anchor="user-guide"
            geometry={geometry}
            key={guide.sections[0]?.heading ?? `guide-page-${index + 1}`}
            pageNumber={plan.guideFirstPageNumber + index}
            sections={guide.sections}
            title={guide.title}
          />
        );
      })}
      {plan.chapters.flatMap((chapter) => [
        <CompleteBookChapterDivider
          anchor={`chapter-${chapter.type}`}
          geometry={geometry}
          key={`chapter-${chapter.type}`}
          pageNumber={chapter.pageNumber}
          title={chapter.title}
        />,
        ...chapter.slots.flatMap((slot) =>
          slot.contentFragments.map((fragment, fragmentIndex) => {
            const pageNumber = slot.firstPageNumber + fragmentIndex;
            return (
              <ActivityPlanDistanceCatalogActivityPlanPage
                {...(fragmentIndex === 0 ? { anchor: `activityPlan-${slot.activityPlanId}` } : {})}
                fragment={fragment}
                geometry={geometry}
                key={fragment.key}
                pageNumber={pageNumber}
                prescriptionPlacementByStepId={prescriptionPlacementByStepId}
              />
            );
          }),
        ),
      ])}
      {trainingPages.map(({ plan: trainingPlan, week }, index) => (
        <ActivityPlanDistanceCatalogTrainingPage
          anchor={`training-${trainingPlan.id}`}
          geometry={geometry}
          key={`${trainingPlan.id}-${week.weekIndex}`}
          pageNumber={plan.trainingStartPageNumber + index}
          plan={trainingPlan}
          week={week}
          activityPlanPageNumbers={plan.activityPlanPageNumbers}
        />
      ))}
      <Page size={catalogPageSize(geometry)} style={styles.bookBack} wrap>
        <Image src={coverLogoDataUri} style={styles.bookCoverLogo} />
      </Page>
    </Document>
  );
}

export function ActivityPlanDistanceCatalogDocument({
  fragments,
  geometry = "landscape",
  prescriptionPlacementByStepId = new Map(),
  trainingPages,
}: {
  fragments: readonly ActivityPlanCatalogFragment[];
  geometry?: ActivityPlanDistanceCatalogGeometry;
  prescriptionPlacementByStepId?: ActivityPlanDistanceCatalogPrescriptionPlacementByStepId;
  trainingPages: readonly {
    plan: ActivityPlanCatalogTrainingPlan;
    week: ActivityPlanCatalogTrainingWeek;
  }[];
}) {
  return (
    <Document
      title="GradientPeak activity-plan catalog — styled distance-reading edition"
      author="GradientPeak"
    >
      {fragments.map((fragment, index) => (
        <ActivityPlanDistanceCatalogActivityPlanPage
          fragment={fragment}
          geometry={geometry}
          key={fragment.key}
          pageNumber={index + 1}
          prescriptionPlacementByStepId={prescriptionPlacementByStepId}
        />
      ))}
      {trainingPages.map(({ plan, week }, index) => (
        <ActivityPlanDistanceCatalogTrainingPage
          key={`${plan.id}-${week.weekIndex}`}
          geometry={geometry}
          pageNumber={fragments.length + index + 1}
          plan={plan}
          week={week}
        />
      ))}
    </Document>
  );
}
