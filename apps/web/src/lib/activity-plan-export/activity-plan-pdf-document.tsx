import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ActivityPlanPrintModel } from "@repo/core/activity-plan";

const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: "#111827", fontFamily: "Helvetica", padding: 32 },
  compactPage: {
    backgroundColor: "#ffffff",
    color: "#111827",
    fontFamily: "Helvetica",
    padding: 14,
  },
  header: {
    borderBottomColor: "#d1d5db",
    borderBottomWidth: 1,
    marginBottom: 14,
    paddingBottom: 10,
  },
  brand: { color: "#6b7280", fontSize: 8, letterSpacing: 1.2, marginBottom: 4 },
  title: { fontSize: 21, fontWeight: 700 },
  compactTitle: { fontSize: 14, fontWeight: 700 },
  meta: { color: "#4b5563", fontSize: 9, marginTop: 5 },
  description: { color: "#374151", fontSize: 9, lineHeight: 1.4, marginTop: 7 },
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
  repeatedGroup: {
    borderLeftColor: "#9ca3af",
    borderLeftWidth: 1.5,
    marginBottom: 7,
    paddingLeft: 7,
  },
  groupTitle: { fontSize: 10, marginBottom: 4 },
  step: { marginBottom: 6 },
  stepName: { fontSize: 11, fontWeight: 700 },
  compactStepName: { fontSize: 8.5, fontWeight: 700 },
  instruction: { fontSize: 9.5, lineHeight: 1.35, marginTop: 1.5 },
  compactInstruction: { fontSize: 7.5, lineHeight: 1.25, marginTop: 1 },
  note: { color: "#6b7280", fontSize: 8, lineHeight: 1.35, marginTop: 2 },
  reference: { borderColor: "#d1d5db", borderWidth: 0.8, marginTop: 4, padding: 7 },
  referenceTitle: { fontSize: 9, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" },
  referenceText: { fontSize: 8, lineHeight: 1.35 },
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

function pageSize(model: ActivityPlanPrintModel): "A4" | [number, number] {
  if (model.format === "swim-deck-card") return [288, 432];
  if (model.format === "bike-cue-strip") return [162, 504];
  return "A4";
}

export function ActivityPlanPdfDocument({ model }: { model: ActivityPlanPrintModel }) {
  const compact = model.format !== "full-page";
  return (
    <Document author="GradientPeak" subject="Activity plan" title={model.title}>
      <Page size={pageSize(model)} style={compact ? styles.compactPage : styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.brand}>GRADIENTPEAK</Text>
          <Text style={compact ? styles.compactTitle : styles.title}>{model.title}</Text>
          <Text style={styles.meta}>
            {[model.activityCategory.toUpperCase(), ...model.totals].join("  ·  ")}
          </Text>
          {!compact && model.description ? (
            <Text style={styles.description}>{model.description}</Text>
          ) : null}
        </View>

        {model.sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={compact ? styles.compactSectionTitle : styles.sectionTitle}>
              {section.name}
            </Text>
            {section.notes ? <Text style={styles.note}>{section.notes}</Text> : null}
            {section.groups.map((group) => (
              <View
                key={group.id}
                style={group.repetitions > 1 ? styles.repeatedGroup : styles.group}
              >
                {group.name || group.repetitions > 1 ? (
                  <Text style={styles.groupTitle}>
                    {[group.name, group.repetitions > 1 ? `Repeat ${group.repetitions}×` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                ) : null}
                {group.notes ? <Text style={styles.note}>{group.notes}</Text> : null}
                {group.steps.map((step) => (
                  <View key={step.id} style={styles.step} wrap={false}>
                    <Text style={compact ? styles.compactStepName : styles.stepName}>
                      {step.name}
                    </Text>
                    <Text style={compact ? styles.compactInstruction : styles.instruction}>
                      {step.instruction}
                    </Text>
                    {step.description ? <Text style={styles.note}>{step.description}</Text> : null}
                    {step.notes ? <Text style={styles.note}>{step.notes}</Text> : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        {model.intensityReferences.length > 0 ? (
          <View style={styles.reference} wrap={false}>
            <Text style={styles.referenceTitle}>Intensity reference</Text>
            <Text style={styles.referenceText}>{model.intensityReferences.join("  ·  ")}</Text>
          </View>
        ) : null}
        {!compact && model.notes ? <Text style={styles.note}>{model.notes}</Text> : null}
        {!compact ? (
          <Text fixed style={styles.footer}>
            GradientPeak activity plan
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}
