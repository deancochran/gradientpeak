import { z } from "zod";
import {
  canonicalUtcInstant,
  formatIsoInstantInIanaZone,
  isValidIanaTimeZone,
} from "../utils/schedule-date";

/** Channels this policy can evaluate. It neither persists choices nor delivers a notification. */
export const notificationChannelSchema = z.enum(["email", "push"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** Product categories require separate consent; a channel-wide opt-in is intentionally insufficient. */
export const notificationCategorySchema = z.enum([
  "coaching_message",
  "plan_update",
  "check_in_reminder",
]);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

export const weekdaySchema = z.enum([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);
export type Weekday = z.infer<typeof weekdaySchema>;

const wallTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");

export const quietHoursSchema = z
  .object({
    days: z.array(weekdaySchema).min(1).max(7),
    end: wallTimeSchema,
    start: wallTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.days).size !== value.days.length) {
      context.addIssue({ code: "custom", message: "Quiet-hour days must not repeat" });
    }
    if (value.start === value.end) {
      context.addIssue({ code: "custom", message: "Quiet hours cannot cover a full day" });
    }
  });
export type QuietHours = z.infer<typeof quietHoursSchema>;

export const notificationConsentSchema = z
  .object({
    category: notificationCategorySchema,
    channel: notificationChannelSchema,
    granted: z.boolean(),
  })
  .strict();
export type NotificationConsent = z.infer<typeof notificationConsentSchema>;

/**
 * This is supplied by the host at evaluation time. In particular, `permission-off`
 * is an observed state, not an instruction to prompt the OS again.
 */
export const notificationCapabilitySchema = z.enum(["ready", "permission-off", "unavailable"]);
export type NotificationCapability = z.infer<typeof notificationCapabilitySchema>;

export const notificationPolicyInputSchema = z
  .object({
    capabilities: z.record(notificationChannelSchema, notificationCapabilitySchema),
    category: notificationCategorySchema,
    channel: notificationChannelSchema,
    consents: z.array(notificationConsentSchema).max(6),
    instant: z.string(),
    isSensitive: z.boolean(),
    previewPreference: z.enum(["allow-sensitive", "redact-sensitive"]).optional(),
    quietHours: quietHoursSchema.optional(),
    timeZone: z.string().trim().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (!isValidIanaTimeZone(value.timeZone)) {
      context.addIssue({
        code: "custom",
        path: ["timeZone"],
        message: "Expected an IANA time zone",
      });
    }
    try {
      canonicalUtcInstant(value.instant);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["instant"],
        message: "Expected an explicit valid instant",
      });
    }
    const keys = value.consents.map((consent) => `${consent.channel}:${consent.category}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["consents"],
        message: "Consent records must be unique per channel and category",
      });
    }
  });
export type NotificationPolicyInput = z.infer<typeof notificationPolicyInputSchema>;

export type NotificationDecision =
  | { kind: "allow"; preview: "full" | "redacted" }
  | {
      kind: "deny";
      preview: "full" | "redacted";
      reason: "consent-denied" | "consent-unavailable" | "quiet-hours";
    }
  | {
      kind: "unavailable";
      preview: "full" | "redacted";
      reason: "capability-unavailable" | "invalid-input" | "push-permission-off";
    };

const weekdayNames: readonly Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function previewFor(
  input: Pick<NotificationPolicyInput, "isSensitive" | "previewPreference">,
): "full" | "redacted" {
  return input.isSensitive && input.previewPreference !== "allow-sensitive" ? "redacted" : "full";
}

function minutesSinceMidnight(wallTime: string): number {
  const [hour = 0, minute = 0] = wallTime.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Evaluates the supplied instant against local wall time. Start is inclusive and
 * end is exclusive. On an overnight interval, the post-midnight portion belongs
 * to the weekday on which that quiet interval began.
 */
function isInQuietHours(input: {
  instant: string;
  quietHours: QuietHours;
  timeZone: string;
}): boolean {
  const instant = canonicalUtcInstant(input.instant);
  if (!isValidIanaTimeZone(input.timeZone))
    throw new RangeError("timeZone must be a valid IANA zone");

  const wall = formatIsoInstantInIanaZone(instant, input.timeZone);
  const [date = "", time = ""] = wall.split("T");
  const localDate = new Date(`${date}T00:00:00.000Z`);
  const weekday = weekdayNames[localDate.getUTCDay()];
  if (!weekday) throw new RangeError("Could not derive local weekday");

  const current = minutesSinceMidnight(time);
  const start = minutesSinceMidnight(input.quietHours.start);
  const end = minutesSinceMidnight(input.quietHours.end);
  if (start < end) {
    return input.quietHours.days.includes(weekday) && current >= start && current < end;
  }

  if (current >= start) return input.quietHours.days.includes(weekday);
  if (current < end) {
    const previous = weekdayNames[(localDate.getUTCDay() + 6) % 7];
    return previous !== undefined && input.quietHours.days.includes(previous);
  }
  return false;
}

/**
 * Pure eligibility decision only. Callers must durably load current consent and
 * capability state, then separately deduplicate, queue, and deliver an allowed event.
 */
export function evaluateNotificationPolicy(value: unknown): NotificationDecision {
  // There are only three categories across two channels. Reject oversized
  // untrusted lists before Zod walks every record.
  if (
    typeof value === "object" &&
    value !== null &&
    "consents" in value &&
    Array.isArray(value.consents) &&
    value.consents.length > 6
  ) {
    return { kind: "unavailable", preview: "redacted", reason: "invalid-input" };
  }
  const parsed = notificationPolicyInputSchema.safeParse(value);
  if (!parsed.success) return { kind: "unavailable", preview: "redacted", reason: "invalid-input" };

  const input = parsed.data;
  const preview = previewFor(input);
  const consent = input.consents.find(
    (item) => item.channel === input.channel && item.category === input.category,
  );
  if (!consent) return { kind: "deny", preview, reason: "consent-unavailable" };
  if (!consent.granted) return { kind: "deny", preview, reason: "consent-denied" };

  const capability = input.capabilities[input.channel];
  if (input.channel === "push" && capability === "permission-off") {
    return { kind: "unavailable", preview, reason: "push-permission-off" };
  }
  if (capability !== "ready")
    return { kind: "unavailable", preview, reason: "capability-unavailable" };

  if (
    input.quietHours &&
    isInQuietHours({
      instant: input.instant,
      quietHours: input.quietHours,
      timeZone: input.timeZone,
    })
  ) {
    return { kind: "deny", preview, reason: "quiet-hours" };
  }
  return { kind: "allow", preview };
}
