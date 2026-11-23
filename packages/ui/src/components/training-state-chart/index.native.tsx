import { DashPathEffect } from "@shopify/react-native-skia";
import { Fragment } from "react";
import { View } from "react-native";
import { CartesianChart, Line, Scatter } from "victory-native";
import { Text } from "../text/index.native";
import {
  getTrainingStateAccessibilityLabel,
  getTrainingStateMetric,
  getTrainingStateSourceLabel,
  type TrainingStateChartProps,
  type TrainingStateLegendProps,
} from "./shared";

type NativeSeriesKey =
  | "recorded-fitness"
  | "recorded-fatigue"
  | "recorded-form"
  | "projected-fitness"
  | "projected-fatigue"
  | "projected-form";
type NativeChartDatum = { index: number } & Record<NativeSeriesKey, number | null>;

function getNativeSeriesKey(
  metric: "fitness" | "fatigue" | "form",
  source: "recorded" | "projected",
): NativeSeriesKey {
  return `${source}-${metric}` as NativeSeriesKey;
}

function TrainingStateLegend({
  colors,
  metrics = ["fitness", "fatigue", "form"],
  sources,
  sourceLabels,
  testId,
}: TrainingStateLegendProps) {
  return (
    <View
      accessibilityLabel="Training-state legend"
      className="flex-row flex-wrap gap-3"
      testID={testId}
    >
      {metrics.map((metric) => {
        const definition = getTrainingStateMetric(metric);
        return (
          <View className="flex-row items-center gap-1" key={definition.id}>
            <View
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: colors?.[metric] ?? definition.nativeColor }}
            />
            <Text className="text-xs text-muted-foreground">{definition.label}</Text>
          </View>
        );
      })}
      {sources?.map((source) => (
        <Text className="text-xs text-muted-foreground" key={source}>
          {source === "recorded" ? "●" : "■"}{" "}
          {sourceLabels?.[source] ?? getTrainingStateSourceLabel(source)}
        </Text>
      ))}
    </View>
  );
}

function TrainingStateChart({
  accessibilityLabel,
  className,
  colors,
  description,
  emptyMessage,
  series,
  sourceLabels,
  testId,
  title,
  visual,
}: TrainingStateChartProps) {
  const hasValues = series.some(({ metric, source }) =>
    visual.points.some((point) => point[source][metric] !== null),
  );
  const yKeys = series.map(({ metric, source }) => getNativeSeriesKey(metric, source));
  const data: NativeChartDatum[] = visual.points.map((point) => {
    const datum: NativeChartDatum = {
      index: point.index,
      "projected-fatigue": null,
      "projected-fitness": null,
      "projected-form": null,
      "recorded-fatigue": null,
      "recorded-fitness": null,
      "recorded-form": null,
    };
    for (const { metric, source } of series) {
      datum[getNativeSeriesKey(metric, source)] = point[source][metric];
    }
    return datum;
  });
  return (
    <View {...(className === undefined ? {} : { className })} testID={testId}>
      {title ? (
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {title}
        </Text>
      ) : null}
      {description ? <Text className="text-xs text-muted-foreground">{description}</Text> : null}
      {hasValues ? (
        <View className="gap-2">
          <View
            accessible
            accessibilityLabel={[
              accessibilityLabel,
              getTrainingStateAccessibilityLabel(visual, series),
            ]
              .filter(Boolean)
              .join(". ")}
            accessibilityRole="image"
            className="h-40 overflow-hidden rounded-2xl border border-border bg-card p-2"
          >
            <CartesianChart
              data={data}
              domainPadding={{ bottom: 8, left: 8, right: 8, top: 8 }}
              frame={{ lineColor: "transparent", lineWidth: 0 }}
              xKey="index"
              yKeys={yKeys}
            >
              {({ points }) => (
                <>
                  {series.map(({ metric, source }) => (
                    <Fragment key={getNativeSeriesKey(metric, source)}>
                      <Line
                        color={colors?.[metric] ?? getTrainingStateMetric(metric).nativeColor}
                        connectMissingData={false}
                        curveType="natural"
                        {...(source === "projected" ? { opacity: 0.45 } : {})}
                        points={points[getNativeSeriesKey(metric, source)]}
                        strokeWidth={metric === "fitness" ? 3 : metric === "fatigue" ? 2.5 : 2}
                      >
                        {source === "projected" ? <DashPathEffect intervals={[6, 4]} /> : null}
                      </Line>
                      <Scatter
                        color={colors?.[metric] ?? getTrainingStateMetric(metric).nativeColor}
                        {...(source === "projected" ? { opacity: 0.45 } : {})}
                        points={points[getNativeSeriesKey(metric, source)]}
                        radius={2.5}
                        shape={source === "recorded" ? "circle" : "square"}
                      />
                    </Fragment>
                  ))}
                </>
              )}
            </CartesianChart>
          </View>
          <TrainingStateLegend
            colors={colors}
            metrics={[...new Set(series.map(({ metric }) => metric))]}
            sources={[...new Set(series.map(({ source }) => source))]}
            sourceLabels={sourceLabels}
            testId={testId === undefined ? undefined : `${testId}-legend`}
          />
        </View>
      ) : (
        <Text className="rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          {emptyMessage}
        </Text>
      )}
    </View>
  );
}

export * from "./shared";
export { TrainingStateChart, TrainingStateLegend };
