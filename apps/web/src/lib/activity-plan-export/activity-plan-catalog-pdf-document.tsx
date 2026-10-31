import { Document, Link, Page, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ActivityPlanPrintGroup, ActivityPlanPrintModel } from "@repo/core/activity-plan";
import {
  ACTIVITY_PLAN_CATALOG_PAGE_SIZE,
  type ActivityPlanCatalogFragment,
  type ActivityPlanCatalogLayout,
  type ActivityPlanCatalogTrainingPlan,
  type ActivityPlanCatalogTrainingWeek,
  activityPlanCatalogNeedsBlankBeforeBackCover,
  formatActivityPlanCatalogDuration,
  formatActivityPlanCatalogInstruction,
  formatActivityPlanCatalogTotal,
  getActivityPlanCatalogContentPageCount,
  getActivityPlanCatalogInteriorMargins,
  getActivityPlanCatalogTimedProfileWidths,
} from "./activity-plan-catalog";
import { GradientPeakPdfBrand } from "./activity-plan-pdf-document";

const GRADIENTPEAK_PDF_FONT_FAMILY = "GradientPeakCatalogSans";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#111827",
    fontFamily: GRADIENTPEAK_PDF_FONT_FAMILY,
    fontFeatureSettings: { liga: false, dlig: false },
    paddingBottom: 42,
    paddingLeft: 52.2,
    paddingRight: 27,
    paddingTop: 62,
  },
  recto: { paddingLeft: 52.2, paddingRight: 27 },
  verso: { paddingLeft: 27, paddingRight: 52.2 },
  cover: {
    backgroundColor: "#0f172a",
    color: "#ffffff",
    display: "flex",
    fontFamily: GRADIENTPEAK_PDF_FONT_FAMILY,
    fontFeatureSettings: { liga: false, dlig: false },
    justifyContent: "space-between",
    paddingBottom: 27,
    paddingLeft: 52.2,
    paddingRight: 27,
    paddingTop: 30,
  },
  coverKicker: { color: "#7dd3fc", fontSize: 11, letterSpacing: 1.8, marginBottom: 14 },
  coverTitle: { fontSize: 31, fontWeight: 700, lineHeight: 1.05, maxWidth: 300 },
  coverSubtitle: { color: "#cbd5e1", fontSize: 11, lineHeight: 1.45, marginTop: 14, maxWidth: 300 },
  coverMeta: { color: "#94a3b8", fontSize: 10, lineHeight: 1.5 },
  backCover: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    display: "flex",
    fontFamily: GRADIENTPEAK_PDF_FONT_FAMILY,
    fontFeatureSettings: { liga: false, dlig: false },
    justifyContent: "center",
    paddingBottom: 27,
    paddingLeft: 27,
    paddingRight: 52.2,
    paddingTop: 27,
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
    left: 27,
    position: "absolute",
    right: 27,
    top: 27,
  },
  headerSection: { color: "#475569", fontSize: 9.5, textAlign: "center" },
  headerNumber: { color: "#475569", fontSize: 9.5, minWidth: 28, textAlign: "right" },
  footer: {
    // Preserve the quiet area even after the press converter rewrites font metrics.
    bottom: 30,
    color: "#94a3b8",
    fontSize: 8,
    left: 27,
    position: "absolute",
    right: 27,
    textAlign: "center",
  },
  frontTitle: { fontSize: 20, fontWeight: 700, marginBottom: 13 },
  frontHeading: { fontSize: 12, fontWeight: 700, marginBottom: 5, marginTop: 11 },
  frontBody: { color: "#334155", fontSize: 10, lineHeight: 1.38, marginBottom: 6 },
  frontRule: { borderBottomColor: "#e2e8f0", borderBottomWidth: 0.8, marginVertical: 10 },
  contentsColumns: { display: "flex", flexDirection: "row" },
  contentsColumn: { width: "50%" },
  contentsColumnLeft: { paddingRight: 8 },
  contentsColumnRight: { paddingLeft: 8 },
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
  contentsName: { paddingRight: 5, width: "84%" },
  contentsNumber: { textAlign: "right", width: "16%" },
  finderIndex: { display: "flex", flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  finderItem: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 0.7,
    marginBottom: 10,
    paddingBottom: 8,
    paddingRight: 14,
    textDecoration: "none",
    width: "50%",
  },
  finderTitle: { color: "#0369a1", fontSize: 11.5, fontWeight: 700, marginBottom: 3 },
  finderMeta: { color: "#475569", fontSize: 9, lineHeight: 1.3 },
  finderTraining: { marginTop: 4, width: "100%" },
  fullCard: { paddingHorizontal: 2 },
  planTitle: { fontSize: 15, fontWeight: 700, lineHeight: 1.1 },
  planMeta: {
    color: "#475569",
    fontSize: 8.2,
    lineHeight: 1.2,
    marginTop: 4,
  },
  planDescription: { color: "#334155", fontSize: 10, lineHeight: 1.3, marginTop: 5 },
  profile: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 4,
    borderWidth: 0.7,
    display: "flex",
    flexDirection: "row",
    height: 76,
    marginBottom: 9,
    marginTop: 8,
    padding: 5,
  },
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
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" },
  group: { marginBottom: 5 },
  repeatedGroup: { borderLeftColor: "#94a3b8", borderLeftWidth: 1.2, paddingLeft: 6 },
  groupTitle: { fontSize: 9.8, marginBottom: 3 },
  step: { marginBottom: 4 },
  instruction: { fontSize: 10, lineHeight: 1.3 },
  stepName: { fontWeight: 700 },
  stepDuration: { color: "#0f172a", fontWeight: 700 },
  stepTarget: { color: "#0369a1" },
  note: { color: "#64748b", fontSize: 8.5, lineHeight: 1.3, marginTop: 1.5 },
  trainingPlanList: { marginTop: 14 },
  trainingPlanListRow: {
    alignItems: "baseline",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 0.7,
    color: "#334155",
    display: "flex",
    flexDirection: "row",
    fontSize: 10,
    justifyContent: "space-between",
    paddingVertical: 8,
    textDecoration: "none",
  },
  trainingPlanListName: { fontWeight: 700, paddingRight: 8, width: "68%" },
  trainingPlanListMeta: { color: "#64748b", textAlign: "right", width: "32%" },
  trainingMetaRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", marginBottom: 9 },
  trainingMetaPill: {
    backgroundColor: "#e0f2fe",
    borderRadius: 8,
    color: "#075985",
    fontSize: 7.5,
    marginBottom: 4,
    marginRight: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    textTransform: "uppercase",
  },
  trainingFacts: { display: "flex", flexDirection: "row", marginBottom: 12 },
  trainingFact: {
    borderLeftColor: "#38bdf8",
    borderLeftWidth: 2,
    marginRight: 18,
    paddingLeft: 7,
  },
  trainingFactValue: { fontSize: 15, fontWeight: 700 },
  trainingFactLabel: { color: "#64748b", fontSize: 7.5, marginTop: 1 },
  trainingChart: {
    alignItems: "flex-end",
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 5,
    borderWidth: 0.7,
    display: "flex",
    flexDirection: "row",
    height: 82,
    marginBottom: 14,
    paddingHorizontal: 5,
    paddingTop: 8,
  },
  trainingChartColumn: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "flex-end",
    paddingHorizontal: 2,
  },
  trainingChartCount: { color: "#475569", fontSize: 6, marginBottom: 2 },
  trainingChartBar: { backgroundColor: "#38bdf8", borderRadius: 2, minHeight: 2, width: "72%" },
  trainingChartWeek: { color: "#64748b", fontSize: 6.5, marginTop: 2 },
  scheduleTitle: { color: "#0369a1", fontSize: 11, fontWeight: 700, marginBottom: 5 },
  scheduleTable: { borderColor: "#94a3b8", borderWidth: 0.7, marginBottom: 10 },
  scheduleRow: { display: "flex", flexDirection: "row" },
  scheduleHeader: { backgroundColor: "#f1f5f9", minHeight: 18 },
  scheduleWeekCell: {
    borderRightColor: "#cbd5e1",
    borderRightWidth: 0.5,
    color: "#475569",
    fontSize: 7.2,
    fontWeight: 700,
    padding: 3,
    width: "8%",
  },
  scheduleDayCell: {
    borderRightColor: "#cbd5e1",
    borderRightWidth: 0.5,
    padding: 3,
    width: "13.14%",
  },
  scheduleDayHeader: { color: "#475569", fontSize: 7.2, fontWeight: 700, textAlign: "center" },
  scheduleWeekRow: { borderTopColor: "#cbd5e1", borderTopWidth: 0.5, minHeight: 54 },
  scheduleSession: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 0.4,
    color: "#0f172a",
    marginBottom: 1,
    paddingBottom: 1,
    textDecoration: "none",
  },
  scheduleSessionTitle: { fontSize: 7.5, fontWeight: 700, lineHeight: 1.1 },
  scheduleSessionDetails: {
    alignItems: "baseline",
    display: "flex",
    flexDirection: "row",
    marginTop: 0.5,
  },
  scheduleSessionMetrics: { color: "#475569", fontSize: 7, lineHeight: 1.15 },
  scheduleSessionReference: {
    color: "#0369a1",
    fontSize: 6.8,
    lineHeight: 1.15,
    textAlign: "right",
  },
  scheduleDemandNote: { color: "#64748b", fontSize: 7.5, lineHeight: 1.3, marginBottom: 8 },
  activityKey: { display: "flex", flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  activityKeyItem: { marginBottom: 6, paddingRight: 12, width: "50%" },
  activityKeyName: { color: "#0f172a", fontSize: 7.2, fontWeight: 700 },
  activityKeyPage: { color: "#64748b", fontSize: 6.5, marginTop: 1 },
  preflightMarker: { color: "#ffffff", fontSize: 1, lineHeight: 1 },
});

