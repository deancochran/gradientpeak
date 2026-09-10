import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ActivityPlanPrintGroup, ActivityPlanPrintModel } from "@repo/core/activity-plan";
import {
  ACTIVITY_PLAN_CATALOG_PAGE_SIZE,
  ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY,
  type ActivityPlanCatalogEntry,
  type ActivityPlanCatalogLayout,
  type ActivityPlanCatalogPathwayPage,
  activityPlanCatalogNeedsBlankBeforeBackCover,
  getActivityPlanCatalogContentPageCount,
  getActivityPlanCatalogInteriorMargins,
  getActivityPlanCatalogWorksheetStartPage,
  isActivityPlanTwoUpEligible,
} from "./activity-plan-catalog";
import { GradientPeakPdfBrand } from "./activity-plan-pdf-document";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#111827",
    fontFamily: "Helvetica",
    paddingBottom: 30,
    paddingLeft: 48,
    paddingRight: 30,
    paddingTop: 60,
  },
  recto: { paddingLeft: 48, paddingRight: 30 },
  verso: { paddingLeft: 30, paddingRight: 48 },
  cover: {
    backgroundColor: "#0f172a",
    color: "#ffffff",
    display: "flex",
    fontFamily: "Helvetica",
    justifyContent: "space-between",
    padding: 54,
  },
  coverKicker: { color: "#7dd3fc", fontSize: 11, letterSpacing: 1.8, marginBottom: 14 },
  coverTitle: { fontSize: 42, fontWeight: 700, lineHeight: 1.05, maxWidth: 410 },
  coverSubtitle: { color: "#cbd5e1", fontSize: 15, lineHeight: 1.45, marginTop: 20, maxWidth: 430 },
  coverMeta: { color: "#94a3b8", fontSize: 10, lineHeight: 1.5 },
  backCover: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    display: "flex",
    fontFamily: "Helvetica",
    justifyContent: "center",
    padding: 54,
    textAlign: "center",
  },
  backCoverBody: { color: "#cbd5e1", fontSize: 11, lineHeight: 1.5, marginTop: 18 },
  blankPage: { backgroundColor: "#ffffff" },
  header: {
    alignItems: "center",
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 0.7,
    display: "flex",
    flexDirection: "row",
    height: 28,
    justifyContent: "space-between",
    left: 32,
    position: "absolute",
    right: 32,
    top: 20,
  },
  headerSection: { color: "#475569", fontSize: 9.5, textAlign: "center" },
  headerNumber: { color: "#475569", fontSize: 9.5, minWidth: 28, textAlign: "right" },
  footer: {
    bottom: 12,
    color: "#94a3b8",
    fontSize: 8,
    left: 32,
    position: "absolute",
    right: 32,
    textAlign: "center",
  },
  frontTitle: { fontSize: 26, fontWeight: 700, marginBottom: 20 },
  frontHeading: { fontSize: 14, fontWeight: 700, marginBottom: 7, marginTop: 15 },
  frontBody: { color: "#334155", fontSize: 10.5, lineHeight: 1.45, marginBottom: 7 },
  frontRule: { borderBottomColor: "#e2e8f0", borderBottomWidth: 0.8, marginVertical: 10 },
  contentsColumns: { display: "flex", flexDirection: "row" },
  contentsColumn: { width: "50%" },
  contentsColumnLeft: { paddingRight: 13 },
  contentsColumnRight: { paddingLeft: 13 },
  contentsSection: {
    color: "#0369a1",
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 4,
    marginTop: 8,
  },
  contentsRow: {
    alignItems: "baseline",
    borderBottomColor: "#f1f5f9",
    borderBottomWidth: 0.5,
    color: "#334155",
    display: "flex",
    flexDirection: "row",
    fontSize: 8.8,
    justifyContent: "space-between",
    paddingBottom: 1.7,
    paddingTop: 1.7,
    textDecoration: "none",
  },
  contentsName: { paddingRight: 5, width: "88%" },
  contentsNumber: { textAlign: "right", width: "12%" },
  finderGrid: { display: "flex", flexDirection: "row", flexWrap: "wrap" },
  finderItem: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 0.7,
    marginBottom: 14,
    paddingBottom: 10,
    paddingRight: 12,
    width: "50%",
  },
  finderLabel: { color: "#0369a1", fontSize: 11, fontWeight: 700, marginBottom: 3 },
  discoveryColumns: { display: "flex", flexDirection: "row" },
  discoveryColumn: { width: "50%" },
  discoveryEntry: {
    borderBottomColor: "#f1f5f9",
    borderBottomWidth: 0.5,
    marginBottom: 3,
    paddingBottom: 3,
  },
  discoveryMeta: { color: "#64748b", fontSize: 7.2, lineHeight: 1.2 },
  discoveryName: { color: "#334155", fontSize: 8.1, lineHeight: 1.15 },
  pathwayFamily: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 0.8,
    marginBottom: 18,
    paddingBottom: 12,
  },
  pathwayLevel: { alignItems: "baseline", display: "flex", flexDirection: "row", marginTop: 5 },
  pathwayLevelName: { color: "#334155", fontSize: 9, width: "80%" },
  pathwayLevelTag: { color: "#64748b", fontSize: 8, textTransform: "uppercase", width: "20%" },
  worksheetLine: {
    borderBottomColor: "#94a3b8",
    borderBottomWidth: 0.7,
    height: 25,
    marginBottom: 9,
  },
  worksheetLabel: { color: "#475569", fontSize: 9, marginBottom: 3 },
  worksheetTable: { borderColor: "#cbd5e1", borderWidth: 0.7, marginTop: 10 },
  worksheetRow: { borderBottomColor: "#e2e8f0", borderBottomWidth: 0.6, height: 25 },
  slot: {
    borderColor: "#dbe3ec",
    borderRadius: 6,
    borderWidth: 0.8,
    height: ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.slotHeight,
    padding: ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.slotPadding,
  },
  secondSlot: { marginTop: ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.slotGap },
  fullCard: { paddingHorizontal: 2 },
  planHeadingRow: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  planTitle: { fontSize: 17, fontWeight: 700, lineHeight: 1.1, paddingRight: 8, width: "72%" },
  planMeta: { color: "#475569", fontSize: 9, marginTop: 2, textAlign: "right", width: "28%" },
  planDescription: { color: "#334155", fontSize: 9.5, lineHeight: 1.3, marginTop: 5 },
  profile: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 4,
    borderWidth: 0.7,
    display: "flex",
    flexDirection: "row",
    height: 86,
    marginBottom: 13,
    marginTop: 12,
    padding: 5,
  },
  compactProfile: { height: 66, marginBottom: 8, marginTop: 7, padding: 4 },
  profileBar: { alignSelf: "flex-end", borderRadius: 1, minWidth: 1 },
  section: {
    borderBottomColor: "#e5e7eb",
    borderBottomWidth: 0.6,
    marginBottom: 9,
    paddingBottom: 7,
  },
  compactSection: {
    borderBottomColor: "#e5e7eb",
    borderBottomWidth: 0.5,
    marginBottom: 5,
    paddingBottom: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 5, textTransform: "uppercase" },
  compactSectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  group: { marginBottom: 5 },
  compactGroup: { marginBottom: 3 },
  repeatedGroup: { borderLeftColor: "#94a3b8", borderLeftWidth: 1.2, paddingLeft: 6 },
  groupTitle: { fontSize: 9.8, marginBottom: 3 },
  compactGroupTitle: { fontSize: 8.8, fontWeight: 700, marginBottom: 2 },
  step: { marginBottom: 4 },
  compactStep: { marginBottom: 2 },
  instruction: { fontSize: 10.3, lineHeight: 1.3 },
  compactInstruction: { fontSize: 9.2, lineHeight: 1.2 },
  stepName: { fontWeight: 700 },
  note: { color: "#64748b", fontSize: 9, lineHeight: 1.3, marginTop: 1.5 },
  compactNote: { color: "#64748b", fontSize: 8.2, lineHeight: 1.18, marginTop: 1 },
  compactInlineNote: { color: "#64748b", fontSize: 8.2, fontWeight: 400 },
  preflightMarker: { color: "#ffffff", fontSize: 1, lineHeight: 1 },
});

