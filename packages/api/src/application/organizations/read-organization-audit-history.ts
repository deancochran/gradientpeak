import type { DrizzleDbClient } from "@repo/db/client";
import { z } from "zod";
import {
  createOrganizationAuditRepository,
  type OrganizationAuditCursor,
  type OrganizationAuditRepository,
} from "../../repositories/organization-audit-repository";

const cursorVersion = 1;
const canonicalUtc6Pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/;

function isCanonicalUtc6Timestamp(value: string) {
  const parts = canonicalUtc6Pattern.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  if (year === 0 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59)
    return false;
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximumDay = daysInMonth[month - 1];
  return maximumDay !== undefined && day <= maximumDay;
}

const canonicalUtc6TimestampSchema = z.string().superRefine((value, ctx) => {
  if (!isCanonicalUtc6Timestamp(value))
    ctx.addIssue({ code: "custom", message: "Expected a canonical Gregorian UTC6 timestamp" });
});

const cursorSchema = z
  .object({
    v: z.literal(cursorVersion),
    o: z.string().uuid(),
    t: canonicalUtc6TimestampSchema,
    i: z.string().uuid(),
    a: z.string().nullable(),
    p: z.string().uuid().nullable(),
    f: z.string().datetime().nullable(),
    u: z.string().datetime().nullable(),
    r: z.string().nullable(),
    q: z.string().uuid().nullable(),
  })
  .strict();

export class OrganizationAuditHistoryError extends Error {
  constructor(readonly reason: "forbidden" | "invalid_cursor") {
    super(reason);
    this.name = "OrganizationAuditHistoryError";
  }
}

type AuditRow = {
  eventId: string;
  occurredAt: Date;
  occurredAtCursor: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: unknown;
  actorProfileId: string | null;
  actorDisplayName: string | null;
  actorUsername: string | null;
};

export type OrganizationAuditEvent = {
  eventId: string;
  occurredAt: Date;
  actor: { profileId: string; displayName: string | null; username: string | null } | null;
  action: string;
  resource: { type: string; id: string | null };
  details: "none" | "redacted";
};

function dateValue(value: Date | null) {
  return value?.toISOString() ?? null;
}

function decodeCursor(value: string) {
  try {
    return cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return { success: false as const };
  }
}

function hasDetails(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function mapEvent(row: AuditRow): OrganizationAuditEvent {
  return {
    eventId: row.eventId,
    occurredAt: row.occurredAt,
    actor: row.actorProfileId
      ? {
          profileId: row.actorProfileId,
          displayName: row.actorDisplayName,
          username: row.actorUsername,
        }
      : null,
    action: row.action,
    resource: { type: row.resourceType, id: row.resourceId },
    // `details` is arbitrary JSONB. Its contents are never a transport contract.
    details: hasDetails(row.details) ? "redacted" : "none",
  };
}

export async function readOrganizationAuditHistory(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  limit: number;
  cursor: string | null;
  action: string | null;
  auditActorProfileId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  fromInclusive: Date | null;
  toExclusive: Date | null;
  repository?: OrganizationAuditRepository;
}) {
  if (input.fromInclusive && input.toExclusive && input.fromInclusive >= input.toExclusive)
    throw new OrganizationAuditHistoryError("invalid_cursor");

  let cursor: OrganizationAuditCursor | null = null;
  if (input.cursor) {
    const decoded = decodeCursor(input.cursor);
    if (
      !decoded.success ||
      decoded.data.o !== input.organizationId ||
      decoded.data.a !== input.action ||
      decoded.data.p !== input.auditActorProfileId ||
      decoded.data.r !== input.resourceType ||
      decoded.data.q !== input.resourceId ||
      decoded.data.f !== dateValue(input.fromInclusive) ||
      decoded.data.u !== dateValue(input.toExclusive)
    )
      throw new OrganizationAuditHistoryError("invalid_cursor");
    cursor = { occurredAtCursor: decoded.data.t, eventId: decoded.data.i };
  }

  const rows = await (input.repository ?? createOrganizationAuditRepository(input.db)).listEvents({
    organizationId: input.organizationId,
    requesterProfileId: input.actorProfileId,
    limit: input.limit,
    cursor,
    action: input.action,
    actorProfileId: input.auditActorProfileId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    fromInclusive: input.fromInclusive,
    toExclusive: input.toExclusive,
  });
  if (rows.length === 0) throw new OrganizationAuditHistoryError("forbidden");
  const eventRows = rows.filter((row): row is typeof row & AuditRow => row.eventId !== null);
  const pageRows = eventRows.slice(0, input.limit);
  const last = pageRows.at(-1);
  const hasMore = eventRows.length > input.limit;
  return {
    items: pageRows.map(mapEvent),
    hasMore,
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              v: cursorVersion,
              o: input.organizationId,
              t: last.occurredAtCursor,
              i: last.eventId,
              a: input.action,
              p: input.auditActorProfileId,
              r: input.resourceType,
              q: input.resourceId,
              f: dateValue(input.fromInclusive),
              u: dateValue(input.toExclusive),
            }),
          ).toString("base64url")
        : null,
  };
}