function isRecto(pageNumber: number): boolean {
  return pageNumber % 2 === 1;
}

function interiorPageStyle(pageNumber: number) {
  return [styles.page, isRecto(pageNumber) ? styles.recto : styles.verso];
}

function InteriorHeader({ pageNumber, section }: { pageNumber: number; section: string }) {
  const bindingInset = getActivityPlanCatalogInteriorMargins(pageNumber);
  return (
    <View fixed style={[styles.header, bindingInset]}>
      <GradientPeakPdfBrand fontFamily={GRADIENTPEAK_PDF_FONT_FAMILY} size={14} />
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
      GRADIENTPEAK · ACTIVITY PLAN CATALOG
    </Text>
  );
}

export function ActivityPlanCatalogProfile({ model }: { model: ActivityPlanPrintModel }) {
  if (model.intensityProfile.length === 0) return null;
  const widths = getActivityPlanCatalogTimedProfileWidths(model.intensityProfile);
  return (
    <View style={[styles.profile, { flexDirection: "column" }]} wrap={false}>
      <Svg height={48} preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
        {
          model.intensityProfile.reduce<{ bars: React.ReactNode[]; offset: number }>(
            (result, bar, index) => {
              const width = widths ? (widths[index] ?? 0) : 100 / model.intensityProfile.length;
              result.bars.push(
                <Rect
                  fill={bar.color}
                  height={bar.heightPercent}
                  key={bar.id}
                  rx={1}
                  width={width}
                  x={result.offset}
                  y={100 - bar.heightPercent}
                />,
              );
              return { bars: result.bars, offset: result.offset + width };
            },
            { bars: [], offset: 0 },
          ).bars
        }
      </Svg>
    </View>
  );
}

