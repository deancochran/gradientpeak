import {
  canonicalGoalActivityCategorySchema,
  canonicalGoalObjectiveSchema,
  experienceLevelSchema,
  onboardingIntentArraySchema,
  profileGoalCreateSchema,
} from "@repo/core";
import { z } from "zod";
import { safeSecureStore } from "@/lib/storage/safe-secure-store";

export const ONBOARDING_RECOVERY_VERSION = 2 as const;
export const ONBOARDING_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ONBOARDING_RECOVERY_MAX_BYTES = 8 * 1024;
export const ONBOARDING_SOCIAL_SELECTION_LIMIT = 8;

export class OnboardingRecoveryPayloadTooLargeError extends Error {
  constructor(readonly byteLength: number) {
    super(
      `Onboarding recovery needs ${byteLength} bytes, exceeding the ${ONBOARDING_RECOVERY_MAX_BYTES}-byte device limit`,
    );
    this.name = "OnboardingRecoveryPayloadTooLargeError";
  }
}

const uuidSchema = z.string().uuid();
const sectionStatusSchema = z.enum(["pending", "saved", "skipped", "failed", "abandoned"]);
const socialActionStatusSchema = z.enum(["pending", "failed"]);

const recoverySectionSchema = z
  .object({
    retryable: z.boolean(),
    status: sectionStatusSchema,
  })
  .strict();

const lifecycleSchema = z
  .object({
    required: recoverySectionSchema,
    goal: recoverySectionSchema,
    settings: recoverySectionSchema,
  })
  .strict();

const goalWriteDataSchema = z
  .object({
    target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    title: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).max(10),
    activity_category: canonicalGoalActivityCategorySchema,
    target_payload: canonicalGoalObjectiveSchema,
  })
  .strict()
  .superRefine((goal, context) => {
    const canonical = profileGoalCreateSchema.safeParse({
      profile_id: "00000000-0000-4000-8000-000000000000",
      ...goal,
    });
    if (!canonical.success) {
      context.addIssue({
        code: "custom",
        path: ["target_payload"],
        message: "Goal write data is not canonical",
      });
    }
  });

const settingsPatchSchema = z
  .object({
    preset: z.enum(["safer", "balanced", "push_harder"]).optional(),
    minSessionsPerWeek: z.number().int().min(0).max(21).optional(),
    maxSessionsPerWeek: z.number().int().min(0).max(21).optional(),
    maxSingleSessionMinutes: z.number().int().min(20).max(600).optional(),
    maxWeeklyMinutes: z.number().int().min(30).max(10080).optional(),
  })
  .strict()
  .superRefine((patch, context) => {
    if (
      patch.minSessionsPerWeek !== undefined &&
      patch.maxSessionsPerWeek !== undefined &&
      patch.minSessionsPerWeek > patch.maxSessionsPerWeek
    ) {
      context.addIssue({
        code: "custom",
        path: ["minSessionsPerWeek"],
        message: "Minimum sessions per week cannot exceed maximum sessions",
      });
    }
  });

const socialRecoverySchema = z
  .object({
    invitationIds: z.array(uuidSchema).max(ONBOARDING_SOCIAL_SELECTION_LIMIT),
    groupIds: z.array(uuidSchema).max(ONBOARDING_SOCIAL_SELECTION_LIMIT),
    followProfileIds: z.array(uuidSchema).max(ONBOARDING_SOCIAL_SELECTION_LIMIT),
    statuses: z.record(z.string(), socialActionStatusSchema),
  })
  .strict()
  .superRefine((social, context) => {
    const expectedKeys = [
      ...social.invitationIds.map((id) => `invite:${id}`),
      ...social.groupIds.map((id) => `group:${id}`),
      ...social.followProfileIds.map((id) => `follow:${id}`),
    ];
    if (new Set(expectedKeys).size !== expectedKeys.length) {
      context.addIssue({ code: "custom", path: [], message: "Social IDs must be unique" });
    }
    const actualKeys = Object.keys(social.statuses);
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key) => !expectedKeys.includes(key))
    ) {
      context.addIssue({
        code: "custom",
        path: ["statuses"],
        message: "Social statuses must exactly match unresolved operations",
      });
    }
  });

const profileRetrySchema = z
  .object({
    experienceLevel: experienceLevelSchema,
    intents: onboardingIntentArraySchema,
  })
  .strict();

const pendingRecoverySchema = z
  .object({
    version: z.literal(ONBOARDING_RECOVERY_VERSION),
    userId: z.string().min(1),
    status: z.literal("pending"),
    expiresAt: z.number().int().positive(),
    profileRetry: profileRetrySchema,
    goal: goalWriteDataSchema.optional(),
    settingsPatch: settingsPatchSchema.optional(),
    social: socialRecoverySchema,
    lifecycle: lifecycleSchema,
  })
  .strict()
  .superRefine((record, context) => {
    if (
      (record.lifecycle.goal.status === "pending" ||
        (record.lifecycle.goal.status === "failed" && record.lifecycle.goal.retryable)) &&
      !record.goal
    ) {
      context.addIssue({
        code: "custom",
        path: ["goal"],
        message: "Retryable goal data is required",
      });
    }
    if (
      (record.lifecycle.settings.status === "pending" ||
        (record.lifecycle.settings.status === "failed" && record.lifecycle.settings.retryable)) &&
      !record.settingsPatch
    ) {
      context.addIssue({
        code: "custom",
        path: ["settingsPatch"],
        message: "Retryable settings data is required",
      });
    }
  });