const WORKSHEETS = [
  [
    "Weekly plan worksheet",
    [
      "Week of",
      "Primary objective",
      "Planned sessions",
      "What changed",
      "Review and next decision",
    ],
  ],
  [
    "Endurance session log",
    [
      "Date and plan",
      "Conditions and route/pool",
      "Completed work",
      "Observed response",
      "Next-session note",
    ],
  ],
  [
    "Strength session log",
    [
      "Date and plan",
      "Movement and load",
      "Completed sets and repetitions",
      "Observed response",
      "Next-session note",
    ],
  ],
  [
    "Test & race results",
    [
      "Date and test/race",
      "Protocol or event",
      "Result",
      "Conditions",
      "Comparison and next decision",
    ],
  ],
] as const satisfies readonly (readonly [string, readonly string[]])[];
const WORKSHEET_TABLE_ROWS = ["one", "two", "three", "four", "five", "six", "seven"] as const;

function isRecto(pageNumber: number): boolean {
  return pageNumber % 2 === 1;
}

function interiorPageStyle(pageNumber: number) {
  const margins = getActivityPlanCatalogInteriorMargins(pageNumber);
  return [styles.page, isRecto(pageNumber) ? styles.recto : styles.verso, margins];
}

function InteriorHeader({ pageNumber, section }: { pageNumber: number; section: string }) {
  const bindingInset = getActivityPlanCatalogInteriorMargins(pageNumber);
  return (
    <View fixed style={[styles.header, bindingInset]}>
      <GradientPeakPdfBrand size={14} />
      <Text style={styles.headerSection}>{section}</Text>
      <Text
        fixed
        render={({ pageNumber: renderedPageNumber }) => String(renderedPageNumber)}
        style={[styles.headerNumber, { marginRight: bindingInset.right }]}
      />
    </View>
  );
}