function Group({
  activityCategory,
  continues,
  continuesAfter,
  group,
}: {
  activityCategory: string;
  continues: boolean;
  continuesAfter: boolean;
  group: ActivityPlanPrintGroup;
}) {
  const groupLabel =
    group.repetitions > 1
      ? `${group.repetitions}×${continues ? " · sequence continues" : ""}${continuesAfter ? " · continues next page" : ""}`
      : continues
        ? "Same sequence continues"
        : continuesAfter
          ? "Sequence continues on next page"
          : null;
  return (
    <View style={[styles.group, group.repetitions > 1 ? styles.repeatedGroup : {}]}>
      {groupLabel ? <Text style={styles.groupTitle}>{groupLabel}</Text> : null}
      {group.steps.map((step) => {
        const durationLabel = formatActivityPlanCatalogDuration(
          step.durationLabel ?? step.instruction,
        );
        const targetLabels = step.targetLabels ?? [];
        const cue = formatActivityPlanCatalogInstruction({ ...step, activityCategory });
        return (
          <View key={step.id} style={styles.step} wrap={false}>
            <Text style={styles.instruction}>
              {step.name ? <Text style={styles.stepName}>{step.name}</Text> : null}
              {step.name ? (
                <Text style={styles.stepDuration}> · {durationLabel}</Text>
              ) : (
                <Text style={styles.stepDuration}>{durationLabel}</Text>
              )}
              {targetLabels.length > 0 ? (
                <Text style={styles.stepTarget}> · {targetLabels.join(" · ")}</Text>
              ) : null}
            </Text>
            {cue ? <Text style={styles.note}>{cue}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function PlanCard({ fragment }: { fragment: ActivityPlanCatalogFragment }) {
  const { entry, model } = fragment;
  return (
    <View
      id={fragment.partIndex === 0 ? `plan-${entry.key}` : `plan-${fragment.key}`}
      style={styles.fullCard}
      wrap={false}
    >
      <Text style={styles.planTitle}>
        {model.title}
        {!fragment.showContext ? " (continued)" : ""}
      </Text>
      <Text style={styles.planMeta}>
        {model.totals.length
          ? model.totals.map(formatActivityPlanCatalogTotal).join(" · ")
          : "Open-ended session"}
      </Text>
      {fragment.showContext && model.description ? (
        <Text style={styles.planDescription}>{model.description}</Text>
      ) : null}
      {fragment.showContext ? <ActivityPlanCatalogProfile model={model} /> : null}
      {model.sections.map((section) => (
        <View key={section.id} style={styles.section}>
          {section.name ? <Text style={styles.sectionTitle}>{section.name}</Text> : null}
          {section.groups.map((group) => (
            <Group
              activityCategory={model.activityCategory}
              continues={fragment.continuedGroupIds.includes(group.id)}
              continuesAfter={fragment.continuesAfterGroupIds.includes(group.id)}
              group={group}
              key={group.id}
            />
          ))}
        </View>
      ))}
      <Text style={styles.preflightMarker}>{`CATALOG-END-${fragment.key}`}</Text>
    </View>
  );
}

/** One-page render target used by the exporter as the pagination authority. */
export function ActivityPlanCatalogMeasurementDocument({
  fragment,
}: {
  fragment: ActivityPlanCatalogFragment;
}) {
  return (
    <Document>
      <Page size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE} style={interiorPageStyle(1)} wrap>
        <InteriorHeader pageNumber={1} section="Activity catalog" />
        <PlanCard fragment={fragment} />
        <InteriorFooter pageNumber={1} />
      </Page>
    </Document>
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
    layout.planPages.flatMap((page) =>
      page.entries
        .filter((fragment) => fragment.partIndex === 0)
        .map((fragment) => [fragment.entry.key, page.pageNumber]),
    ),
  );
}

const TRAINING_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function TrainingScheduleChart({ plan }: { plan: ActivityPlanCatalogTrainingPlan }) {
  return (
    <View style={styles.trainingChart} wrap={false}>
      {plan.scheduleVisual.weeks.map((week) => (
        <View
          key={`chart-${plan.id}-${week.weekIndex}`}
          style={[
            styles.trainingChartColumn,
            { width: `${100 / plan.scheduleVisual.totalWeeks}%` },
          ]}
        >
          <Text style={styles.trainingChartCount}>{week.plannedSessionCount}</Text>
          <View
            style={[
              styles.trainingChartBar,
              { height: `${Math.max(4, week.relativeSessionVolume * 78)}%` },
            ]}
          />
          <Text style={styles.trainingChartWeek}>W{week.weekIndex + 1}</Text>
        </View>
      ))}
    </View>
  );
}

function TrainingScheduleTable({ weeks }: { weeks: readonly ActivityPlanCatalogTrainingWeek[] }) {
  if (weeks.length === 0) return null;
  return (
    <View style={styles.scheduleTable} wrap={false}>
      <View style={[styles.scheduleRow, styles.scheduleHeader]}>
        <View style={styles.scheduleWeekCell}>
          <Text>Week</Text>
        </View>
        {TRAINING_WEEKDAY_LABELS.map((day) => (
          <View key={day} style={styles.scheduleDayCell}>
            <Text style={styles.scheduleDayHeader}>{day}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week) => (
        <View
          key={`schedule-week-${week.weekIndex}`}
          style={[styles.scheduleRow, styles.scheduleWeekRow]}
        >
          <View style={styles.scheduleWeekCell}>
            <Text>{week.weekIndex + 1}</Text>
          </View>
          {TRAINING_WEEKDAY_LABELS.map((day, dayIndex) => (
            <View key={`${week.weekIndex}-${day}`} style={styles.scheduleDayCell}>
              {week.sessions
                .filter((session) => session.dayIndex === dayIndex)
                .map((session) => (
                  <Link
                    key={session.key}
                    src={`#plan-${session.activityPlanId}`}
                    style={styles.scheduleSession}
                  >
                    <Text style={styles.scheduleSessionTitle}>{session.title}</Text>
                    <View style={styles.scheduleSessionDetails}>
                      <Text style={[styles.scheduleSessionMetrics, { width: "72%" }]}>
                        {session.targetDurationMinutes ?? "—"} min ·{" "}
                        {session.targetCommonLoad ?? "—"} CL
                      </Text>
                      <Text style={[styles.scheduleSessionReference, { width: "28%" }]}>
                        p. {session.activityPageNumber}
                      </Text>
                    </View>
                  </Link>
                ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function TrainingPlanOverviewPage({ plan }: { plan: ActivityPlanCatalogTrainingPlan }) {
  return (
    <FrontMatterPage pageNumber={plan.overviewPageNumber} section="Training plan templates">
      <View id={`training-plan-${plan.id}`}>
        <Text style={styles.preflightMarker}>{`TRAINING-PLAN-OVERVIEW-${plan.id}`}</Text>
        <Text style={styles.frontTitle}>{plan.name}</Text>
        <View style={styles.trainingMetaRow}>
          {[...plan.activityCategories, ...plan.experienceLevels].map((label) => (
            <Text key={label} style={styles.trainingMetaPill}>
              {label}
            </Text>
          ))}
        </View>
        <Text style={styles.frontBody}>{plan.description}</Text>
        <View style={styles.trainingFacts}>
          <View style={styles.trainingFact}>
            <Text style={styles.trainingFactValue}>{plan.scheduleVisual.totalWeeks}</Text>
            <Text style={styles.trainingFactLabel}>AUTHORED WEEKS</Text>
          </View>
          <View style={styles.trainingFact}>
            <Text style={styles.trainingFactValue}>{plan.scheduleVisual.totalSessions}</Text>
            <Text style={styles.trainingFactLabel}>SCHEDULED SESSIONS</Text>
          </View>
          <View style={styles.trainingFact}>
            <Text style={styles.trainingFactValue}>{plan.sessionsPerWeekTarget}</Text>
            <Text style={styles.trainingFactLabel}>TARGET SESSIONS / WEEK</Text>
          </View>
        </View>
        <Text style={styles.scheduleTitle}>Weekly session distribution</Text>
        <TrainingScheduleChart plan={plan} />
        <Text style={styles.scheduleDemandNote}>
          The following schedule pages list every authored session objective as minutes / Common
          Load and link it to its first activity-catalog page. An em dash means no objective is
          authored; these are not athlete-specific resolved prescriptions.
        </Text>
      </View>
    </FrontMatterPage>
  );
}

function TrainingPlanSchedulePage({
  pageNumber,
  plan,
  weeks,
}: {
  pageNumber: number;
  plan: ActivityPlanCatalogTrainingPlan;
  weeks: readonly ActivityPlanCatalogTrainingWeek[];
}) {
  const distinctActivities = Array.from(
    new Map(
      plan.weeks
        .filter((week) => weeks.some((candidate) => candidate.weekIndex === week.weekIndex))
        .flatMap((week) => week.sessions)
        .map((session) => [session.activityPlanId, session]),
    ).values(),
  );
  return (
    <FrontMatterPage pageNumber={pageNumber} section="Training plan templates">
      <Text
        style={styles.preflightMarker}
      >{`TRAINING-PLAN-SCHEDULE-${plan.id}-${pageNumber}`}</Text>
      <Text style={styles.frontTitle}>{plan.name}</Text>
      <Text style={styles.scheduleTitle}>
        Weeks {(weeks[0]?.weekIndex ?? 0) + 1}–{(weeks.at(-1)?.weekIndex ?? 0) + 1}
      </Text>
      <Text style={styles.scheduleDemandNote}>
        Each entry lists its authored session objective as minutes / Common Load. An em dash means
        that no objective is authored; these are not athlete-specific resolved prescriptions.
      </Text>
      <TrainingScheduleTable weeks={weeks} />
      <Text style={styles.scheduleTitle}>Linked activity plans</Text>
      <View style={styles.activityKey}>
        {distinctActivities.map((activity) => (
          <View key={activity.activityPlanId} style={styles.activityKeyItem} wrap={false}>
            <Link src={`#plan-${activity.activityPlanId}`} style={styles.activityKeyName}>
              {activity.activityTitle}
            </Link>
            <Text style={styles.activityKeyPage}>
              Activity catalog · p. {activity.activityPageNumber}
            </Text>
          </View>
        ))}
      </View>
      {pageNumber === plan.schedulePageNumbers.at(-1) ? (
        <Text style={styles.note}>
          Session placement is relative to the selected plan start date. Bars show scheduled session
          count—not athlete-specific load, intensity, or progression.
        </Text>
      ) : null}
    </FrontMatterPage>
  );
}

export function ActivityPlanCatalogPdfDocument({ layout }: { layout: ActivityPlanCatalogLayout }) {
  const entryPageNumbers = getEntryPageNumbers(layout);
  const referenceStartPage = 4;
  const contentsStartPage = referenceStartPage + 2;

  return (
    <Document
      author="GradientPeak"
      keywords="activity plans, cycling, running, swimming, strength, training"
      language="en"
      pageMode="useOutlines"
      subject="Structured activity and training plan catalog"
      title="GradientPeak Activity & Training Plan Catalog"
    >
      <Page bookmark="Front cover" size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE} style={styles.cover} wrap>
        <View>
          <View>
            <GradientPeakPdfBrand
              color="#ffffff"
              fontFamily={GRADIENTPEAK_PDF_FONT_FAMILY}
              size={28}
            />
          </View>
          <View style={{ marginTop: 130 }}>
            <Text style={styles.coverKicker}>ACTIVITY & TRAINING PLAN CATALOG</Text>
            <Text style={styles.coverTitle}>Train with{"\n"}purpose.</Text>
            <Text style={styles.coverSubtitle}>
              Structured cycling, running, swimming, strength, cross-training, and multisport
              sessions from GradientPeak.
            </Text>
          </View>
        </View>
        <Text style={styles.coverMeta}>
          {layout.sections.reduce((total, section) => total + section.entries.length, 0)} authored
          activity plans · {layout.trainingPlanSection?.plans.length ?? 0} training templates
          {"\n"}gradientpeak.app
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
          Each plan presents an authored session structure and prescribed-volume totals. Timed
          subtotals exclude any open-ended work. Targets are shown as authored and are not
          personalized to an individual athlete.
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

      <FrontMatterPage pageNumber={3} section="Quick activity-plan finder">
        <Text style={styles.frontTitle}>Quick activity-plan finder</Text>
        <Text style={styles.frontBody}>
          Start with an activity family, then use its linked first page to scan complete written
          prescriptions, calculated totals, and intensity profiles.
        </Text>
        <View style={styles.finderIndex}>
          {layout.finderSections.map((section) => (
            <Link
              key={section.key}
              src={`#plan-${section.firstEntryKey}`}
              style={styles.finderItem}
            >
              <Text style={styles.finderTitle}>{section.title}</Text>
              <Text style={styles.finderMeta}>
                {section.entryCount} activity plans · pp. {section.startPageNumber}–
                {section.endPageNumber}
              </Text>
            </Link>
          ))}
          {layout.trainingPlanSection ? (
            <Link src="#training-plan-templates" style={[styles.finderItem, styles.finderTraining]}>
              <Text style={styles.finderTitle}>Training plan templates</Text>
              <Text style={styles.finderMeta}>
                {layout.trainingPlanSection.plans.length} complete programmes · p.{" "}
                {layout.trainingPlanSection.openerPageNumber}
              </Text>
            </Link>
          ) : null}
        </View>
      </FrontMatterPage>

      <FrontMatterPage pageNumber={referenceStartPage} section="Intensity language">
        <Text style={styles.frontTitle}>Intensity language</Text>
        <Text style={styles.frontHeading}>Read targets in context</Text>
        <Text style={styles.frontBody}>
          FTP means functional threshold power. Max HR means maximum heart rate. Threshold HR means
          lactate-threshold heart rate. RPE is rating of perceived exertion. Percentage targets use
          the stated reference; power is watts (W), heart rate is beats per minute (bpm), and pace
          is written in the plan's stated unit.
        </Text>
        <Text style={styles.frontHeading}>Read the written notation</Text>
        <Text style={styles.frontBody}>
          Time is shown as hours, min, and sec; distance as m or km; and strength volume as reps.
          “Until finished” is open-ended work, so any timed subtotal does not claim the full session
          duration. “N×” repeats the whole listed sequence—N is not a strength-repetition count.
        </Text>
        <Text style={styles.frontHeading}>Read the profile as an overview</Text>
        <Text style={styles.frontBody}>
          Taller bars represent higher relative effort. Pale bars identify unavailable intensity,
          not recovery. For all-timed plans, bar widths represent authored time; mixed-unit and
          open-ended plans use an unscaled step overview. Height is not medically calibrated across
          plans, and the written authored target remains authoritative.
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
          Note what changed and how the session felt in your preferred training record before
          selecting the next activity plan.
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
          {contentsPageIndex === layout.contentsPages.length - 1 && layout.trainingPlanSection ? (
            <Link
              src="#training-plan-templates"
              style={[styles.trainingPlanListRow, { marginTop: 14 }]}
            >
              <Text style={styles.trainingPlanListName}>Training plan templates</Text>
              <Text style={styles.trainingPlanListMeta}>
                p. {layout.trainingPlanSection.openerPageNumber}
              </Text>
            </Link>
          ) : null}
        </FrontMatterPage>
      ))}

      {layout.planPages.map((catalogPage) => (
        <Page
          {...(layout.finderSections.find((section) => section.key === catalogPage.sectionKey)
            ?.startPageNumber === catalogPage.pageNumber
            ? { bookmark: catalogPage.sectionTitle }
            : {})}
          key={`${catalogPage.sectionKey}-${catalogPage.pageNumber}`}
          size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE}
          style={interiorPageStyle(catalogPage.pageNumber)}
          wrap
        >
          <InteriorHeader pageNumber={catalogPage.pageNumber} section={catalogPage.sectionTitle} />
          <PlanCard fragment={catalogPage.entries[0]} />
          <InteriorFooter pageNumber={catalogPage.pageNumber} />
        </Page>
      ))}

      {layout.trainingPlanSection?.alignmentBlankPageNumber ? (
        <Page size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE} style={styles.blankPage} />
      ) : null}

      {layout.trainingPlanSection ? (
        <FrontMatterPage
          pageNumber={layout.trainingPlanSection.openerPageNumber}
          section="Training plan templates"
        >
          <View id="training-plan-templates">
            <Text style={styles.preflightMarker}>TRAINING-PLAN-TEMPLATES-OPENER</Text>
            <Text style={styles.frontTitle}>Training plan templates</Text>
            <Text style={styles.frontBody}>
              Six authored schedules connect the activity plans in this catalog into complete
              multi-week programmes. Each page shows the exact relative session placement and links
              every scheduled session back to its activity prescription.
            </Text>
            <Text style={styles.frontBody}>
              Weekly bars represent scheduled session counts only. They do not claim training load,
              intensity, periodization phase, or athlete-specific progression.
            </Text>
            <View style={styles.trainingPlanList}>
              {layout.trainingPlanSection.plans.map((plan) => (
                <Link
                  key={plan.id}
                  src={`#training-plan-${plan.id}`}
                  style={styles.trainingPlanListRow}
                >
                  <Text style={styles.trainingPlanListName}>{plan.name}</Text>
                  <Text style={styles.trainingPlanListMeta}>
                    {plan.scheduleVisual.totalWeeks} weeks · {plan.scheduleVisual.totalSessions}{" "}
                    sessions · p. {plan.overviewPageNumber}
                  </Text>
                </Link>
              ))}
            </View>
          </View>
        </FrontMatterPage>
      ) : null}

      {layout.trainingPlanSection?.plans.flatMap((plan) => [
        <TrainingPlanOverviewPage key={`${plan.id}-overview`} plan={plan} />,
        ...plan.schedulePageNumbers.map((pageNumber, index) => (
          <TrainingPlanSchedulePage
            key={`${plan.id}-schedule-${pageNumber}`}
            pageNumber={pageNumber}
            plan={plan}
            weeks={plan.weeks.slice(index, index + 1)}
          />
        )),
      ])}

      {activityPlanCatalogNeedsBlankBeforeBackCover(layout) ? (
        <Page size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE} style={styles.blankPage} />
      ) : null}

      {/* Mixam's separate cover stock includes a blank inside back cover. */}
      <Page size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE} style={styles.blankPage} />

      <Page
        bookmark="Back cover"
        size={ACTIVITY_PLAN_CATALOG_PAGE_SIZE}
        style={styles.backCover}
        wrap
      >
        <GradientPeakPdfBrand color="#ffffff" fontFamily={GRADIENTPEAK_PDF_FONT_FAMILY} size={28} />
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
    2
  );
}