const completedRecoverySchema = z
  .object({
    version: z.literal(ONBOARDING_RECOVERY_VERSION),
    userId: z.string().min(1),
    status: z.literal("completed"),
    expiresAt: z.number().int().positive(),
  })
  .strict();

const recoveryRecordSchema = z.discriminatedUnion("status", [
  pendingRecoverySchema,
  completedRecoverySchema,
]);

export type OnboardingRecoverySectionStatus = z.infer<typeof sectionStatusSchema>;
export type OnboardingRecoverySection = z.infer<typeof recoverySectionSchema>;
export type PendingOnboardingRecoveryRecord = z.infer<typeof pendingRecoverySchema>;
export type CompletedOnboardingRecoveryRecord = z.infer<typeof completedRecoverySchema>;
export type OnboardingRecoveryRecord = z.infer<typeof recoveryRecordSchema>;
export type OnboardingRecoveryGoal = z.infer<typeof goalWriteDataSchema>;
export type OnboardingRecoverySettingsPatch = z.infer<typeof settingsPatchSchema>;

type RecoveryListener = (record: OnboardingRecoveryRecord | null) => void;
const listeners = new Map<string, Set<RecoveryListener>>();
let storageMutation: Promise<void> = Promise.resolve();

function storageKey(userId: string): string {
  return `onboarding-recovery:v${ONBOARDING_RECOVERY_VERSION}:${encodeURIComponent(userId)}`;
}

function serializeStorageMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = storageMutation.then(mutation, mutation);
  storageMutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function notify(userId: string, record: OnboardingRecoveryRecord | null): void {
  for (const listener of listeners.get(userId) ?? []) listener(record);
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit < 0x80) bytes += 1;
    else if (codeUnit < 0x800) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < value.length) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }
  return bytes;
}

export function onboardingRecoveryExpiry(now = Date.now()): number {
  return now + ONBOARDING_RECOVERY_TTL_MS;
}

export function createCompletedOnboardingRecovery(
  userId: string,
): CompletedOnboardingRecoveryRecord {
  return completedRecoverySchema.parse({
    version: ONBOARDING_RECOVERY_VERSION,
    userId,
    status: "completed",
    expiresAt: onboardingRecoveryExpiry(),
  });
}

export function hasPendingOnboardingRecovery(
  record: OnboardingRecoveryRecord | null,
): record is PendingOnboardingRecoveryRecord {
  return record?.status === "pending";
}

export async function loadOnboardingRecovery(
  userId: string,
): Promise<OnboardingRecoveryRecord | null> {
  const key = storageKey(userId);
  const raw = await safeSecureStore.getItemAsyncOrThrow(key);
  if (!raw) return null;

  try {
    const parsed = recoveryRecordSchema.parse(JSON.parse(raw));
    if (parsed.userId === userId && parsed.expiresAt > Date.now()) return parsed;
  } catch {
    // Invalid device-local state is removed below without logging its contents.
  }

  try {
    await safeSecureStore.deleteItemAsyncOrThrow(key);
    notify(userId, null);
  } catch {
    // Corrupt state remains ignored if secure storage cannot remove it.
  }
  return null;
}

export async function saveOnboardingRecovery(record: OnboardingRecoveryRecord): Promise<void> {
  const validated = recoveryRecordSchema.parse(record);
  if (validated.expiresAt <= Date.now()) throw new Error("Expired onboarding recovery record");
  const encoded = JSON.stringify(validated);
  const byteLength = utf8ByteLength(encoded);
  if (byteLength > ONBOARDING_RECOVERY_MAX_BYTES) {
    throw new OnboardingRecoveryPayloadTooLargeError(byteLength);
  }

  return serializeStorageMutation(async () => {
    await safeSecureStore.setItemAsyncOrThrow(storageKey(validated.userId), encoded);
    notify(validated.userId, validated);
  });
}

export async function clearOnboardingRecovery(userId: string): Promise<void> {
  return serializeStorageMutation(async () => {
    await safeSecureStore.deleteItemAsyncOrThrow(storageKey(userId));
    notify(userId, null);
  });
}

export function subscribeToOnboardingRecovery(
  userId: string,
  listener: RecoveryListener,
): () => void {
  const userListeners = listeners.get(userId) ?? new Set<RecoveryListener>();
  userListeners.add(listener);
  listeners.set(userId, userListeners);

  return () => {
    userListeners.delete(listener);
    if (userListeners.size === 0) listeners.delete(userId);
  };
}
