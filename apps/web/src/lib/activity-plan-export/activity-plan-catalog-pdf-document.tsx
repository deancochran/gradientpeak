import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ActivityPlanPrintGroup, ActivityPlanPrintModel } from "@repo/core/activity-plan";
import {
  ACTIVITY_PLAN_CATALOG_PAGE_SIZE,
  ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY,
  type ActivityPlanCatalogEntry,
  type ActivityPlanCatalogLayout,
  type ActivityPlanCatalogTrainingPlan,
  type ActivityPlanCatalogTrainingWeek,
  activityPlanCatalogNeedsBlankBeforeBackCover,
  getActivityPlanCatalogContentPageCount,
  getActivityPlanCatalogInteriorMargins,
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
  slot: {
    borderColor: "#dbe3ec",
    borderRadius: 6,
    borderWidth: 0.8,
    height: ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.slotHeight,
    padding: ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.slotPadding,
  },
  secondSlot: { marginTop: ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY.slotGap },
  fullCard: { paddingHorizontal: 2 },
  planTitle: { fontSize: 16, fontWeight: 700, lineHeight: 1.1 },
  planMeta: {
    color: "#475569",
    fontSize: 8.2,
    lineHeight: 1.2,
    marginTop: 4,
    textTransform: "uppercase",
  },
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
  adaptation: {
    backgroundColor: "#eff6ff",
    borderLeftColor: "#38bdf8",
    borderLeftWidth: 2,
    marginTop: 5,
    paddingLeft: 6,
  },
  adaptationLabel: { color: "#075985", fontSize: 7.8, fontWeight: 700 },
  adaptationText: { color: "#334155", fontSize: 7.6, lineHeight: 1.2, marginTop: 1 },
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
  scheduleWeekRow: { borderTopColor: "#cbd5e1", borderTopWidth: 0.5, minHeight: 49 },
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
      GradientPeak Activity & Training Plan Catalog
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
      <Text style={styles.planTitle}>{model.title}</Text>
      <Text style={styles.planMeta}>
        {[model.activityCategory.toUpperCase(), ...model.totals].join(" · ")}
      </Text>
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
      {entry.adaptation ? (
        <View style={styles.adaptation} wrap={false}>
          <Text style={styles.adaptationLabel}>AUTHORED ADAPTATION</Text>
          {entry.adaptation.controls.map((control) => (
            <Text key={control} style={styles.adaptationText}>
              {control}
            </Text>
          ))}
          {entry.adaptation.allowedStates ? (
            <Text style={styles.adaptationText}>
              Allowed states: {entry.adaptation.allowedStates.join(" | ")}
            </Text>
          ) : (
            <Text style={styles.adaptationText}>
              All increment-aligned values in the range are allowed.
            </Text>
          )}
        </View>
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
  const splitIndex = Math.ceil(plan.weeks.length / 2);
  const firstWeeks = plan.weeks.slice(0, splitIndex);
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
        <Text style={styles.scheduleTitle}>
          Weeks {firstWeeks[0]?.weekIndex === undefined ? "" : firstWeeks[0].weekIndex + 1}–
          {(firstWeeks.at(-1)?.weekIndex ?? 0) + 1}
        </Text>
        <Text style={styles.scheduleDemandNote}>
          Each entry lists its authored session objective as minutes / Common Load. An em dash means
          that no objective is authored; these are not athlete-specific resolved prescriptions.
        </Text>
        <TrainingScheduleTable weeks={firstWeeks} />
      </View>
    </FrontMatterPage>
  );
}

function TrainingPlanSchedulePage({ plan }: { plan: ActivityPlanCatalogTrainingPlan }) {
  const splitIndex = Math.ceil(plan.weeks.length / 2);
  const remainingWeeks = plan.weeks.slice(splitIndex);
  const distinctActivities = Array.from(
    new Map(
      plan.weeks
        .flatMap((week) => week.sessions)
        .map((session) => [session.activityPlanId, session]),
    ).values(),
  );
  return (
    <FrontMatterPage pageNumber={plan.schedulePageNumber} section="Training plan templates">
      <Text style={styles.preflightMarker}>{`TRAINING-PLAN-SCHEDULE-${plan.id}`}</Text>
      <Text style={styles.frontTitle}>{plan.name}</Text>
      <Text style={styles.scheduleTitle}>
        Weeks {(remainingWeeks[0]?.weekIndex ?? 0) + 1}–
        {(remainingWeeks.at(-1)?.weekIndex ?? 0) + 1}
      </Text>
      <Text style={styles.scheduleDemandNote}>
        Each entry lists its authored session objective as minutes / Common Load. An em dash means
        that no objective is authored; these are not athlete-specific resolved prescriptions.
      </Text>
      <TrainingScheduleTable weeks={remainingWeeks} />
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
      <Text style={styles.note}>
        Session placement is relative to the selected plan start date. Bars show scheduled session
        count—not athlete-specific load, intensity, or progression.
      </Text>
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
            <GradientPeakPdfBrand color="#ffffff" size={28} />
          </View>
          <View style={{ marginTop: 130 }}>
            <Text style={styles.coverKicker}>ACTIVITY & TRAINING PLAN CATALOG</Text>
            <Text style={styles.coverTitle}>Train with purpose.</Text>
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
              multi-week programmes. Each spread shows the exact relative session placement and
              links every scheduled session back to its activity prescription.
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
        <TrainingPlanSchedulePage key={`${plan.id}-schedule`} plan={plan} />,
      ])}

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
