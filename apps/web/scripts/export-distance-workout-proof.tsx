import "./catalog-fonts";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { buildActivityPlanCatalogModels } from "../src/lib/activity-plan-export/activity-plan-catalog";

// A single-activity-plan, actual-size legibility proof, not a replacement catalog.
const model = buildActivityPlanCatalogModels().find(
  (entry) => entry.model.title === "FTP Intervals",
)?.model;
if (!model) throw new Error("FTP Intervals fixture is missing");
const groups = model.sections.flatMap((section) => section.groups);
const styles = StyleSheet.create({
  page: {
    padding: 36,
    color: "#000000",
    backgroundColor: "#ffffff",
    fontFamily: "GradientPeakCatalogSans",
    fontFeatureSettings: { liga: false },
  },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  title: { fontSize: 18, fontWeight: 600 },
  total: { fontSize: 18 },
  row: { flexDirection: "row", alignItems: "center", height: 76 },
  name: { width: 260, fontSize: 22, fontWeight: 700 },
  duration: { width: 205, fontSize: 22, fontWeight: 700 },
  target: { fontSize: 22, fontWeight: 700 },
  unit: { fontWeight: 400 },
  repeat: {
    borderLeftWidth: 4,
    borderLeftColor: "#000000",
    paddingLeft: 12,
    marginLeft: -16,
    marginTop: 10,
    marginBottom: 10,
  },
  repeatTitle: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
});
function ValueWithLightUnits({ value }: { value: string }) {
  const match = /^(.*?)(\s+(?:min|FTP))$/u.exec(value);
  return (
    <Text>
      {match?.[1] ?? value}
      {match ? <Text style={styles.unit}>{match[2]}</Text> : null}
    </Text>
  );
}
const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../publisher-exports/ftp-intervals-distance-proof-22pt.pdf",
);
const buffer = await renderToBuffer(
  <Document title="FTP Intervals — actual-size distance-reading proof" author="GradientPeak">
    <Page size="LETTER" orientation="landscape" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>{model.title}</Text>
        <Text style={styles.total}>73 min</Text>
      </View>
      {groups.map((group) => (
        <View key={group.id} style={group.repetitions > 1 ? styles.repeat : {}} wrap={false}>
          {group.repetitions > 1 ? (
            <Text style={styles.repeatTitle}>{group.repetitions}× REPEAT</Text>
          ) : null}
          {group.steps.map((step) => (
            <View key={step.id} style={styles.row} wrap={false}>
              <Text style={styles.name}>{step.name === "Warmup" ? "Warm-up" : step.name}</Text>
              <Text style={styles.duration}>
                <ValueWithLightUnits value={step.durationLabel?.replace(/m\b/u, " min") ?? ""} />
              </Text>
              <Text style={styles.target}>
                <ValueWithLightUnits value={step.targetLabels?.join(" · ") ?? ""} />
              </Text>
            </View>
          ))}
        </View>
      ))}
    </Page>
  </Document>,
);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, buffer);
console.log(`Wrote distance-reading proof to ${output}`);