function InteriorFooter({ pageNumber }: { pageNumber: number }) {
  const bindingInset = getActivityPlanCatalogInteriorMargins(pageNumber);
  return (
    <Text fixed style={[styles.footer, bindingInset]}>
      GradientPeak Activity Plan Catalog
    </Text>
  );
}

function Profile({ compact, model }: { compact: boolean; model: ActivityPlanPrintModel }) {
  if (model.intensityProfile.length === 0) return null;
  return (
    <View style={[styles.profile, compact ? styles.compactProfile : {}]} wrap={false}>
      {model.intensityProfile.map((bar, index) => (
        <View
          key={bar.id}
          style={[
            styles.profileBar,
            {
              backgroundColor: bar.color,
              flexGrow: bar.weight,
              height: `${bar.heightPercent}%`,
              marginRight: index === model.intensityProfile.length - 1 ? 0 : 2,
              width: 1,
            },
          ]}
        />
      ))}
    </View>
  );
}

function Group({ compact, group }: { compact: boolean; group: ActivityPlanPrintGroup }) {
  const groupLabel =
    group.repetitions > 1
      ? [`${group.repetitions}×`, group.name].filter(Boolean).join(" ")
      : group.name;
  const normalizedGroupName = group.name?.trim().toLowerCase();
  return (
    <View
      style={[
        compact ? styles.compactGroup : styles.group,
        group.repetitions > 1 ? styles.repeatedGroup : {},
      ]}
    >
      {groupLabel ? (
        <Text style={compact ? styles.compactGroupTitle : styles.groupTitle}>
          {groupLabel}
          {compact && group.notes ? (
            <Text style={styles.compactInlineNote}> — {group.notes}</Text>
          ) : null}
        </Text>
      ) : null}
      {!compact && group.notes ? (
        <Text style={compact ? styles.compactNote : styles.note}>{group.notes}</Text>
      ) : null}
      {group.steps.map((step) => {
        const showStepName = step.name && step.name.trim().toLowerCase() !== normalizedGroupName;
        return (
          <View key={step.id} style={compact ? styles.compactStep : styles.step} wrap={false}>
            <Text style={compact ? styles.compactInstruction : styles.instruction}>
              {showStepName ? <Text style={styles.stepName}>{step.name}: </Text> : null}
              {step.instruction}
              {compact && step.description ? (
                <Text style={styles.compactInlineNote}> — {step.description}</Text>
              ) : null}
              {compact && step.notes ? (
                <Text style={styles.compactInlineNote}> — {step.notes}</Text>
              ) : null}
            </Text>
            {!compact && step.description ? (
              <Text style={styles.note}>{step.description}</Text>
            ) : null}
            {!compact && step.notes ? <Text style={styles.note}>{step.notes}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function PlanCard({ compact, entry }: { compact: boolean; entry: ActivityPlanCatalogEntry }) {
  const { model } = entry;
  return (
    <View id={`plan-${entry.key}`} style={compact ? {} : styles.fullCard} wrap={false}>
      <View style={styles.planHeadingRow} wrap={false}>
        <Text style={styles.planTitle}>{model.title}</Text>
        <Text style={styles.planMeta}>
          {[model.activityCategory.toUpperCase(), ...model.totals].join(" · ")}
        </Text>
      </View>
      {model.description ? <Text style={styles.planDescription}>{model.description}</Text> : null}
      <Profile compact={compact} model={model} />
      {model.sections.map((section) => (
        <View key={section.id} style={compact ? styles.compactSection : styles.section}>
          {section.name ? (
            <Text style={compact ? styles.compactSectionTitle : styles.sectionTitle}>
              {section.name}
              {compact && section.notes ? (
                <Text style={styles.compactInlineNote}> — {section.notes}</Text>
              ) : null}
            </Text>
          ) : null}
          {!compact && section.notes ? (
            <Text style={compact ? styles.compactNote : styles.note}>{section.notes}</Text>
          ) : null}
          {section.groups.map((group) => (
            <Group compact={compact} group={group} key={group.id} />
          ))}
        </View>
      ))}
      {model.notes ? (
        <Text style={compact ? styles.compactNote : styles.note}>{model.notes}</Text>
      ) : null}
      <Text style={styles.preflightMarker}>{`CATALOG-END-${entry.key}`}</Text>
    </View>
  );
}

function FrontMatterPage({
  children,
  pageNumber,
  section,
}: {
  children: React.ReactNode;
  pageNumber: number;
  section: string;
}) {
  return (
    <Page
      bookmark={section}
      size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE}
      style={interiorPageStyle(pageNumber)}
      wrap
    >
      <InteriorHeader pageNumber={pageNumber} section={section} />
      {children}
      <InteriorFooter pageNumber={pageNumber} />
    </Page>
  );
}

function getEntryPageNumbers(layout: ActivityPlanCatalogLayout): Map<string, number> {
  return new Map(
    layout.planPages.flatMap((page) => page.entries.map((entry) => [entry.key, page.pageNumber])),
  );
}

function DiscoveryIndexPage({
  layout,
  page,
  pageNumber,
}: {
  layout: ActivityPlanCatalogLayout;
  page: ActivityPlanCatalogLayout["discoveryPages"][number];
  pageNumber: number;
}) {
  const entryPageNumbers = getEntryPageNumbers(layout);
  const midpoint = Math.ceil(page.entries.length / 2);
  const columns = [page.entries.slice(0, midpoint), page.entries.slice(midpoint)];
  return (
    <FrontMatterPage pageNumber={pageNumber} section="Metadata discovery index">
      <Text style={styles.frontTitle}>Metadata discovery index</Text>
      <Text style={styles.frontBody}>
        This index includes every plan with authoritative portfolio metadata. Plans without
        portfolio metadata remain available in the main contents by activity category.
      </Text>
      <View style={styles.discoveryColumns}>
        {columns.map((entries, columnIndex) => (
          <View
            key={columnIndex === 0 ? "metadata-left" : "metadata-right"}
            style={[
              styles.discoveryColumn,
              columnIndex === 0 ? styles.contentsColumnLeft : styles.contentsColumnRight,
            ]}
          >
            {entries.map(({ entry, metadata }) => (
              <Link key={entry.key} src={`#plan-${entry.key}`} style={styles.discoveryEntry}>
                <Text style={styles.discoveryName}>
                  {entry.model.title} · {entryPageNumbers.get(entry.key)}
                </Text>
                <Text style={styles.discoveryMeta}>
                  {metadata.family} · {metadata.primaryPurpose} · {metadata.primaryIntensity} ·{" "}
                  {metadata.durationClass} · {metadata.difficulty}
                  {metadata.triathlonContext ? " · triathlon" : ""}
                </Text>
              </Link>
            ))}
          </View>
        ))}
      </View>
    </FrontMatterPage>
  );
}

function PathwayPage({
  layout,
  page,
  pageNumber,
}: {
  layout: ActivityPlanCatalogLayout;
  page: ActivityPlanCatalogPathwayPage;
  pageNumber: number;
}) {
  const entryPageNumbers = getEntryPageNumbers(layout);
  return (
    <FrontMatterPage pageNumber={pageNumber} section={page.title}>
      <Text style={styles.frontTitle}>{page.title}</Text>
      <Text style={styles.frontBody}>
        Each family groups plans by its validated ordered difficulty metadata: foundation,
        development, advanced, and race-specific.
      </Text>
      {page.families.map((family) => (
        <View key={family.family} style={styles.pathwayFamily}>
          <Text style={styles.frontHeading}>{family.label}</Text>
          {family.entries.map(({ entry, metadata }) => (
            <Link key={entry.key} src={`#plan-${entry.key}`} style={styles.pathwayLevel}>
              <Text style={styles.pathwayLevelName}>
                {entry.model.title} · p. {entryPageNumbers.get(entry.key)}
              </Text>
              <Text style={styles.pathwayLevelTag}>{metadata.difficulty}</Text>
            </Link>
          ))}
        </View>
      ))}
    </FrontMatterPage>
  );
}

function WorksheetPage({
  pageNumber,
  title,
  prompts,
}: {
  pageNumber: number;
  title: string;
  prompts: readonly string[];
}) {
  return (
    <FrontMatterPage pageNumber={pageNumber} section={title}>
      <Text style={styles.frontTitle}>{title}</Text>
      <Text style={styles.frontBody}>
        Record the plan as completed; retain the written session prescription as the source of
        truth.
      </Text>
      {prompts.map((prompt) => (
        <View key={prompt}>
          <Text style={styles.worksheetLabel}>{prompt}</Text>
          <View style={styles.worksheetLine} />
        </View>
      ))}
      <View style={styles.worksheetTable}>
        {WORKSHEET_TABLE_ROWS.map((row) => (
          <View key={row} style={styles.worksheetRow} />
        ))}
      </View>
    </FrontMatterPage>
  );
}

export function ActivityPlanCatalogPdfDocument({ layout }: { layout: ActivityPlanCatalogLayout }) {
  const entryPageNumbers = getEntryPageNumbers(layout);
  const discoveryStartPage = 4;
  const pathwayStartPage = discoveryStartPage + layout.discoveryPages.length;
  const referenceStartPage = pathwayStartPage + layout.pathways.length;
  const contentsStartPage = referenceStartPage + 2;
  const worksheetStartPage = getActivityPlanCatalogWorksheetStartPage(layout);

  return (
    <Document
      author="GradientPeak"
      keywords="activity plans, cycling, running, swimming, strength, training"
      language="en"
      pageMode="useOutlines"
      subject="Structured activity plan catalog"
      title="GradientPeak Activity Plan Catalog"
    >
      <Page bookmark="Front cover" size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE} style={styles.cover} wrap>
        <View>
          <View>
            <GradientPeakPdfBrand color="#ffffff" size={28} />
          </View>
          <View style={{ marginTop: 130 }}>
            <Text style={styles.coverKicker}>ACTIVITY PLAN CATALOG</Text>
            <Text style={styles.coverTitle}>Train with purpose.</Text>
            <Text style={styles.coverSubtitle}>
              Structured cycling, running, swimming, strength, cross-training, and multisport
              sessions from GradientPeak.
            </Text>
          </View>
        </View>
        <Text style={styles.coverMeta}>
          {layout.sections.reduce((total, section) => total + section.entries.length, 0)} authored
          activity plans{"\n"}gradientpeak.app
        </Text>
      </Page>

      <FrontMatterPage pageNumber={2} section="Publication information">
        <Text style={styles.frontTitle}>Credits & attribution</Text>
        <Text style={styles.frontHeading}>Published by GradientPeak</Text>
        <Text style={styles.frontBody}>
          Activity-plan design, editorial preparation, visual design, and catalog production by
          GradientPeak.
        </Text>
        <View style={styles.frontRule} />
        <Text style={styles.frontHeading}>Methodology</Text>
        <Text style={styles.frontBody}>
          Each plan presents an authored session structure with calculated totals and a visual
          intensity profile. Targets are shown as authored and are not personalized to an individual
          athlete.
        </Text>
        <Text style={styles.frontHeading}>Safety</Text>
        <Text style={styles.frontBody}>
          These plans are general training examples, not medical advice. Adapt duration and
          intensity to your fitness, experience, conditions, and available equipment. Stop if you
          experience pain, dizziness, or unusual symptoms and seek qualified professional advice
          when appropriate.
        </Text>
        <Text style={styles.frontHeading}>Use and attribution</Text>
        <Text style={styles.frontBody}>
          © GradientPeak. All rights reserved. Product names and marks belong to their respective
          owners. No governing-body accreditation or endorsement is implied.
        </Text>
        <Text style={styles.frontHeading}>Digital edition</Text>
        <Text style={styles.frontBody}>
          gradientpeak.app · Generated from the current system activity-plan catalog.
        </Text>
      </FrontMatterPage>

      <FrontMatterPage pageNumber={3} section="Quick workout finder">
        <Text style={styles.frontTitle}>Quick workout finder</Text>
        <Text style={styles.frontBody}>
          Begin with the session purpose and available time, then confirm the full written sequence
          and totals on its catalog page.
        </Text>
        <View style={styles.finderGrid}>
          <View style={styles.finderItem}>
            <Text style={styles.finderLabel}>Choose an activity</Text>
            <Text style={styles.frontBody}>
              Use the main contents for cycling, running, swimming, strength, cross-training,
              recovery, and multisport programmes.
            </Text>
          </View>
          <View style={styles.finderItem}>
            <Text style={styles.finderLabel}>Filter authored metadata</Text>
            <Text style={styles.frontBody}>
              Use the discovery index for family, primary purpose, intensity, duration class,
              difficulty, and triathlon context where supplied.
            </Text>
          </View>
          <View style={styles.finderItem}>
            <Text style={styles.finderLabel}>Browse ordered families</Text>
            <Text style={styles.frontBody}>
              Use the guided pathways for {layout.pathways.flatMap((page) => page.families).length}{" "}
              configured families with ordered difficulty metadata.
            </Text>
          </View>
          <View style={styles.finderItem}>
            <Text style={styles.finderLabel}>Check the prescription</Text>
            <Text style={styles.frontBody}>
              The plan page—not this finder—contains the authoritative work, recovery, targets, and
              notes.
            </Text>
          </View>
        </View>
      </FrontMatterPage>

      {layout.discoveryPages.map((page, index) => (
        <DiscoveryIndexPage
          key={page.key}
          layout={layout}
          page={page}
          pageNumber={discoveryStartPage + index}
        />
      ))}

      {layout.pathways.map((page, index) => (
        <PathwayPage
          key={page.key}
          layout={layout}
          page={page}
          pageNumber={pathwayStartPage + index}
        />
      ))}

      <FrontMatterPage pageNumber={referenceStartPage} section="Intensity language">
        <Text style={styles.frontTitle}>Intensity language</Text>
        <Text style={styles.frontHeading}>Read targets in context</Text>
        <Text style={styles.frontBody}>
          FTP means functional threshold power. Max HR means maximum heart rate. Threshold HR means
          lactate-threshold heart rate. RPE is rating of perceived exertion.
        </Text>
        <Text style={styles.frontHeading}>Read the profile as an overview</Text>
        <Text style={styles.frontBody}>
          Taller bars represent higher relative intensity; pale bars identify recovery or
          unavailable intensity. The written sequence remains authoritative.
        </Text>
        <Text style={styles.frontHeading}>Confirm individual reference points</Text>
        <Text style={styles.frontBody}>
          Confirm personal zones before using percentage-based targets. A label describes the
          authored session language, not an individualized assessment.
        </Text>
      </FrontMatterPage>

      <FrontMatterPage pageNumber={referenceStartPage + 1} section="Scaling & recovery decisions">
        <Text style={styles.frontTitle}>Scaling & recovery decisions</Text>
        <Text style={styles.frontHeading}>Scale the session, not the intent</Text>
        <Text style={styles.frontBody}>
          Reduce repetitions, duration, distance, or target intensity when needed. Preserve the
          intended relationship between work and recovery rather than forcing an unsuitable target.
        </Text>
        <Text style={styles.frontHeading}>Use current readiness</Text>
        <Text style={styles.frontBody}>
          Consider fitness, experience, conditions, available equipment, and response to recent
          training. Defer or stop a session when pain, dizziness, or unusual symptoms occur; seek
          qualified professional advice when appropriate.
        </Text>
        <Text style={styles.frontHeading}>Record the decision</Text>
        <Text style={styles.frontBody}>
          Use the worksheets to note what changed and how the session felt before selecting the next
          workout.
        </Text>
      </FrontMatterPage>

      {layout.contentsPages.map(({ columns, key }, contentsPageIndex) => (
        <FrontMatterPage
          key={key}
          pageNumber={contentsStartPage + contentsPageIndex}
          section="Contents"
        >
          <Text style={styles.frontTitle}>
            Contents · {contentsPageIndex + 1} of {layout.contentsPages.length}
          </Text>
          <View style={styles.contentsColumns}>
            {columns.map((section, columnIndex) => (
              <View
                key={columnIndex === 0 ? "contents-left" : "contents-right"}
                style={[
                  styles.contentsColumn,
                  columnIndex === 0 ? styles.contentsColumnLeft : styles.contentsColumnRight,
                ]}
              >
                {section ? (
                  <View key={`${section.key}-${section.title}`}>
                    <Text style={styles.contentsSection}>{section.title}</Text>
                    {section.entries.map((entry) => (
                      <Link key={entry.key} src={`#plan-${entry.key}`} style={styles.contentsRow}>
                        <Text style={styles.contentsName}>{entry.model.title}</Text>
                        <Text style={styles.contentsNumber}>{entryPageNumbers.get(entry.key)}</Text>
                      </Link>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </FrontMatterPage>
      ))}

      {layout.planPages.map((catalogPage) => (
        <Page
          bookmark={catalogPage.sectionTitle}
          key={`${catalogPage.sectionKey}-${catalogPage.pageNumber}`}
          size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE}
          style={interiorPageStyle(catalogPage.pageNumber)}
          wrap
        >
          <InteriorHeader pageNumber={catalogPage.pageNumber} section={catalogPage.sectionTitle} />
          {catalogPage.entries.length === 1 ? (
            <PlanCard
              compact={!isActivityPlanTwoUpEligible(catalogPage.entries[0].model)}
              entry={catalogPage.entries[0]}
            />
          ) : (
            catalogPage.entries.map((entry, index) => (
              <View
                key={entry.key}
                style={[styles.slot, index === 1 ? styles.secondSlot : {}]}
                wrap={false}
              >
                <PlanCard compact entry={entry} />
              </View>
            ))
          )}
          <InteriorFooter pageNumber={catalogPage.pageNumber} />
        </Page>
      ))}

      {WORKSHEETS.map(([title, prompts], index) => (
        <WorksheetPage
          key={title}
          pageNumber={worksheetStartPage + index}
          prompts={prompts}
          title={title}
        />
      ))}

      {activityPlanCatalogNeedsBlankBeforeBackCover(layout) ? (
        <Page size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE} style={styles.blankPage} />
      ) : null}

      <Page
        bookmark="Back cover"
        size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE}
        style={styles.backCover}
        wrap
      >
        <GradientPeakPdfBrand color="#ffffff" size={28} />
        <Text style={styles.backCoverBody}>
          Structured training for deliberate progress.{"\n"}gradientpeak.app
        </Text>
      </Page>
    </Document>
  );
}

export function getActivityPlanCatalogExpectedPageCount(layout: ActivityPlanCatalogLayout): number {
  return (
    getActivityPlanCatalogContentPageCount(layout) +
    (activityPlanCatalogNeedsBlankBeforeBackCover(layout) ? 1 : 0) +
    1
  );
}
