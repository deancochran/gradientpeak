import {
  Circle,
  Document,
  G,
  Link,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  type ActivityPlanPrintGroup,
  type ActivityPlanPrintModel,
  getActivityPlanBikeCueLength,
} from "@repo/core/activity-plan";

const GRADIENTPEAK_APP_URL = "https://gradientpeak.app";
const GRADIENTPEAK_PDF_FONT_FAMILY = "Helvetica";
export const GRADIENTPEAK_MARK_PATH =
  "M370 256 H756 Q768 256 768 268 V654 Q768 660 764 664 L686 742 Q674 754 674 738 V362 Q674 350 662 350 H286 Q270 350 282 338 L360 260 Q364 256 370 256 Z";
export const GRADIENTPEAK_MARK_TRANSFORM = "translate(-9 9)";

export function GradientPeakPdfMark({ color }: { color: string }) {
  return (
    <G fill={color} transform={GRADIENTPEAK_MARK_TRANSFORM}>
      <Path d={GRADIENTPEAK_MARK_PATH} />
      <Circle cx={467} cy={557} r={147} />
    </G>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#111827",
    fontFamily: GRADIENTPEAK_PDF_FONT_FAMILY,
    padding: 32,
  },
  compactPage: {
    backgroundColor: "#ffffff",
    color: "#111827",
    fontFamily: GRADIENTPEAK_PDF_FONT_FAMILY,
    padding: 14,
  },
  swimPage: {
    backgroundColor: "#ffffff",
    color: "#111827",
    fontFamily: GRADIENTPEAK_PDF_FONT_FAMILY,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 6,
  },
  header: {
    marginBottom: 14,
  },
  swimHeader: {
    marginBottom: 5,
  },
  brandLink: { color: "#6b7280", textDecoration: "none" },
  brandRow: { alignItems: "center", display: "flex", flexDirection: "row", marginBottom: 4 },
  swimBrandRow: { alignItems: "center", display: "flex", flexDirection: "row", marginBottom: 2 },
  brand: { color: "#6b7280", fontSize: 8, letterSpacing: 1.2 },
  swimBrand: { color: "#6b7280", fontSize: 6, letterSpacing: 1 },
  title: { fontSize: 21, fontWeight: 700 },
  compactTitle: { fontSize: 14, fontWeight: 700 },
  swimTitle: { fontSize: 10, fontWeight: 700 },
  meta: { color: "#4b5563", fontSize: 9, marginTop: 5 },
  swimMeta: { color: "#4b5563", fontSize: 6, marginTop: 1 },
  description: { color: "#374151", fontSize: 9, lineHeight: 1.4, marginTop: 7 },
  profile: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 6,
    borderWidth: 0.8,
    marginBottom: 14,
    padding: 7,
  },
  compactProfile: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 4,
    borderWidth: 0.7,
    marginBottom: 8,
    padding: 4,
  },
  swimProfile: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 3,
    borderWidth: 0.6,
    marginBottom: 3,
    padding: 2,
  },
  profileCaption: {
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  profileSummary: { color: "#475569", fontSize: 6.5 },
  swimProfileSummary: { color: "#475569", fontSize: 5.5 },
  profilePlot: { backgroundColor: "#ffffff", position: "relative" },
  profileGridLine: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 0.5,
    left: 0,
    position: "absolute",
    right: 0,
  },
  singleProfileLine: {
    borderTopWidth: 2,
    left: 0,
    position: "absolute",
    right: 0,
  },
  profileBars: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "row",
    height: "100%",
    position: "relative",
  },
  swimSection: { marginBottom: 3 },
  swimSectionTitle: {
    fontSize: 6.5,
    fontWeight: 700,
    marginBottom: 1.5,
    textTransform: "uppercase",
  },
  swimNote: { color: "#64748b", fontSize: 6.5, lineHeight: 1.1, marginBottom: 1 },
  section: {
    borderBottomColor: "#e5e7eb",
    borderBottomWidth: 0.7,
    marginBottom: 11,
    paddingBottom: 9,
  },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" },
  compactSectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  group: { marginBottom: 7 },
  swimGroup: { marginBottom: 2 },
  repeatedGroup: {
    borderLeftColor: "#9ca3af",
    borderLeftWidth: 1.5,
    marginBottom: 7,
    paddingLeft: 7,
  },
  swimRepeatedGroup: {
    borderLeftColor: "#94a3b8",
    borderLeftWidth: 1,
    marginBottom: 2,
    paddingLeft: 4,
  },
  groupTitle: { fontSize: 10, marginBottom: 4 },
  swimGroupTitle: { fontSize: 7, marginBottom: 1 },
  step: { marginBottom: 6 },
  stepName: { fontSize: 11, fontWeight: 700 },
  compactStepName: { fontSize: 8.5, fontWeight: 700 },
  swimStep: { display: "flex", flexDirection: "row", marginBottom: 3 },
  swimStepName: { fontSize: 8, fontWeight: 700, paddingRight: 3, width: "25%" },
  instruction: { fontSize: 9.5, lineHeight: 1.35, marginTop: 1.5 },
  compactInstruction: { fontSize: 7.5, lineHeight: 1.25, marginTop: 1 },
  swimInstruction: { fontSize: 7, lineHeight: 1.1, paddingRight: 3, width: "31%" },
  swimStepNote: { color: "#64748b", fontSize: 6.5, lineHeight: 1.1, width: "44%" },
  note: { color: "#6b7280", fontSize: 8, lineHeight: 1.35, marginTop: 2 },
  footer: {
    bottom: 12,
    color: "#9ca3af",
    fontSize: 7,
    left: 32,
    position: "absolute",
    right: 32,
    textAlign: "center",
  },
});

