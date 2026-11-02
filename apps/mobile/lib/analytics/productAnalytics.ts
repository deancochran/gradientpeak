import { usePostHog } from "posthog-react-native";
import { z } from "zod";
import { useProductAnalyticsConsentStore } from "@/lib/stores/productAnalyticsConsentStore";

const productAnalyticsEvents = {
  "plan.range_selected": z.object({ range: z.enum(["6w", "3m", "6m", "1y"]) }).strict(),
  "plan.chart_engaged": z.object({ chart: z.enum(["progress", "training"]) }).strict(),
  "plan.goal_switched": z.object({ source: z.literal("dashboard") }).strict(),
  "goal.detail_opened": z.object({ source: z.enum(["goals_list", "plan_dashboard"]) }).strict(),
  "plan.analysis_view_changed": z.object({ view: z.enum(["progress", "training"]) }).strict(),
  "plan.analysis_metric_changed": z
    .object({ metric: z.enum(["load", "fitness", "fatigue", "form"]) })
    .strict(),
  "plan.calendar_action": z
    .object({ action: z.enum(["open_calendar", "open_day", "add", "details"]) })
    .strict(),
  "plan.program_action": z.object({ action: z.literal("manage") }).strict(),
} as const;

export type ProductAnalyticsEvent = keyof typeof productAnalyticsEvents;
export type ProductAnalyticsProperties<Event extends ProductAnalyticsEvent> = z.infer<
  (typeof productAnalyticsEvents)[Event]
>;

export type ProductAnalyticsClient = {
  capture: (event: string, properties: Record<string, string>) => void;
};

export function captureProductAnalytics(
  client: ProductAnalyticsClient | null | undefined,
  event: string,
  properties: unknown,
) {
  const schema = productAnalyticsEvents[event as ProductAnalyticsEvent];
  if (!client || !schema || useProductAnalyticsConsentStore.getState().consent !== "granted")
    return;

  const parsed = schema.safeParse(properties);
  if (!parsed.success) return;

  try {
    client.capture(event, parsed.data);
  } catch {
    // Analytics transport errors must never affect the product interaction.
  }
}

export function useProductAnalytics() {
  const posthog = usePostHog();

  return {
    capture<Event extends ProductAnalyticsEvent>(
      event: Event,
      properties: ProductAnalyticsProperties<Event>,
    ) {
      captureProductAnalytics(posthog, event, properties);
    },
  };
}