export function GradientPeakPdfBrand({
  color = "#111827",
  compact = false,
  fontFamily,
  size,
  swimDeckCard = false,
}: {
  color?: string;
  compact?: boolean;
  fontFamily?: string;
  size?: number;
  swimDeckCard?: boolean;
}) {
  const markSize = size ?? (swimDeckCard ? 8 : compact ? 10 : 12);
  const brandFontSize = size ? Math.max(8, size * 0.65) : undefined;
  return (
    <Link src={GRADIENTPEAK_APP_URL} style={styles.brandLink}>
      <View style={swimDeckCard ? styles.swimBrandRow : styles.brandRow}>
        <Svg
          height={markSize}
          style={{ marginRight: swimDeckCard ? 2 : 3 }}
          viewBox="0 0 1024 1024"
          width={markSize}
        >
          <GradientPeakPdfMark color={color} />
        </Svg>
        <Text
          style={[
            swimDeckCard ? styles.swimBrand : styles.brand,
            { color },
            fontFamily ? { fontFamily } : {},
            brandFontSize ? { fontSize: brandFontSize } : {},
          ]}
        >
          GRADIENTPEAK
        </Text>
      </View>
    </Link>
  );
}

function renderGroup(
  group: ActivityPlanPrintGroup,
  compact: boolean,
  swimDeckCard: boolean,
  bikeCueStrip: boolean,
) {
  return (
    <View
      key={group.id}
      style={
        swimDeckCard
          ? group.repetitions > 1
            ? styles.swimRepeatedGroup
            : styles.swimGroup
          : group.repetitions > 1
            ? styles.repeatedGroup
            : styles.group
      }
    >
      {group.repetitions > 1 ? (
        <Text style={swimDeckCard ? styles.swimGroupTitle : styles.groupTitle}>
          Repeat {group.repetitions}×
        </Text>
      ) : null}
      {group.steps.map((step) => (
        <View key={step.id} style={swimDeckCard ? styles.swimStep : styles.step} wrap={false}>
          {step.name || swimDeckCard ? (
            <Text
              style={
                swimDeckCard
                  ? styles.swimStepName
                  : compact
                    ? styles.compactStepName
                    : styles.stepName
              }
            >
              {step.name ?? ""}
            </Text>
          ) : null}
          <Text
            style={
              swimDeckCard
                ? styles.swimInstruction
                : compact
                  ? styles.compactInstruction
                  : styles.instruction
            }
          >
            {step.instruction}
          </Text>
          {!bikeCueStrip && step.instructions ? (
            <Text style={swimDeckCard ? styles.swimStepNote : styles.note}>
              {step.instructions}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function getActivityPlanPdfPageSize(model: ActivityPlanPrintModel): "A4" | [number, number] {
  if (model.format === "swim-deck-card") return [360, 216];
  if (model.format === "bike-cue-strip") {
    return [162, getActivityPlanBikeCueLength(model) === "short" ? 360 : 504];
  }
  return "A4";
}

export function ActivityPlanPdfPage({ model }: { model: ActivityPlanPrintModel }) {
  const compact = model.format !== "full-page";
  const swimDeckCard = model.format === "swim-deck-card";
  const bikeCueStrip = model.format === "bike-cue-strip";
  const onlyProfileBar = model.intensityProfile.length === 1 ? model.intensityProfile[0] : null;
  const profileSummary = onlyProfileBar
    ? `${onlyProfileBar.label} · ${onlyProfileBar.duration}`
    : null;
  const profileHeight = swimDeckCard ? 28 : compact ? 38 : onlyProfileBar ? 42 : 68;
  return (
    <Page
      size={getActivityPlanPdfPageSize(model)}
      style={swimDeckCard ? styles.swimPage : compact ? styles.compactPage : styles.page}
      wrap
    >
      <View style={swimDeckCard ? styles.swimHeader : styles.header}>
        <GradientPeakPdfBrand compact={compact} swimDeckCard={swimDeckCard} />
        <Text
          style={swimDeckCard ? styles.swimTitle : compact ? styles.compactTitle : styles.title}
        >
          {model.title}
        </Text>
        <Text style={swimDeckCard ? styles.swimMeta : styles.meta}>
          {[model.activityCategory.toUpperCase(), ...model.totals].join("  ·  ")}
        </Text>
        {!compact && model.description ? (
          <Text style={styles.description}>{model.description}</Text>
        ) : null}
      </View>

      {model.intensityProfile.length > 0 ? (
        <View
          style={
            swimDeckCard ? styles.swimProfile : compact ? styles.compactProfile : styles.profile
          }
          wrap={false}
        >
          {profileSummary ? (
            <View style={styles.profileCaption}>
              <Text style={swimDeckCard ? styles.swimProfileSummary : styles.profileSummary}>
                {profileSummary}
              </Text>
            </View>
          ) : null}
          <View style={[styles.profilePlot, { height: profileHeight }]}>
            {[25, 50, 75].map((position) => (
              <View key={position} style={[styles.profileGridLine, { bottom: `${position}%` }]} />
            ))}
            <View style={styles.profileBars}>
              {onlyProfileBar ? (
                <>
                  <View
                    style={{
                      backgroundColor: onlyProfileBar.color,
                      height: `${onlyProfileBar.heightPercent}%`,
                      opacity: 0.18,
                      width: "100%",
                    }}
                  />
                  <View
                    style={[
                      styles.singleProfileLine,
                      {
                        borderTopColor: onlyProfileBar.color,
                        bottom: `${onlyProfileBar.heightPercent}%`,
                      },
                    ]}
                  />
                </>
              ) : (
                model.intensityProfile.map((bar, index) => (
                  <View
                    key={bar.id}
                    style={{
                      backgroundColor: bar.color,
                      borderColor: bar.color,
                      borderRadius: 1.5,
                      borderWidth: 0.8,
                      flexGrow: bar.weight,
                      height: `${bar.heightPercent}%`,
                      marginRight: index === model.intensityProfile.length - 1 ? 0 : 2,
                      width: 1,
                    }}
                  />
                ))
              )}
            </View>
          </View>
        </View>
      ) : null}

      {swimDeckCard
        ? model.sections.map((section) => (
            <View key={section.id} style={styles.swimSection}>
              {section.name ? <Text style={styles.swimSectionTitle}>{section.name}</Text> : null}
              {section.groups.map((group) =>
                renderGroup(group, compact, swimDeckCard, bikeCueStrip),
              )}
            </View>
          ))
        : model.sections.map((section) => (
            <View key={section.id} style={styles.section}>
              {section.name ? (
                <Text style={compact ? styles.compactSectionTitle : styles.sectionTitle}>
                  {section.name}
                </Text>
              ) : null}
              {section.groups.map((group) =>
                renderGroup(group, compact, swimDeckCard, bikeCueStrip),
              )}
            </View>
          ))}

      {!bikeCueStrip && model.notes ? (
        <Text style={swimDeckCard ? styles.swimNote : styles.note}>{model.notes}</Text>
      ) : null}
      {!compact ? (
        <Text fixed style={styles.footer}>
          GradientPeak activity plan
        </Text>
      ) : null}
    </Page>
  );
}

export function ActivityPlanPdfDocument({ model }: { model: ActivityPlanPrintModel }) {
  return (
    <Document author="GradientPeak" subject="Activity plan" title={model.title}>
      <ActivityPlanPdfPage model={model} />
    </Document>
  );
}
