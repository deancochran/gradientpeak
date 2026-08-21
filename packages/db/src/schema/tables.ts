import type { ActivityTrainingEffect } from "@repo/core/athlete-derived-state";
import {
  MAX_DAILY_AGGREGATE_COMMON_LOAD,
  MAX_TRAINING_STIMULUS_COMMON_LOAD,
} from "@repo/core/athlete-intelligence";
import type { PlannedSessionPrescriptionSnapshot } from "@repo/core/calendar";
import { GROUP_EVENT_RSVP_STATUSES } from "@repo/core/groups";
import { type PreferredUnitSystem, preferredUnitSystemValues } from "@repo/core/units";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "../auth-schema";
import { athleteReadScopeDbValues, organizationRoleKeyDbValues } from "./core-enum-parity";

import {
  activityCategoryEnum,
  activityEffortSourceSeriesEnum,
  activityFileIngestionSourceEnum,
  activityFileIngestionStatusEnum,
  activityIngestionFailureCodeEnum,
  activitySessionRpeSourceEnum,
  athleteRecalculationReasonEnum,
  effortTypeEnum,
  eventStatusEnum,
  eventTypeEnum,
  evidenceObservationSourceEnum,
  genderEnum,
  integrationProviderEnum,
  integrationResourceKindEnum,
  likeEntityTypeEnum,
  notificationTypeEnum,
  onboardingStatusEnum,
  plannedSessionCancellationReasonEnum,
  plannedSessionCompletionStateEnum,
  plannedSessionSourceKindEnum,
  plannedSessionStatusEnum,
  profileMetricTypeEnum,
  thresholdEvaluationEffortRoleEnum,
  thresholdEvaluationOutcomeEnum,
  thresholdEvaluationRejectionReasonEnum,
  thresholdEvidenceStatusEnum,
  thresholdMetricEnum,
} from "./enums";

const preferredUnitSystemDbValues =
  preferredUnitSystemValues satisfies readonly PreferredUnitSystem[];
const maxTrainingStimulusCommonLoadSql = sql.raw(String(MAX_TRAINING_STIMULUS_COMMON_LOAD));
const maxDailyAggregateCommonLoadSql = sql.raw(String(MAX_DAILY_AGGREGATE_COMMON_LOAD));

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    email: text("email"),
    full_name: text("full_name"),
    username: text("username"),
    avatar_url: text("avatar_url"),
    cover_url: text("cover_url"),
    bio: text("bio"),
    dob: timestamp("dob", { withTimezone: true, mode: "date" }),
    gender: genderEnum("gender"),
    language: text("language"),
    planning_timezone: text("planning_timezone"),
    preferred_units: text("preferred_units", { enum: preferredUnitSystemDbValues }),
    onboarding_status: onboardingStatusEnum("onboarding_status")
      .default("provider_selection")
      .notNull(),
    is_public: boolean("is_public").default(false).notNull(),
    default_content_visibility: text("default_content_visibility", {
      enum: ["private", "followers", "public"],
    })
      .notNull()
      .default("private"),
  },
  (table) => [
    uniqueIndex("profiles_username_unique_idx").on(table.username),
    uniqueIndex("profiles_email_unique_idx").on(table.email).where(sql`${table.email} is not null`),
    foreignKey({
      columns: [table.id],
      foreignColumns: [users.id],
      name: "profiles_id_fkey",
    }).onDelete("cascade"),
    check(
      "profiles_preferred_units_check",
      sql`${table.preferred_units} is null or ${table.preferred_units} in ('metric', 'imperial')`,
    ),
    check(
      "profiles_default_content_visibility_check",
      sql`${table.default_content_visibility} in ('private', 'followers', 'public')`,
    ),
  ],
);

export const profileAthleteState = pgTable(
  "profile_athlete_state",
  {
    profile_id: uuid("profile_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    source_revision: bigint("source_revision", { mode: "number" }).default(0).notNull(),
    published_revision: bigint("published_revision", { mode: "number" }).default(0).notNull(),
    dirty_from_at: timestamp("dirty_from_at", { withTimezone: true, mode: "date" }),
    activity_analysis_cursor_started_at: timestamp("activity_analysis_cursor_started_at", {
      withTimezone: true,
      mode: "date",
    }),
    activity_analysis_cursor_activity_id: uuid("activity_analysis_cursor_activity_id"),
    fitness: numeric("fitness", { mode: "number" }).default(0).notNull(),
    fatigue: numeric("fatigue", { mode: "number" }).default(0).notNull(),
    evidence_confidence: numeric("evidence_confidence", { mode: "number" }).default(0).notNull(),
    coverage_start_at: timestamp("coverage_start_at", { withTimezone: true, mode: "date" }),
    coverage_end_at: timestamp("coverage_end_at", { withTimezone: true, mode: "date" }),
    last_activity_at: timestamp("last_activity_at", { withTimezone: true, mode: "date" }),
    algorithm_version: text("algorithm_version").notNull().default("athlete-state-projection-v1"),
    computed_at: timestamp("computed_at", { withTimezone: true, mode: "date" }),
    lease_token: uuid("lease_token"),
    lease_expires_at: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    retry_after: timestamp("retry_after", { withTimezone: true, mode: "date" }),
    consecutive_failures: integer("consecutive_failures").default(0).notNull(),
    last_failure_code: text("last_failure_code"),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("profile_athlete_state_claim_idx").on(
      table.retry_after,
      table.dirty_from_at,
      table.updated_at,
    ),
    check(
      "profile_athlete_state_revision_check",
      sql`${table.source_revision} >= 0 and ${table.published_revision} >= 0 and ${table.published_revision} <= ${table.source_revision}`,
    ),
    check("profile_athlete_state_fitness_check", sql`${table.fitness} >= 0`),
    check("profile_athlete_state_fatigue_check", sql`${table.fatigue} >= 0`),
    check(
      "profile_athlete_state_confidence_check",
      sql`${table.evidence_confidence} between 0 and 1`,
    ),
    check(
      "profile_athlete_state_lease_check",
      sql`num_nonnulls(${table.lease_token}, ${table.lease_expires_at}) in (0, 2)`,
    ),
    check(
      "profile_athlete_state_analysis_cursor_check",
      sql`num_nonnulls(${table.activity_analysis_cursor_started_at}, ${table.activity_analysis_cursor_activity_id}) in (0, 2)`,
    ),
    check("profile_athlete_state_failures_check", sql`${table.consecutive_failures} >= 0`),
    check("profile_athlete_state_algorithm_check", sql`btrim(${table.algorithm_version}) <> ''`),
  ],
);

export const profilePerformanceEstimates = pgTable(
  "profile_performance_estimates",
  {
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    capability_kind: text("capability_kind").notNull(),
    activity_category: activityCategoryEnum("activity_category").notNull(),
    value: numeric("value", { mode: "number" }).notNull(),
    unit: text("unit").notNull(),
    confidence: numeric("confidence", { mode: "number" }).notNull(),
    effective_at: timestamp("effective_at", { withTimezone: true, mode: "date" }).notNull(),
    evidence_window_start_at: timestamp("evidence_window_start_at", {
      withTimezone: true,
      mode: "date",
    }),
    evidence_window_end_at: timestamp("evidence_window_end_at", {
      withTimezone: true,
      mode: "date",
    }),
    algorithm_version: text("algorithm_version").notNull(),
    source_revision: bigint("source_revision", { mode: "number" }).notNull(),
    target_fact: jsonb("target_fact"),
    computed_at: timestamp("computed_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.profile_id, table.capability_kind, table.activity_category] }),
    index("profile_performance_estimates_profile_revision_idx").on(
      table.profile_id,
      table.source_revision,
    ),
    check("profile_performance_estimates_kind_check", sql`btrim(${table.capability_kind}) <> ''`),
    check("profile_performance_estimates_unit_check", sql`btrim(${table.unit}) <> ''`),
    check("profile_performance_estimates_value_check", sql`${table.value} >= 0`),
    check(
      "profile_performance_estimates_confidence_check",
      sql`${table.confidence} between 0 and 1`,
    ),
    check(
      "profile_performance_estimates_algorithm_check",
      sql`btrim(${table.algorithm_version}) <> ''`,
    ),
    check("profile_performance_estimates_revision_check", sql`${table.source_revision} >= 0`),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    created_by_profile_id: uuid("created_by_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    avatar_url: text("avatar_url"),
    cover_url: text("cover_url"),
    access_level: text("access_level", { enum: ["public", "members_only"] })
      .notNull()
      .default("public"),
    join_policy: text("join_policy", { enum: ["open", "request_to_join", "invite_only"] })
      .notNull()
      .default("open"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("groups_slug_unique_idx").on(table.slug).where(sql`${table.deleted_at} is null`),
    index("groups_created_at_idx")
      .on(table.created_at.desc())
      .where(sql`${table.deleted_at} is null`),
    index("idx_groups_created_by_profile_id").on(table.created_by_profile_id),
    check("groups_access_level_check", sql`${table.access_level} in ('public', 'members_only')`),
    check(
      "groups_join_policy_check",
      sql`${table.join_policy} in ('open', 'request_to_join', 'invite_only')`,
    ),
    check("groups_name_non_empty", sql`btrim(${table.name}) <> ''`),
    check("groups_slug_non_empty", sql`btrim(${table.slug}) <> ''`),
  ],
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    group_id: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    status: text("status", { enum: ["active", "left", "removed"] })
      .notNull()
      .default("active"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.group_id, table.profile_id] }),
    index("group_memberships_profile_status_idx").on(table.profile_id, table.status),
    index("group_memberships_group_status_idx").on(table.group_id, table.status),
    check("group_memberships_role_check", sql`${table.role} in ('owner', 'admin', 'member')`),
    check("group_memberships_status_check", sql`${table.status} in ('active', 'left', 'removed')`),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "restrict" }),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    suspended_at: timestamp("suspended_at", { withTimezone: true, mode: "date" }),
    ended_at: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("organization_memberships_organization_profile_unique").on(
      table.organization_id,
      table.profile_id,
    ),
    unique("organization_memberships_organization_id_id_unique").on(
      table.organization_id,
      table.id,
    ),
    unique("organization_memberships_organization_id_id_profile_unique").on(
      table.organization_id,
      table.id,
      table.profile_id,
    ),
    index("organization_memberships_active_profile_idx")
      .on(table.profile_id, table.organization_id)
      .where(sql`${table.suspended_at} is null and ${table.ended_at} is null`),
    index("organization_memberships_active_organization_idx")
      .on(table.organization_id, table.id)
      .where(sql`${table.suspended_at} is null and ${table.ended_at} is null`),
    check(
      "organization_memberships_lifecycle_check",
      sql`${table.ended_at} is null or ${table.suspended_at} is null`,
    ),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    created_by_profile_id: uuid("created_by_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    root_owner_membership_id: uuid("root_owner_membership_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull(),
    suspended_at: timestamp("suspended_at", { withTimezone: true, mode: "date" }),
    closed_at: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.id, table.root_owner_membership_id],
      foreignColumns: [organizationMemberships.organization_id, organizationMemberships.id],
      name: "organizations_root_owner_membership_fkey",
    }).onDelete("restrict"),
    uniqueIndex("organizations_slug_unique_idx").on(table.slug),
    index("organizations_created_by_profile_id_idx").on(table.created_by_profile_id),
    check("organizations_name_non_empty", sql`btrim(${table.name}) <> ''`),
    check("organizations_slug_non_empty", sql`btrim(${table.slug}) <> ''`),
    check("organizations_timezone_non_empty", sql`btrim(${table.timezone}) <> ''`),
    check(
      "organizations_lifecycle_check",
      sql`${table.closed_at} is null or ${table.suspended_at} is null`,
    ),
  ],
);

export const organizationMembershipRoleGrants = pgTable(
  "organization_membership_role_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    membership_id: uuid("membership_id").notNull(),
    role_key: text("role_key", { enum: organizationRoleKeyDbValues }).notNull(),
    granted_at: timestamp("granted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    revoked_at: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id, table.membership_id],
      foreignColumns: [organizationMemberships.organization_id, organizationMemberships.id],
      name: "organization_membership_role_grants_membership_fkey",
    }).onDelete("restrict"),
    uniqueIndex("organization_membership_role_grants_active_unique")
      .on(table.organization_id, table.membership_id, table.role_key)
      .where(sql`${table.revoked_at} is null`),
    index("organization_membership_role_grants_membership_fkey_idx").on(
      table.organization_id,
      table.membership_id,
    ),
    check(
      "organization_membership_role_grants_role_key_check",
      sql`${table.role_key} in ('admin', 'coach')`,
    ),
    check(
      "organization_membership_role_grants_revocation_chronology_check",
      sql`${table.revoked_at} is null or ${table.revoked_at} >= ${table.granted_at}`,
    ),
  ],
);

export const coachingEngagements = pgTable(
  "coaching_engagements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id").notNull(),
    athlete_profile_id: uuid("athlete_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    paused_at: timestamp("paused_at", { withTimezone: true, mode: "date" }),
    ended_at: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: "coaching_engagements_organization_fkey",
    }).onDelete("restrict"),
    unique("coaching_engagements_organization_id_id_unique").on(table.organization_id, table.id),
    unique("coaching_engagements_organization_id_id_athlete_unique").on(
      table.organization_id,
      table.id,
      table.athlete_profile_id,
    ),
    uniqueIndex("coaching_engagements_current_unique")
      .on(table.organization_id, table.athlete_profile_id)
      .where(sql`${table.ended_at} is null`),
    index("coaching_engagements_athlete_profile_organization_idx").on(
      table.athlete_profile_id,
      table.organization_id,
    ),
    check(
      "coaching_engagements_lifecycle_check",
      sql`${table.ended_at} is null or ${table.paused_at} is null`,
    ),
  ],
);

export const coachingAssignments = pgTable(
  "coaching_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id").notNull(),
    engagement_id: uuid("engagement_id").notNull(),
    coach_membership_id: uuid("coach_membership_id").notNull(),
    assignment_kind: text("assignment_kind", { enum: ["primary", "supporting"] }).notNull(),
    assigned_at: timestamp("assigned_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    ended_at: timestamp("ended_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id, table.engagement_id],
      foreignColumns: [coachingEngagements.organization_id, coachingEngagements.id],
      name: "coaching_assignments_engagement_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organization_id, table.coach_membership_id],
      foreignColumns: [organizationMemberships.organization_id, organizationMemberships.id],
      name: "coaching_assignments_membership_fkey",
    }).onDelete("restrict"),
    uniqueIndex("coaching_assignments_active_primary_unique")
      .on(table.engagement_id)
      .where(sql`${table.assignment_kind} = 'primary' and ${table.ended_at} is null`),
    uniqueIndex("coaching_assignments_active_kind_unique")
      .on(table.engagement_id, table.coach_membership_id, table.assignment_kind)
      .where(sql`${table.ended_at} is null`),
    index("coaching_assignments_active_coach_membership_idx")
      .on(table.organization_id, table.coach_membership_id)
      .where(sql`${table.ended_at} is null`),
    index("coaching_assignments_engagement_fkey_idx").on(
      table.organization_id,
      table.engagement_id,
    ),
    index("coaching_assignments_membership_fkey_idx").on(
      table.organization_id,
      table.coach_membership_id,
    ),
    check(
      "coaching_assignments_kind_check",
      sql`${table.assignment_kind} in ('primary', 'supporting')`,
    ),
    check(
      "coaching_assignments_chronology_check",
      sql`${table.ended_at} is null or ${table.ended_at} >= ${table.assigned_at}`,
    ),
  ],
);

export const athleteConsentPolicyVersions = pgTable(
  "athlete_consent_policy_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope_key: text("scope_key", { enum: athleteReadScopeDbValues }).notNull(),
    effective_from: timestamp("effective_from", { withTimezone: true, mode: "date" }).notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    terms_text: text("terms_text").notNull(),
    content_digest: text("content_digest").notNull(),
    supersedes_policy_version_id: uuid("supersedes_policy_version_id"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("athlete_consent_policy_versions_id_scope_unique").on(table.id, table.scope_key),
    foreignKey({
      columns: [table.supersedes_policy_version_id, table.scope_key],
      foreignColumns: [table.id, table.scope_key],
      name: "athlete_consent_policy_versions_supersedes_scope_fkey",
    }).onDelete("restrict"),
    check(
      "athlete_consent_policy_versions_scope_check",
      sql`${table.scope_key} in ('basic_profile', 'training', 'activities', 'metrics', 'goals', 'calendar')`,
    ),
    check("athlete_consent_policy_versions_terms_non_empty", sql`btrim(${table.terms_text}) <> ''`),
    check(
      "athlete_consent_policy_versions_digest_non_empty",
      sql`btrim(${table.content_digest}) <> ''`,
    ),
    check(
      "athlete_consent_policy_versions_supersedes_not_self_check",
      sql`${table.supersedes_policy_version_id} is null or ${table.supersedes_policy_version_id} <> ${table.id}`,
    ),
    index("athlete_consent_policy_versions_supersedes_scope_fkey_idx").on(
      table.supersedes_policy_version_id,
      table.scope_key,
    ),
  ],
);

export const athleteDataSharingConsents = pgTable(
  "athlete_data_sharing_consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id").notNull(),
    engagement_id: uuid("engagement_id").notNull(),
    athlete_profile_id: uuid("athlete_profile_id").notNull(),
    scope_key: text("scope_key", { enum: athleteReadScopeDbValues }).notNull(),
    policy_version_id: uuid("policy_version_id").notNull(),
    granted_by_profile_id: uuid("granted_by_profile_id").notNull(),
    granted_at: timestamp("granted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    ended_at: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    superseded_by_consent_id: uuid("superseded_by_consent_id"),
  },
  (table) => [
    unique("athlete_data_sharing_consents_authority_identity_unique").on(
      table.organization_id,
      table.engagement_id,
      table.athlete_profile_id,
      table.scope_key,
      table.id,
    ),
    foreignKey({
      columns: [table.organization_id, table.engagement_id, table.athlete_profile_id],
      foreignColumns: [
        coachingEngagements.organization_id,
        coachingEngagements.id,
        coachingEngagements.athlete_profile_id,
      ],
      name: "athlete_data_sharing_consents_engagement_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.policy_version_id, table.scope_key],
      foreignColumns: [athleteConsentPolicyVersions.id, athleteConsentPolicyVersions.scope_key],
      name: "athlete_data_sharing_consents_policy_scope_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.organization_id,
        table.engagement_id,
        table.athlete_profile_id,
        table.scope_key,
        table.superseded_by_consent_id,
      ],
      foreignColumns: [
        table.organization_id,
        table.engagement_id,
        table.athlete_profile_id,
        table.scope_key,
        table.id,
      ],
      name: "athlete_data_sharing_consents_successor_fkey",
    }).onDelete("restrict"),
    uniqueIndex("athlete_data_sharing_consents_current_unique")
      .on(table.organization_id, table.engagement_id, table.athlete_profile_id, table.scope_key)
      .where(sql`${table.ended_at} is null`),
    index("athlete_data_sharing_consents_policy_scope_idx").on(
      table.policy_version_id,
      table.scope_key,
    ),
    index("athlete_data_sharing_consents_successor_idx")
      .on(table.superseded_by_consent_id)
      .where(sql`${table.superseded_by_consent_id} is not null`),
    index("athlete_data_sharing_consents_engagement_fkey_idx").on(
      table.organization_id,
      table.engagement_id,
      table.athlete_profile_id,
    ),
    index("athlete_data_sharing_consents_successor_fkey_idx").on(
      table.organization_id,
      table.engagement_id,
      table.athlete_profile_id,
      table.scope_key,
      table.superseded_by_consent_id,
    ),
    check(
      "athlete_data_sharing_consents_grantor_check",
      sql`${table.granted_by_profile_id} = ${table.athlete_profile_id}`,
    ),
    check(
      "athlete_data_sharing_consents_expiry_chronology_check",
      sql`${table.expires_at} is null or ${table.expires_at} >= ${table.granted_at}`,
    ),
    check(
      "athlete_data_sharing_consents_end_chronology_check",
      sql`${table.ended_at} is null or ${table.ended_at} >= ${table.granted_at}`,
    ),
    check(
      "athlete_data_sharing_consents_successor_not_self_check",
      sql`${table.superseded_by_consent_id} is null or ${table.superseded_by_consent_id} <> ${table.id}`,
    ),
  ],
);

export const organizationAuditEvents = pgTable(
  "organization_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    actor_profile_id: uuid("actor_profile_id").references(() => profiles.id, {
      onDelete: "restrict",
    }),
    actor_membership_id: uuid("actor_membership_id"),
    action: text("action").notNull(),
    resource_type: text("resource_type").notNull(),
    resource_id: uuid("resource_id"),
    occurred_at: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    correlation_id: uuid("correlation_id"),
    details: jsonb("details").notNull().default({}),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id, table.actor_membership_id],
      foreignColumns: [organizationMemberships.organization_id, organizationMemberships.id],
      name: "organization_audit_events_actor_membership_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organization_id, table.actor_membership_id, table.actor_profile_id],
      foreignColumns: [
        organizationMemberships.organization_id,
        organizationMemberships.id,
        organizationMemberships.profile_id,
      ],
      name: "organization_audit_events_actor_identity_fkey",
    }).onDelete("restrict"),
    index("organization_audit_events_organization_occurred_idx").on(
      table.organization_id,
      table.occurred_at,
    ),
    index("organization_audit_events_actor_membership_idx")
      .on(table.organization_id, table.actor_membership_id)
      .where(sql`${table.actor_membership_id} is not null`),
    index("organization_audit_events_actor_membership_fkey_idx").on(
      table.organization_id,
      table.actor_membership_id,
    ),
    index("organization_audit_events_actor_identity_fkey_idx").on(
      table.organization_id,
      table.actor_membership_id,
      table.actor_profile_id,
    ),
    uniqueIndex("organization_audit_events_correlation_action_unique")
      .on(table.organization_id, table.correlation_id, table.action)
      .where(sql`${table.correlation_id} is not null`),
    check("organization_audit_events_action_non_empty", sql`btrim(${table.action}) <> ''`),
    check(
      "organization_audit_events_resource_type_non_empty",
      sql`btrim(${table.resource_type}) <> ''`,
    ),
    check(
      "organization_audit_events_details_object",
      sql`jsonb_typeof(${table.details}) = 'object'`,
    ),
    check(
      "organization_audit_events_details_size_check",
      sql`pg_column_size(${table.details}) <= 4096`,
    ),
    check(
      "organization_audit_events_actor_membership_profile_check",
      sql`${table.actor_membership_id} is null or ${table.actor_profile_id} is not null`,
    ),
  ],
);

export const groupInvitations = pgTable(
  "group_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    group_id: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    invited_profile_id: uuid("invited_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted", "declined", "revoked", "expired"] })
      .notNull()
      .default("pending"),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("group_invitations_invited_profile_status_idx").on(
      table.invited_profile_id,
      table.status,
    ),
    uniqueIndex("group_invitations_pending_profile_unique_idx")
      .on(table.group_id, table.invited_profile_id)
      .where(sql`${table.status} = 'pending'`),
    check(
      "group_invitations_status_check",
      sql`${table.status} in ('pending', 'accepted', 'declined', 'revoked', 'expired')`,
    ),
  ],
);

export const groupJoinRequests = pgTable(
  "group_join_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    group_id: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "approved", "declined", "cancelled"] })
      .notNull()
      .default("pending"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("group_join_requests_group_status_idx").on(table.group_id, table.status),
    index("idx_group_join_requests_profile_id").on(table.profile_id),
    uniqueIndex("group_join_requests_pending_unique_idx")
      .on(table.group_id, table.profile_id)
      .where(sql`${table.status} = 'pending'`),
    check(
      "group_join_requests_status_check",
      sql`${table.status} in ('pending', 'approved', 'declined', 'cancelled')`,
    ),
  ],
);

export const activityRoutes = pgTable(
  "activity_routes",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    file_path: text("file_path").notNull(),
    file_sha256: text("file_sha256"),
    storage_state: text("storage_state", {
      enum: ["upload_pending", "ready", "deletion_pending"],
    })
      .notNull()
      .default("ready"),
    total_distance: integer("total_distance").notNull(),
    total_ascent: integer("total_ascent"),
    total_descent: integer("total_descent"),
    elevation_polyline: text("elevation_polyline"),
    polyline: text("polyline").notNull(),
    is_system_template: boolean("is_system_template").notNull().default(false),
    is_public: boolean("is_public").notNull().default(false),
  },
  (table) => [
    check("activity_routes_total_distance_check", sql`${table.total_distance} >= 0`),
    check("activity_routes_total_ascent_check", sql`${table.total_ascent} >= 0`),
    check("activity_routes_total_descent_check", sql`${table.total_descent} >= 0`),
    check(
      "activity_routes_file_sha256_check",
      sql`${table.file_sha256} is null or ${table.file_sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "activity_routes_storage_state_check",
      sql`${table.storage_state} in ('upload_pending', 'ready', 'deletion_pending')`,
    ),
    check(
      "activity_routes_system_templates_public_check",
      sql`${table.is_system_template} = false or ${table.is_public} = true`,
    ),
    check(
      "activity_routes_system_template_check",
      sql`(${table.is_system_template} = true and ${table.profile_id} is null) or (${table.is_system_template} = false and ${table.profile_id} is not null)`,
    ),
    index("idx_routes_profile_id").on(table.profile_id).where(sql`${table.profile_id} is not null`),
    index("idx_routes_name").on(table.name),
    index("idx_routes_created_at").on(table.created_at),
    index("idx_routes_profile_storage_state").on(table.profile_id, table.storage_state),
    index("idx_routes_is_system_template")
      .on(table.is_system_template)
      .where(sql`${table.is_system_template} = true`),
  ],
);

export const activityRouteDeletionReceipts = pgTable(
  "activity_route_deletion_receipts",
  {
    route_id: uuid("route_id").primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    file_path: text("file_path").notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_activity_route_deletion_receipts_profile").on(table.profile_id)],
);

export const activityPlans = pgTable(
  "activity_plans",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    notes: text("notes"),
    structure: jsonb("structure").notNull(),
    structure_hash: text("structure_hash").notNull(),
    revision: integer("revision").notNull().default(1),
    gps_recording_enabled: boolean("gps_recording_enabled").notNull().default(true),
    content_visibility: text("content_visibility", { enum: ["private", "followers", "public"] })
      .notNull()
      .default("private"),
    is_system_template: boolean("is_system_template").notNull().default(false),
    system_content_key: text("system_content_key"),
    system_content_version: integer("system_content_version"),
    system_content_hash: text("system_content_hash"),
  },
  (table) => [
    check(
      "activity_plans_structure_v3_check",
      sql`jsonb_typeof(${table.structure}) = 'object' and ${table.structure}->>'version' = '3' and ${table.structure}->>'activity_category' in ('run', 'bike', 'swim', 'strength', 'other') and jsonb_typeof(${table.structure}->'segments') = 'array' and jsonb_array_length(${table.structure}->'segments') between 1 and 64 and pg_column_size(${table.structure}) <= 1048576`,
    ),
    check(
      "activity_plans_structure_canonical_check",
      sql`public.activity_plan_structure_is_canonical(${table.structure})`,
    ),
    check(
      "activity_plans_structure_hash_check",
      sql`${table.structure_hash} ~ '^v1:sha256:[0-9a-f]{64}$'`,
    ),
    check("activity_plans_revision_check", sql`${table.revision} >= 1`),
    check(
      "activity_plans_content_visibility_check",
      sql`${table.content_visibility} in ('private', 'followers', 'public')`,
    ),
    check(
      "activity_plans_system_templates_public_check",
      sql`${table.is_system_template} = false or ${table.content_visibility} = 'public'`,
    ),
    check(
      "activity_plans_system_template_check",
      sql`(${table.is_system_template} = true and ${table.profile_id} is null) or (${table.is_system_template} = false and ${table.profile_id} is not null)`,
    ),
    check(
      "activity_plans_system_content_identity_check",
      sql`(${table.is_system_template} and ${table.system_content_key} is not null and btrim(${table.system_content_key}) <> '' and ${table.system_content_version} > 0 and ${table.system_content_hash} ~ '^v1:sha256:[0-9a-f]{64}$') or (not ${table.is_system_template} and num_nonnulls(${table.system_content_key}, ${table.system_content_version}, ${table.system_content_hash}) = 0)`,
    ),
    uniqueIndex("activity_plans_system_content_key_unique")
      .on(table.system_content_key)
      .where(sql`${table.system_content_key} is not null`),
    index("idx_activity_plans_profile_id")
      .on(table.profile_id)
      .where(sql`${table.profile_id} is not null`),
    index("idx_activity_plans_system_templates")
      .on(table.is_system_template)
      .where(sql`${table.is_system_template} = true`),
    index("idx_activity_plans_content_visibility").on(table.content_visibility),
    index("idx_activity_plans_structure_categories").using(
      "gin",
      table.structure.op("jsonb_path_ops"),
    ),
  ],
);

export const groupEvents = pgTable(
  "group_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    group_id: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    series_id: uuid("series_id").references((): AnyPgColumn => groupEvents.id, {
      onDelete: "cascade",
    }),
    created_by_profile_id: uuid("created_by_profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    starts_at: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    timezone: text("timezone").notNull(),
    recurrence_rule: text("recurrence_rule"),
    recurrence_timezone: text("recurrence_timezone"),
    occurrence_key: text("occurrence_key"),
    location_name: text("location_name"),
    route_id: uuid("route_id").references(() => activityRoutes.id, { onDelete: "set null" }),
    activity_plan_id: uuid("activity_plan_id").references(() => activityPlans.id, {
      onDelete: "set null",
    }),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("group_events_group_starts_at_idx").on(table.group_id, table.starts_at),
    index("group_events_group_cancelled_starts_at_idx").on(
      table.group_id,
      table.cancelled_at,
      table.starts_at,
    ),
    uniqueIndex("group_events_series_occurrence_unique_idx")
      .on(table.series_id, table.occurrence_key)
      .where(sql`${table.series_id} is not null`),
    index("group_events_series_starts_at_idx")
      .on(table.series_id, table.starts_at)
      .where(sql`${table.series_id} is not null`),
    index("idx_group_events_created_by_profile_id")
      .on(table.created_by_profile_id)
      .where(sql`${table.created_by_profile_id} is not null`),
    index("idx_group_events_route_id").on(table.route_id).where(sql`${table.route_id} is not null`),
    index("idx_group_events_activity_plan_id")
      .on(table.activity_plan_id)
      .where(sql`${table.activity_plan_id} is not null`),
    check("group_events_title_non_empty", sql`btrim(${table.title}) <> ''`),
    check(
      "group_events_time_window",
      sql`${table.ends_at} is null or ${table.ends_at} > ${table.starts_at}`,
    ),
    check(
      "group_events_series_not_self",
      sql`${table.series_id} is null or ${table.series_id} <> ${table.id}`,
    ),
    check("group_events_timezone_non_empty", sql`btrim(${table.timezone}) <> ''`),
    check(
      "group_events_recurrence_rule_non_empty",
      sql`${table.recurrence_rule} is null or btrim(${table.recurrence_rule}) <> ''`,
    ),
    check(
      "group_events_recurrence_timezone_non_empty",
      sql`${table.recurrence_timezone} is null or btrim(${table.recurrence_timezone}) <> ''`,
    ),
    check(
      "group_events_recurrence_timezone_requires_rule",
      sql`${table.recurrence_timezone} is null or ${table.recurrence_rule} is not null`,
    ),
    check(
      "group_events_occurrence_key_required",
      sql`${table.series_id} is null or (${table.occurrence_key} is not null and btrim(${table.occurrence_key}) <> '')`,
    ),
    check(
      "group_events_location_name_non_empty",
      sql`${table.location_name} is null or btrim(${table.location_name}) <> ''`,
    ),
  ],
);

export const groupEventRsvps = pgTable(
  "group_event_rsvps",
  {
    group_event_id: uuid("group_event_id")
      .notNull()
      .references(() => groupEvents.id, { onDelete: "cascade" }),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status", { enum: GROUP_EVENT_RSVP_STATUSES }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.group_event_id, table.profile_id] }),
    check("group_event_rsvps_status_check", sql`${table.status} in ('going', 'declined')`),
  ],
);

export const groupEventSeriesRsvps = pgTable(
  "group_event_series_rsvps",
  {
    group_event_series_id: uuid("group_event_series_id")
      .notNull()
      .references(() => groupEvents.id, { onDelete: "cascade" }),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status", { enum: GROUP_EVENT_RSVP_STATUSES }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.group_event_series_id, table.profile_id] }),
    check("group_event_series_rsvps_status_check", sql`${table.status} in ('going', 'declined')`),
  ],
);

export const trainingPlans = pgTable(
  "training_plans",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    structure: jsonb("structure").notNull(),
    structure_hash: text("structure_hash").notNull(),
    content_visibility: text("content_visibility", { enum: ["private", "followers", "public"] })
      .notNull()
      .default("private"),
    is_system_template: boolean("is_system_template").notNull().default(false),
    system_content_key: text("system_content_key"),
    system_content_version: integer("system_content_version"),
    system_content_hash: text("system_content_hash"),
    sessions_per_week_target: integer("sessions_per_week_target"),
    duration_hours: numeric("duration_hours", { precision: 12, scale: 2, mode: "number" }),
    revision: integer("revision").default(1).notNull(),
    validated_state_revision: bigint("validated_state_revision", { mode: "number" }),
    validated_at: timestamp("validated_at", { withTimezone: true, mode: "date" }),
    projection_algorithm_version: text("projection_algorithm_version"),
  },
  (table) => [
    check(
      "training_plans_structure_v1_check",
      sql`jsonb_typeof(${table.structure}) = 'object' and ${table.structure}->>'version' = '1' and jsonb_typeof(${table.structure}->'sessions') = 'array' and jsonb_array_length(${table.structure}->'sessions') > 0 and pg_column_size(${table.structure}) <= 1048576`,
    ),
    check(
      "training_plans_structure_hash_check",
      sql`${table.structure_hash} ~ '^v1:sha256:[0-9a-f]{64}$'`,
    ),
    check(
      "training_plans_content_visibility_check",
      sql`${table.content_visibility} in ('private', 'followers', 'public')`,
    ),
    check(
      "training_plans_system_templates_public_check",
      sql`${table.is_system_template} = false or ${table.content_visibility} = 'public'`,
    ),
    check(
      "training_plans_template_profile_check",
      sql`(${table.is_system_template} = true and ${table.profile_id} is null) or (${table.is_system_template} = false and ${table.profile_id} is not null)`,
    ),
    check(
      "training_plans_system_content_identity_check",
      sql`(${table.is_system_template} and ${table.system_content_key} is not null and btrim(${table.system_content_key}) <> '' and ${table.system_content_version} > 0 and ${table.system_content_hash} ~ '^v1:sha256:[0-9a-f]{64}$') or (not ${table.is_system_template} and num_nonnulls(${table.system_content_key}, ${table.system_content_version}, ${table.system_content_hash}) = 0)`,
    ),
    uniqueIndex("training_plans_system_content_key_unique")
      .on(table.system_content_key)
      .where(sql`${table.system_content_key} is not null`),
    check("training_plans_revision_check", sql`${table.revision} > 0`),
    check(
      "training_plans_projection_validation_check",
      sql`num_nonnulls(${table.validated_state_revision}, ${table.validated_at}, ${table.projection_algorithm_version}) in (0, 3) and (${table.validated_state_revision} is null or ${table.validated_state_revision} >= 0) and (${table.projection_algorithm_version} is null or btrim(${table.projection_algorithm_version}) <> '')`,
    ),
    index("idx_training_plans_profile_id")
      .on(table.profile_id)
      .where(sql`${table.profile_id} is not null`),
    index("idx_training_plans_is_system_template")
      .on(table.is_system_template)
      .where(sql`${table.is_system_template} = true`),
    index("idx_training_plans_name").on(table.name),
    index("idx_training_plans_content_visibility").on(table.content_visibility),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    event_type: eventTypeEnum("event_type").notNull(),
    status: eventStatusEnum("status").notNull().default("scheduled"),
    title: text("title").notNull(),
    description: text("description"),
    notes: text("notes"),
    all_day: boolean("all_day").notNull().default(false),
    timezone: text("timezone").notNull().default("UTC"),
    starts_at: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    scheduled_date: text("scheduled_date").notNull(),
    training_plan_id: uuid("training_plan_id").references(() => trainingPlans.id, {
      onDelete: "set null",
    }),
    activity_plan_id: uuid("activity_plan_id").references(() => activityPlans.id, {
      onDelete: "set null",
    }),
    linked_activity_id: uuid("linked_activity_id").references(() => activities.id),
    route_id: uuid("route_id").references(() => activityRoutes.id),
    recurrence_rule: text("recurrence_rule"),
    recurrence_timezone: text("recurrence_timezone"),
    series_id: uuid("series_id").references((): AnyPgColumn => events.id),
    occurrence_key: text("occurrence_key").notNull().default(""),
    original_starts_at: timestamp("original_starts_at", { withTimezone: true, mode: "date" }),
    schedule_batch_id: uuid("schedule_batch_id"),
  },
  (table) => [
    unique("events_id_profile_id_unique").on(table.id, table.profile_id),
    check(
      "events_time_window",
      sql`${table.ends_at} is null or ${table.ends_at} > ${table.starts_at}`,
    ),
    check(
      "events_recurrence_rule_non_empty",
      sql`${table.recurrence_rule} is null or btrim(${table.recurrence_rule}) <> ''`,
    ),
    check(
      "events_recurrence_timezone_non_empty",
      sql`${table.recurrence_timezone} is null or btrim(${table.recurrence_timezone}) <> ''`,
    ),
    check(
      "events_recurrence_timezone_requires_rule",
      sql`${table.recurrence_timezone} is null or ${table.recurrence_rule} is not null`,
    ),
    check(
      "events_series_occurrence_key_required",
      sql`${table.series_id} is null or btrim(${table.occurrence_key}) <> ''`,
    ),
    check(
      "events_recurrence_occurrence_key_required",
      sql`${table.recurrence_rule} is null or btrim(${table.occurrence_key}) <> ''`,
    ),
    check(
      "events_occurrence_scheduled_date_identity",
      sql`${table.occurrence_key} = '' or ${table.scheduled_date} = ${table.occurrence_key}`,
    ),
    check(
      "events_series_not_self",
      sql`${table.series_id} is null or ${table.series_id} <> ${table.id}`,
    ),
    uniqueIndex("idx_events_series_occurrence_unique")
      .on(table.series_id, table.occurrence_key)
      .where(sql`${table.series_id} is not null`),
    index("idx_events_training_plan_id")
      .on(table.training_plan_id)
      .where(sql`${table.training_plan_id} is not null`),
    index("idx_events_activity_plan_id")
      .on(table.activity_plan_id)
      .where(sql`${table.activity_plan_id} is not null`),
    index("idx_events_linked_activity_id")
      .on(table.linked_activity_id)
      .where(sql`${table.linked_activity_id} is not null`),
    index("idx_events_route_id").on(table.route_id).where(sql`${table.route_id} is not null`),
    index("idx_events_schedule_batch")
      .on(table.profile_id, table.schedule_batch_id)
      .where(sql`${table.schedule_batch_id} is not null`),
    index("idx_events_event_type_starts_at").on(table.event_type, table.starts_at),
    index("idx_events_profile_starts_at").on(table.profile_id, table.starts_at),
    index("idx_events_profile_status_starts_at").on(
      table.profile_id,
      table.status,
      table.starts_at,
    ),
    index("idx_events_planned_day_summary")
      .on(table.profile_id, table.scheduled_date, table.starts_at, table.id, table.activity_plan_id)
      .where(
        sql`${table.event_type} = 'planned' and ${table.status} in ('scheduled', 'completed')`,
      ),
  ],
);

export const contentAccessGrants = pgTable(
  "content_access_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    content_type: text("content_type", {
      enum: ["profile", "event", "activity_plan", "activity_route", "training_plan"],
    }).notNull(),
    content_id: uuid("content_id").notNull(),
    grantee_profile_id: uuid("grantee_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    actor_profile_id: uuid("actor_profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    access_level: text("access_level", { enum: ["read", "read_geometry"] }).notNull(),
    source_type: text("source_type", { enum: ["event", "training_plan"] }).notNull(),
    source_id: uuid("source_id").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    revoked_at: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("content_access_grants_source_unique").on(
      table.content_type,
      table.content_id,
      table.grantee_profile_id,
      table.access_level,
      table.source_type,
      table.source_id,
    ),
    index("idx_content_access_grants_grantee_content").on(
      table.grantee_profile_id,
      table.content_type,
      table.content_id,
    ),
    index("idx_content_access_grants_source").on(table.source_type, table.source_id),
    index("idx_content_access_grants_active_expiry")
      .on(table.expires_at)
      .where(sql`${table.expires_at} is not null and ${table.revoked_at} is null`),
    index("idx_content_access_grants_actor_profile_id")
      .on(table.actor_profile_id)
      .where(sql`${table.actor_profile_id} is not null`),
    check(
      "content_access_grants_content_type_check",
      sql`${table.content_type} in ('profile', 'event', 'activity_plan', 'activity_route', 'training_plan')`,
    ),
    check(
      "content_access_grants_access_level_check",
      sql`${table.access_level} in ('read', 'read_geometry')`,
    ),
    check(
      "content_access_grants_source_type_check",
      sql`${table.source_type} in ('event', 'training_plan')`,
    ),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activity_plan_id: uuid("activity_plan_id").references(() => activityPlans.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    started_at: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    finished_at: timestamp("finished_at", { withTimezone: true, mode: "date" }).notNull(),
    notes: text("notes"),
    content_visibility: text("content_visibility", { enum: ["private", "followers", "public"] })
      .notNull()
      .default("private"),
    elapsed_ms: bigint("elapsed_ms", { mode: "number" }).notNull(),
    active_ms: bigint("active_ms", { mode: "number" }),
    moving_ms: bigint("moving_ms", { mode: "number" }),
    timing_coverage: text("timing_coverage", {
      enum: ["complete", "partial", "unavailable"],
    })
      .notNull()
      .default("unavailable"),
    segments_revision: integer("segments_revision").notNull().default(1),
    parser_version: text("parser_version").notNull(),
    decoded_contract_version: text("decoded_contract_version").notNull(),
    materializer_version: text("materializer_version").notNull(),
    canonical_evidence_tier: text("canonical_evidence_tier", {
      enum: ["inferred_fallback", "provider_summary", "raw_samples", "fit_artifact"],
    })
      .notNull()
      .default("inferred_fallback"),
    segments_generated_at: timestamp("segments_generated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    distance_meters: integer("distance_meters").notNull().default(0),
    elevation_gain_meters: numeric("elevation_gain_meters", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    elevation_loss_meters: numeric("elevation_loss_meters", {
      precision: 10,
      scale: 2,
      mode: "number",
    }),
    calories: integer("calories"),
    avg_heart_rate: integer("avg_heart_rate"),
    max_heart_rate: integer("max_heart_rate"),
    avg_power: integer("avg_power"),
    max_power: integer("max_power"),
    avg_cadence: integer("avg_cadence"),
    max_cadence: integer("max_cadence"),
    avg_speed_mps: numeric("avg_speed_mps", { precision: 6, scale: 2, mode: "number" }),
    max_speed_mps: numeric("max_speed_mps", { precision: 6, scale: 2, mode: "number" }),
    normalized_speed_mps: numeric("normalized_speed_mps", {
      precision: 6,
      scale: 2,
      mode: "number",
    }),
    // Canonical temperature is Celsius. Provider-unit conversion happens before persistence.
    avg_temperature: numeric("avg_temperature", { mode: "number" }),
    avg_swolf: numeric("avg_swolf", { mode: "number" }),
    pool_length_meters: numeric("pool_length_meters", { mode: "number" }),
    total_strokes: integer("total_strokes"),
    device_manufacturer: text("device_manufacturer"),
    device_product: text("device_product"),
    polyline: text("polyline"),
    laps: jsonb("laps").$type<unknown[]>().notNull().default([]),
    map_bounds: jsonb("map_bounds"),
    performance_target_snapshot: jsonb("performance_target_snapshot"),
    athlete_state_common_load: numeric("athlete_state_common_load", { mode: "number" }),
    athlete_state_activity_category: activityCategoryEnum("athlete_state_activity_category"),
    athlete_state_evidence_confidence: numeric("athlete_state_evidence_confidence", {
      mode: "number",
    }),
    athlete_state_capability_distance_meters: numeric("athlete_state_capability_distance_meters", {
      mode: "number",
    }),
    athlete_state_capability_duration_minutes: numeric(
      "athlete_state_capability_duration_minutes",
      { mode: "number" },
    ),
    athlete_state_input_version: text("athlete_state_input_version"),
    athlete_state_computed_at: timestamp("athlete_state_computed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    unique("activities_id_profile_id_unique").on(table.id, table.profile_id),
    index("idx_activities_activity_plan")
      .on(table.activity_plan_id)
      .where(sql`${table.activity_plan_id} is not null`),
    index("idx_activities_profile_started").on(table.profile_id, table.started_at),
    index("idx_activities_athlete_state_replay")
      .on(table.profile_id, table.finished_at, table.id)
      .where(
        sql`${table.athlete_state_common_load} is not null and ${table.athlete_state_activity_category} is not null and ${table.athlete_state_evidence_confidence} is not null and ${table.athlete_state_input_version} is not null and ${table.athlete_state_computed_at} is not null`,
      ),
    index("idx_activities_started").on(table.started_at),
    index("idx_activities_content_visibility").on(table.content_visibility),
    check(
      "activities_content_visibility_check",
      sql`${table.content_visibility} in ('private', 'followers', 'public')`,
    ),
    check("activities_distance_meters_check", sql`${table.distance_meters} >= 0`),
    check("activities_elapsed_ms_check", sql`${table.elapsed_ms} > 0`),
    check(
      "activities_active_ms_check",
      sql`${table.active_ms} is null or (${table.active_ms} >= 0 and ${table.active_ms} <= ${table.elapsed_ms})`,
    ),
    check(
      "activities_moving_ms_check",
      sql`${table.moving_ms} is null or (${table.moving_ms} >= 0 and ${table.moving_ms} <= coalesce(${table.active_ms}, ${table.elapsed_ms}))`,
    ),
    check("activities_segments_revision_check", sql`${table.segments_revision} > 0`),
    check(
      "activities_canonical_evidence_tier_check",
      sql`${table.canonical_evidence_tier} in ('inferred_fallback', 'provider_summary', 'raw_samples', 'fit_artifact')`,
    ),
    check(
      "activities_timing_coverage_values_check",
      sql`(${table.timing_coverage} = 'complete' and ${table.active_ms} is not null and ${table.moving_ms} is not null) or (${table.timing_coverage} in ('partial', 'unavailable') and ${table.active_ms} is null and ${table.moving_ms} is null)`,
    ),
    check(
      "activities_moving_time_check",
      sql`${table.moving_ms} is null or ${table.active_ms} is null or ${table.moving_ms} <= ${table.active_ms}`,
    ),
    check("activities_laps_array_check", sql`jsonb_typeof(${table.laps}) = 'array'`),
    check("activities_laps_count_check", sql`jsonb_array_length(${table.laps}) <= 1000`),
    check("activities_laps_size_check", sql`pg_column_size(${table.laps}) <= 1048576`),
    check(
      "activities_performance_target_snapshot_check",
      sql`${table.performance_target_snapshot} is null or (jsonb_typeof(${table.performance_target_snapshot}) = 'object' and pg_column_size(${table.performance_target_snapshot}) <= 65536)`,
    ),
    check(
      "activities_athlete_state_load_check",
      sql`${table.athlete_state_common_load} is null or ${table.athlete_state_common_load} >= 0`,
    ),
    check(
      "activities_athlete_state_confidence_check",
      sql`${table.athlete_state_evidence_confidence} is null or ${table.athlete_state_evidence_confidence} between 0 and 1`,
    ),
  ],
);

export const activityArtifacts = pgTable(
  "activity_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    digest_algorithm: text("digest_algorithm").notNull().default("sha256"),
    digest: text("digest").notNull(),
    byte_size: bigint("byte_size", { mode: "number" }).notNull(),
    bucket: text("bucket").notNull(),
    path: text("path").notNull(),
    media_type: text("media_type").notNull(),
    format: text("format").notNull(),
    original_name: text("original_name"),
    availability: text("availability", {
      enum: ["accepted", "deletion_pending", "deleted"],
    })
      .notNull()
      .default("accepted"),
    first_accepted_at: timestamp("first_accepted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    retention_until: timestamp("retention_until", { withTimezone: true, mode: "date" }),
    deletion_requested_at: timestamp("deletion_requested_at", {
      withTimezone: true,
      mode: "date",
    }),
    deleted_at: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("activity_artifacts_id_profile_unique").on(table.id, table.profile_id),
    unique("activity_artifacts_profile_digest_size_unique").on(
      table.profile_id,
      table.digest_algorithm,
      table.digest,
      table.byte_size,
    ),
    unique("activity_artifacts_bucket_path_unique").on(table.bucket, table.path),
    check(
      "activity_artifacts_sha256_check",
      sql`${table.digest_algorithm} = 'sha256' and ${table.digest} ~ '^[0-9a-f]{64}$'`,
    ),
    check("activity_artifacts_byte_size_check", sql`${table.byte_size} > 0`),
    check(
      "activity_artifacts_path_check",
      sql`btrim(${table.bucket}) <> '' and btrim(${table.path}) <> ''`,
    ),
    check(
      "activity_artifacts_content_addressed_path_check",
      sql`${table.path} = public.activity_artifact_content_path(${table.profile_id}, ${table.digest})`,
    ),
    check(
      "activity_artifacts_lifecycle_check",
      sql`(${table.availability} = 'accepted' and ${table.deletion_requested_at} is null and ${table.deleted_at} is null) or (${table.availability} = 'deletion_pending' and ${table.deletion_requested_at} is not null and ${table.deleted_at} is null) or (${table.availability} = 'deleted' and ${table.deletion_requested_at} is not null and ${table.deleted_at} is not null)`,
    ),
    index("idx_activity_artifacts_profile").on(table.profile_id),
  ],
);

export const activityArtifactLinks = pgTable(
  "activity_artifact_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activity_id: uuid("activity_id").notNull(),
    artifact_id: uuid("artifact_id").notNull(),
    profile_id: uuid("profile_id").notNull(),
    role: text("role", { enum: ["source", "supplemental", "export"] }).notNull(),
    ordinal: integer("ordinal").notNull(),
    is_current: boolean("is_current").notNull().default(false),
    provider_revision: text("provider_revision"),
    linked_at: timestamp("linked_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.activity_id, table.profile_id],
      foreignColumns: [activities.id, activities.profile_id],
      name: "activity_artifact_links_activity_profile_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.artifact_id, table.profile_id],
      foreignColumns: [activityArtifacts.id, activityArtifacts.profile_id],
      name: "activity_artifact_links_artifact_profile_fkey",
    }).onDelete("restrict"),
    unique("activity_artifact_links_activity_artifact_profile_unique").on(
      table.activity_id,
      table.artifact_id,
      table.profile_id,
    ),
    unique("activity_artifact_links_activity_artifact_role_unique").on(
      table.activity_id,
      table.artifact_id,
      table.role,
    ),
    unique("activity_artifact_links_activity_role_ordinal_unique").on(
      table.activity_id,
      table.role,
      table.ordinal,
    ),
    check("activity_artifact_links_ordinal_check", sql`${table.ordinal} >= 0`),
    check(
      "activity_artifact_links_current_source_check",
      sql`${table.is_current} = false or ${table.role} = 'source'`,
    ),
    index("idx_activity_artifact_links_artifact").on(table.artifact_id),
  ],
);

export const activitySegments = pgTable(
  "activity_segments",
  {
    id: uuid("id").primaryKey(),
    activity_id: uuid("activity_id").notNull(),
    profile_id: uuid("profile_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    role: text("role", { enum: ["activity", "transition", "rest", "unknown"] }).notNull(),
    activity_category: activityCategoryEnum("activity_category"),
    start_offset_ms: bigint("start_offset_ms", { mode: "number" }).notNull(),
    end_offset_ms: bigint("end_offset_ms", { mode: "number" }).notNull(),
    source_artifact_id: uuid("source_artifact_id"),
    source_session_index: integer("source_session_index"),
    source_message_index: integer("source_message_index"),
    raw_type_string: text("raw_type_string"),
    raw_type_integer: integer("raw_type_integer"),
    raw_sport_string: text("raw_sport_string"),
    raw_sport_integer: integer("raw_sport_integer"),
    raw_sub_sport_string: text("raw_sub_sport_string"),
    raw_sub_sport_integer: integer("raw_sub_sport_integer"),
    summary: jsonb("summary").notNull(),
    summary_version: integer("summary_version").notNull().default(1),
    timing_coverage: text("timing_coverage", {
      enum: ["complete", "partial", "unavailable"],
    }).notNull(),
    active_ms: bigint("active_ms", { mode: "number" }),
    moving_ms: bigint("moving_ms", { mode: "number" }),
    segment_revision: integer("segment_revision").notNull().default(1),
    parser_version: text("parser_version").notNull(),
    materializer_version: text("materializer_version").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.activity_id, table.profile_id],
      foreignColumns: [activities.id, activities.profile_id],
      name: "activity_segments_activity_profile_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.activity_id, table.source_artifact_id, table.profile_id],
      foreignColumns: [
        activityArtifactLinks.activity_id,
        activityArtifactLinks.artifact_id,
        activityArtifactLinks.profile_id,
      ],
      name: "activity_segments_source_link_fkey",
    }).onDelete("restrict"),
    unique("activity_segments_id_activity_profile_unique").on(
      table.id,
      table.activity_id,
      table.profile_id,
    ),
    unique("activity_segments_effort_category_unique").on(
      table.id,
      table.activity_id,
      table.profile_id,
      table.activity_category,
    ),
    unique("activity_segments_effort_source_unique").on(
      table.id,
      table.activity_id,
      table.profile_id,
      table.activity_category,
      table.source_artifact_id,
      table.segment_revision,
    ),
    unique("activity_segments_activity_ordinal_unique").on(table.activity_id, table.ordinal),
    check("activity_segments_ordinal_check", sql`${table.ordinal} >= 0`),
    check(
      "activity_segments_offset_check",
      sql`${table.start_offset_ms} >= 0 and ${table.end_offset_ms} > ${table.start_offset_ms}`,
    ),
    check(
      "activity_segments_role_category_check",
      sql`(${table.role} = 'activity' and ${table.activity_category} is not null) or (${table.role} <> 'activity' and ${table.activity_category} is null)`,
    ),
    check(
      "activity_segments_unknown_source_check",
      sql`${table.role} <> 'unknown' or num_nonnulls(${table.raw_type_string}, ${table.raw_type_integer}, ${table.raw_sport_string}, ${table.raw_sport_integer}, ${table.raw_sub_sport_string}, ${table.raw_sub_sport_integer}) > 0`,
    ),
    check(
      "activity_segments_raw_sub_sport_type_check",
      sql`num_nonnulls(${table.raw_sub_sport_string}, ${table.raw_sub_sport_integer}) <= 1`,
    ),
    check(
      "activity_segments_raw_source_string_bounds_check",
      sql`(${table.raw_type_string} is null or char_length(${table.raw_type_string}) between 1 and 128) and (${table.raw_sport_string} is null or char_length(${table.raw_sport_string}) between 1 and 128) and (${table.raw_sub_sport_string} is null or char_length(${table.raw_sub_sport_string}) between 1 and 128)`,
    ),
    check(
      "activity_segments_source_indexes_check",
      sql`(${table.source_session_index} is null and ${table.source_message_index} is null) or ${table.source_artifact_id} is not null`,
    ),
    check(
      "activity_segments_summary_check",
      sql`${table.summary_version} = 1 and jsonb_typeof(${table.summary}) = 'object' and pg_column_size(${table.summary}) <= 1048576`,
    ),
    check(
      "activity_segments_timing_check",
      sql`${table.active_ms} is null or (${table.active_ms} >= 0 and ${table.active_ms} <= ${table.end_offset_ms} - ${table.start_offset_ms})`,
    ),
    check(
      "activity_segments_moving_check",
      sql`${table.moving_ms} is null or (${table.moving_ms} >= 0 and ${table.moving_ms} <= coalesce(${table.active_ms}, ${table.end_offset_ms} - ${table.start_offset_ms}))`,
    ),
    check(
      "activity_segments_timing_coverage_values_check",
      sql`(${table.timing_coverage} = 'complete' and ${table.active_ms} is not null and ${table.moving_ms} is not null) or (${table.timing_coverage} = 'partial' and num_nonnulls(${table.active_ms}, ${table.moving_ms}) > 0) or (${table.timing_coverage} = 'unavailable' and ${table.active_ms} is null and ${table.moving_ms} is null)`,
    ),
    index("idx_activity_segments_activity").on(table.activity_id, table.ordinal),
    index("idx_activity_segments_category")
      .on(table.activity_category)
      .where(sql`${table.activity_category} is not null`),
  ],
);

export const activityAnalysisRevisions = pgTable(
  "activity_analysis_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activity_id: uuid("activity_id").notNull(),
    profile_id: uuid("profile_id").notNull(),
    revision: integer("revision").notNull(),
    source_segments_revision: integer("source_segments_revision").notNull(),
    analysis_version: text("analysis_version").notNull(),
    reason: text("reason", { enum: ["manual_profile_reprocess"] }).notNull(),
    performance_target_snapshot: jsonb("performance_target_snapshot").notNull(),
    target_fingerprint: text("target_fingerprint").notNull(),
    segment_load_projection: jsonb("segment_load_projection").notNull(),
    output_fingerprint: text("output_fingerprint").notNull(),
    computed_at: timestamp("computed_at", { withTimezone: true, mode: "date" }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.activity_id, table.profile_id],
      foreignColumns: [activities.id, activities.profile_id],
      name: "activity_analysis_revisions_activity_profile_fkey",
    }).onDelete("cascade"),
    // Historical identity is the owned monotonic revision position, not its
    // content: a legitimate A -> B -> A recomputation must append all 3 rows.
    unique("activity_analysis_revisions_activity_revision_unique").on(
      table.activity_id,
      table.profile_id,
      table.revision,
    ),
    index("idx_activity_analysis_revisions_selection").on(
      table.profile_id,
      table.activity_id,
      table.source_segments_revision,
      table.revision,
    ),
    check("activity_analysis_revisions_revision_check", sql`${table.revision} > 0`),
    check(
      "activity_analysis_revisions_segments_revision_check",
      sql`${table.source_segments_revision} > 0`,
    ),
    check("activity_analysis_revisions_version_check", sql`btrim(${table.analysis_version}) <> ''`),
    check(
      "activity_analysis_revisions_reason_check",
      sql`${table.reason} = 'manual_profile_reprocess'`,
    ),
    check(
      "activity_analysis_revisions_target_check",
      sql`jsonb_typeof(${table.performance_target_snapshot}) = 'object' and pg_column_size(${table.performance_target_snapshot}) <= 1048576`,
    ),
    check(
      "activity_analysis_revisions_projection_check",
      sql`jsonb_typeof(${table.segment_load_projection}) = 'object' and pg_column_size(${table.segment_load_projection}) <= 1048576`,
    ),
    check(
      "activity_analysis_revisions_target_fingerprint_check",
      sql`${table.target_fingerprint} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      "activity_analysis_revisions_output_fingerprint_check",
      sql`${table.output_fingerprint} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);

export const activityTrainingEffects = pgTable(
  "activity_training_effects",
  {
    profile_id: uuid("profile_id").notNull(),
    activity_id: uuid("activity_id").notNull(),
    activity_analysis_revision: integer("activity_analysis_revision").notNull(),
    contract_version: text("contract_version")
      .notNull()
      .default("athlete-derived-state-persistence-v1"),
    effective_at: timestamp("effective_at", { withTimezone: true, mode: "date" }).notNull(),
    planning_date: date("planning_date").notNull(),
    source_revision: bigint("source_revision", { mode: "number" }).notNull(),
    calculation_version: text("calculation_version").notNull(),
    input_fingerprint: text("input_fingerprint").notNull(),
    activity_category: activityCategoryEnum("activity_category").notNull(),
    common_load: numeric("common_load", { mode: "number" }).notNull(),
    evidence_confidence: numeric("evidence_confidence", { mode: "number" }).notNull(),
    capability_observation:
      jsonb("capability_observation").$type<
        ActivityTrainingEffect["stimulus"]["capabilityObservation"]
      >(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.activity_id, table.activity_analysis_revision] }),
    foreignKey({
      columns: [table.activity_id, table.profile_id, table.activity_analysis_revision],
      foreignColumns: [
        activityAnalysisRevisions.activity_id,
        activityAnalysisRevisions.profile_id,
        activityAnalysisRevisions.revision,
      ],
      name: "activity_training_effects_analysis_revision_fkey",
    }).onDelete("cascade"),
    check(
      "activity_training_effects_contract_version_check",
      sql`${table.contract_version} = 'athlete-derived-state-persistence-v1'`,
    ),
    check(
      "activity_training_effects_analysis_revision_check",
      sql`${table.activity_analysis_revision} > 0`,
    ),
    check("activity_training_effects_source_revision_check", sql`${table.source_revision} >= 0`),
    check(
      "activity_training_effects_calculation_version_check",
      sql`${table.calculation_version} ~ '^[a-z0-9][a-z0-9._-]{0,63}$'`,
    ),
    check(
      "activity_training_effects_input_fingerprint_check",
      sql`${table.input_fingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "activity_training_effects_common_load_check",
      sql`${table.common_load} between 0 and ${maxTrainingStimulusCommonLoadSql} and ${table.common_load} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "activity_training_effects_confidence_check",
      sql`${table.evidence_confidence} between 0 and 1 and ${table.evidence_confidence} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "activity_training_effects_capability_check",
      sql`${table.capability_observation} is null or (jsonb_typeof(${table.capability_observation}) = 'object' and pg_column_size(${table.capability_observation}) <= 4096 and ((${table.capability_observation}->>'distanceMeters') is not null or (${table.capability_observation}->>'durationMinutes') is not null))`,
    ),
    index("activity_training_effects_rebuild_idx").on(
      table.profile_id,
      table.effective_at,
      table.activity_id,
      table.activity_analysis_revision,
    ),
    index("activity_training_effects_profile_planning_date_idx").on(
      table.profile_id,
      table.planning_date,
    ),
  ],
);

export const dailyTrainingLoad = pgTable(
  "daily_training_load",
  {
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    planning_date: date("planning_date").notNull(),
    contract_version: text("contract_version")
      .notNull()
      .default("athlete-derived-state-persistence-v1"),
    common_load: numeric("common_load", { mode: "number" }).notNull(),
    fitness: numeric("fitness", { mode: "number" }).notNull(),
    fatigue: numeric("fatigue", { mode: "number" }).notNull(),
    form: numeric("form", { mode: "number" }).notNull(),
    readiness: numeric("readiness", { mode: "number" }),
    coverage_status: text("coverage_status", { enum: ["complete", "partial"] }).notNull(),
    contributing_activity_count: integer("contributing_activity_count").notNull(),
    omitted_activity_count: integer("omitted_activity_count").notNull(),
    source_revision: bigint("source_revision", { mode: "number" }).notNull(),
    calculation_version: text("calculation_version").notNull(),
    published_at: timestamp("published_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.profile_id, table.planning_date, table.source_revision] }),
    check(
      "daily_training_load_contract_version_check",
      sql`${table.contract_version} = 'athlete-derived-state-persistence-v1'`,
    ),
    check(
      "daily_training_load_common_load_check",
      sql`${table.common_load} between 0 and ${maxDailyAggregateCommonLoadSql} and ${table.common_load} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "daily_training_load_state_check",
      sql`${table.fitness} >= 0 and ${table.fatigue} >= 0 and abs(${table.form} - (${table.fitness} - ${table.fatigue})) <= 0.000000001 and ${table.fitness} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) and ${table.fatigue} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) and ${table.form} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "daily_training_load_readiness_check",
      sql`${table.readiness} is null or (${table.readiness} between 0 and 100 and ${table.readiness} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))`,
    ),
    check(
      "daily_training_load_coverage_check",
      sql`${table.contributing_activity_count} >= 0 and ((${table.coverage_status} = 'complete' and ${table.omitted_activity_count} = 0) or (${table.coverage_status} = 'partial' and ${table.omitted_activity_count} > 0))`,
    ),
    check("daily_training_load_source_revision_check", sql`${table.source_revision} >= 0`),
    check(
      "daily_training_load_calculation_version_check",
      sql`${table.calculation_version} ~ '^[a-z0-9][a-z0-9._-]{0,63}$'`,
    ),
    index("daily_training_load_revision_range_idx").on(
      table.profile_id,
      table.source_revision,
      table.planning_date,
    ),
  ],
);

export const athleteRecalculationQueue = pgTable(
  "athlete_recalculation_queue",
  {
    profile_id: uuid("profile_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    contract_version: text("contract_version")
      .notNull()
      .default("athlete-derived-state-persistence-v1"),
    idempotency_key: text("idempotency_key").notNull(),
    earliest_affected_at: timestamp("earliest_affected_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    earliest_affected_planning_date: date("earliest_affected_planning_date").notNull(),
    source_revision: bigint("source_revision", { mode: "number" }).notNull(),
    reasons: athleteRecalculationReasonEnum("reasons").array().notNull(),
    requested_at: timestamp("requested_at", { withTimezone: true, mode: "date" }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("athlete_recalculation_queue_idempotency_unique").on(table.idempotency_key),
    check(
      "athlete_recalculation_queue_contract_version_check",
      sql`${table.contract_version} = 'athlete-derived-state-persistence-v1'`,
    ),
    check(
      "athlete_recalculation_queue_idempotency_check",
      sql`${table.idempotency_key} = 'athlete-recalculation:' || ${table.profile_id}::text`,
    ),
    check("athlete_recalculation_queue_source_revision_check", sql`${table.source_revision} >= 0`),
    check(
      "athlete_recalculation_queue_reasons_check",
      sql`cardinality(${table.reasons}) between 1 and 9 and ${table.reasons} = array_remove(array[case when 'activity_created' = any(${table.reasons}) then 'activity_created'::athlete_recalculation_reason end, case when 'activity_changed' = any(${table.reasons}) then 'activity_changed'::athlete_recalculation_reason end, case when 'activity_deleted' = any(${table.reasons}) then 'activity_deleted'::athlete_recalculation_reason end, case when 'analysis_replaced' = any(${table.reasons}) then 'analysis_replaced'::athlete_recalculation_reason end, case when 'threshold_changed' = any(${table.reasons}) then 'threshold_changed'::athlete_recalculation_reason end, case when 'import_completed' = any(${table.reasons}) then 'import_completed'::athlete_recalculation_reason end, case when 'algorithm_changed' = any(${table.reasons}) then 'algorithm_changed'::athlete_recalculation_reason end, case when 'timezone_changed' = any(${table.reasons}) then 'timezone_changed'::athlete_recalculation_reason end, case when 'explicit_repair' = any(${table.reasons}) then 'explicit_repair'::athlete_recalculation_reason end], null)`,
    ),
    index("athlete_recalculation_queue_pending_idx").on(table.requested_at, table.profile_id),
  ],
);

export const activityFileIngestions = pgTable(
  "activity_file_ingestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activity_id: uuid("activity_id"),
    artifact_id: uuid("artifact_id"),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    source: activityFileIngestionSourceEnum("source").notNull(),
    provider: integrationProviderEnum("provider"),
    external_id: text("external_id"),
    integration_id: uuid("integration_id"),
    contract_version: text("contract_version").notNull().default("activity-intake-v1"),
    operation_id: text("operation_id").notNull(),
    staging_bucket: text("staging_bucket"),
    staging_path: text("staging_path"),
    expected_sha256: text("expected_sha256"),
    expected_byte_size: integer("expected_byte_size"),
    expected_format: text("expected_format"),
    expected_media_type: text("expected_media_type"),
    uploaded_at: timestamp("uploaded_at", { withTimezone: true, mode: "date" }),
    staging_cleanup_pending: boolean("staging_cleanup_pending").notNull().default(false),
    staging_cleaned_at: timestamp("staging_cleaned_at", { withTimezone: true, mode: "date" }),
    staging_cleanup_error: text("staging_cleanup_error"),
    received_at: timestamp("received_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    status: activityFileIngestionStatusEnum("status").notNull().default("awaiting_upload"),
    failure_code: activityIngestionFailureCodeEnum("failure_code"),
    requested_at: timestamp("requested_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    started_at: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completed_at: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    failed_at: timestamp("failed_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.activity_id, table.profile_id],
      foreignColumns: [activities.id, activities.profile_id],
      name: "activity_file_ingestions_activity_profile_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.artifact_id, table.profile_id],
      foreignColumns: [activityArtifacts.id, activityArtifacts.profile_id],
      name: "activity_file_ingestions_artifact_profile_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.integration_id, table.profile_id],
      foreignColumns: [integrations.id, integrations.profile_id],
      name: "activity_file_ingestions_integration_profile_fkey",
    }).onDelete("restrict"),
    check(
      "activity_file_ingestions_contract_version_check",
      sql`${table.contract_version} = 'activity-intake-v1'`,
    ),
    check(
      "activity_file_ingestions_operation_id_check",
      sql`${table.operation_id} ~ '^[A-Za-z0-9_-]{32,128}$'`,
    ),
    check(
      "activity_file_ingestions_provider_identity_check",
      sql`(${table.source} = 'provider_sync' and num_nonnulls(${table.provider}, ${table.external_id}, ${table.integration_id}) = 3 and btrim(${table.external_id}) <> '') or (${table.source} <> 'provider_sync' and num_nonnulls(${table.provider}, ${table.external_id}, ${table.integration_id}) = 0)`,
    ),
    check(
      "activity_file_ingestions_expected_size_check",
      sql`${table.expected_byte_size} is null or ${table.expected_byte_size} > 0`,
    ),
    check(
      "activity_file_ingestions_expected_hash_check",
      sql`${table.expected_sha256} is null or ${table.expected_sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "activity_file_ingestions_staging_metadata_check",
      sql`num_nonnulls(${table.staging_bucket}, ${table.staging_path}, ${table.expected_sha256}, ${table.expected_byte_size}, ${table.expected_format}, ${table.expected_media_type}) in (0, 6) and (${table.staging_bucket} is null or (btrim(${table.staging_bucket}) <> '' and btrim(${table.staging_path}) <> '' and ((${table.expected_format} = 'fit' and ${table.expected_media_type} = 'application/vnd.ant.fit') or (${table.expected_format} = 'gpx' and ${table.expected_media_type} = 'application/gpx+xml') or (${table.expected_format} = 'tcx' and ${table.expected_media_type} = 'application/vnd.garmin.tcx+xml'))))`,
    ),
    check(
      "activity_file_ingestions_cleanup_state_check",
      sql`(not ${table.staging_cleanup_pending} or (${table.status} = 'succeeded' and ${table.staging_path} is not null and ${table.artifact_id} is not null)) and (${table.staging_cleaned_at} is null or (not ${table.staging_cleanup_pending} and ${table.staging_path} is not null)) and (${table.staging_cleanup_error} is null or ${table.staging_cleanup_pending}) and not (${table.staging_cleaned_at} is not null and ${table.staging_cleanup_error} is not null)`,
    ),
    check(
      "activity_file_ingestions_lifecycle_check",
      sql`(${table.status} = 'awaiting_upload' and ${table.activity_id} is null and ${table.artifact_id} is null and ${table.started_at} is null and num_nonnulls(${table.failure_code}, ${table.completed_at}, ${table.failed_at}) = 0) or (${table.status} = 'processing' and ${table.activity_id} is null and ${table.started_at} is not null and num_nonnulls(${table.failure_code}, ${table.completed_at}, ${table.failed_at}) = 0) or (${table.status} in ('failed_retryable', 'failed_terminal') and ${table.started_at} is not null and ${table.failure_code} is not null and ${table.failed_at} is not null and ${table.completed_at} is null) or (${table.status} = 'succeeded' and ${table.activity_id} is not null and ${table.artifact_id} is not null and ${table.started_at} is not null and ${table.completed_at} is not null and ${table.failure_code} is null and ${table.failed_at} is null)`,
    ),
    index("idx_activity_file_ingestions_activity_profile")
      .on(table.activity_id, table.profile_id)
      .where(sql`${table.activity_id} is not null`),
    index("idx_activity_file_ingestions_artifact_id")
      .on(table.artifact_id)
      .where(sql`${table.artifact_id} is not null`),
    index("idx_activity_file_ingestions_profile_id").on(table.profile_id),
    index("idx_activity_file_ingestions_profile_status_updated").on(
      table.profile_id,
      table.status,
      table.updated_at,
    ),
    index("idx_activity_file_ingestions_provider_external")
      .on(table.provider, table.external_id)
      .where(sql`${table.provider} is not null and ${table.external_id} is not null`),
    uniqueIndex("activity_file_ingestions_profile_operation_unique").on(
      table.profile_id,
      table.operation_id,
    ),
  ],
);

export const plannedSessions = pgTable(
  "planned_sessions",
  {
    id: uuid("id").primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    contract_version: text("contract_version").notNull().default("planned-session-v1"),
    session_revision: integer("session_revision").notNull().default(1),
    planning_date: date("planning_date").notNull(),
    original_target_date: date("original_target_date").notNull(),
    source_kind: plannedSessionSourceKindEnum("source_kind").notNull(),
    idempotency_key: text("idempotency_key").notNull(),
    direct_operation_id: text("direct_operation_id"),
    training_plan_id: uuid("training_plan_id").references(() => trainingPlans.id, {
      onDelete: "restrict",
    }),
    training_plan_revision: integer("training_plan_revision"),
    source_session_key: text("source_session_key"),
    series_id: uuid("series_id"),
    occurrence_key: date("occurrence_key"),
    group_event_id: uuid("group_event_id"),
    activity_plan_id: uuid("activity_plan_id")
      .notNull()
      .references(() => activityPlans.id, { onDelete: "restrict" }),
    activity_plan_revision: integer("activity_plan_revision").notNull(),
    prescription_structure: jsonb("prescription_structure")
      .$type<PlannedSessionPrescriptionSnapshot["structure"]>()
      .notNull(),
    prescription_quantification: jsonb("prescription_quantification").$type<
      PlannedSessionPrescriptionSnapshot["prescriptionQuantification"]
    >(),
    prescription_captured_at: timestamp("prescription_captured_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    status: plannedSessionStatusEnum("status").notNull().default("scheduled"),
    cancellation_reason: plannedSessionCancellationReasonEnum("cancellation_reason"),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    completed_activity_id: uuid("completed_activity_id"),
    completion_state: plannedSessionCompletionStateEnum("completion_state"),
    linked_at: timestamp("linked_at", { withTimezone: true, mode: "date" }),
    completion_unlinked_at: timestamp("completion_unlinked_at", {
      withTimezone: true,
      mode: "date",
    }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("planned_sessions_id_profile_unique").on(table.id, table.profile_id),
    unique("planned_sessions_profile_idempotency_unique").on(
      table.profile_id,
      table.idempotency_key,
    ),
    foreignKey({
      columns: [table.series_id, table.profile_id],
      foreignColumns: [table.id, table.profile_id],
      name: "planned_sessions_series_owner_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.completed_activity_id, table.profile_id],
      foreignColumns: [activities.id, activities.profile_id],
      name: "planned_sessions_completed_activity_owner_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.group_event_id],
      foreignColumns: [groupEvents.id],
      name: "planned_sessions_group_event_fkey",
    }).onDelete("set null"),
    check(
      "planned_sessions_contract_version_check",
      sql`${table.contract_version} = 'planned-session-v1'`,
    ),
    check("planned_sessions_revision_check", sql`${table.session_revision} > 0`),
    check(
      "planned_sessions_idempotency_length_check",
      sql`char_length(${table.idempotency_key}) between 1 and 512`,
    ),
    check(
      "planned_sessions_source_check",
      sql`(${table.source_kind} = 'direct' and ${table.direct_operation_id} ~ '^[A-Za-z0-9_-]{32,128}$' and ${table.idempotency_key} = 'direct:' || ${table.direct_operation_id} and num_nonnulls(${table.training_plan_id}, ${table.training_plan_revision}, ${table.source_session_key}, ${table.series_id}, ${table.occurrence_key}) = 0) or (${table.source_kind} = 'training_plan' and ${table.training_plan_id} is not null and ${table.training_plan_revision} > 0 and ${table.source_session_key} is not null and char_length(btrim(${table.source_session_key})) between 1 and 128 and ${table.idempotency_key} = 'training-plan:' || ${table.training_plan_id}::text || ':' || ${table.training_plan_revision}::text || ':' || ${table.source_session_key} and num_nonnulls(${table.direct_operation_id}, ${table.series_id}, ${table.occurrence_key}) = 0) or (${table.source_kind} = 'recurrence' and ${table.series_id} is not null and ${table.occurrence_key} is not null and ${table.occurrence_key} = ${table.original_target_date} and ${table.idempotency_key} = 'recurrence:' || ${table.series_id}::text || ':' || ${table.occurrence_key}::text and num_nonnulls(${table.direct_operation_id}, ${table.training_plan_id}, ${table.training_plan_revision}, ${table.source_session_key}) = 0)`,
    ),
    check(
      "planned_sessions_prescription_check",
      sql`${table.activity_plan_revision} > 0 and jsonb_typeof(${table.prescription_structure}) = 'object' and pg_column_size(${table.prescription_structure}) <= 1048576 and (${table.prescription_quantification} is null or (jsonb_typeof(${table.prescription_quantification}) = 'object' and pg_column_size(${table.prescription_quantification}) <= 262144))`,
    ),
    check(
      "planned_sessions_lifecycle_check",
      sql`(${table.status} = 'scheduled' and num_nonnulls(${table.cancellation_reason}, ${table.cancelled_at}, ${table.completed_activity_id}, ${table.completion_state}, ${table.linked_at}, ${table.completion_unlinked_at}) = 0) or (${table.status} = 'cancelled' and ${table.cancellation_reason} is not null and ${table.cancelled_at} is not null and num_nonnulls(${table.completed_activity_id}, ${table.completion_state}, ${table.linked_at}, ${table.completion_unlinked_at}) = 0) or (${table.status} = 'completed' and num_nonnulls(${table.cancellation_reason}, ${table.cancelled_at}) = 0 and ((${table.completion_state} = 'linked' and ${table.completed_activity_id} is not null and ${table.linked_at} is not null and ${table.completion_unlinked_at} is null) or (${table.completion_state} = 'activity_deleted' and ${table.completed_activity_id} is null and ${table.linked_at} is not null and ${table.completion_unlinked_at} >= ${table.linked_at})))`,
    ),
    check(
      "planned_sessions_series_not_self_check",
      sql`${table.series_id} is null or ${table.series_id} <> ${table.id}`,
    ),
    index("planned_sessions_profile_date_idx").on(table.profile_id, table.planning_date, table.id),
    index("planned_sessions_profile_status_date_idx").on(
      table.profile_id,
      table.status,
      table.planning_date,
      table.id,
    ),
    index("planned_sessions_training_plan_idx")
      .on(table.training_plan_id, table.profile_id)
      .where(sql`${table.training_plan_id} is not null`),
    index("planned_sessions_activity_plan_idx").on(table.activity_plan_id),
    uniqueIndex("planned_sessions_profile_group_event_unique")
      .on(table.profile_id, table.group_event_id)
      .where(sql`${table.group_event_id} is not null`),
    index("planned_sessions_completed_activity_idx")
      .on(table.completed_activity_id)
      .where(sql`${table.completed_activity_id} is not null`),
    uniqueIndex("planned_sessions_series_occurrence_unique")
      .on(table.series_id, table.occurrence_key)
      .where(sql`${table.series_id} is not null`),
  ],
);

export const activityEfforts = pgTable(
  "activity_efforts",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    activity_id: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    segment_id: uuid("segment_id").notNull(),
    recorded_at: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    activity_category: activityCategoryEnum("activity_category").notNull(),
    effort_type: effortTypeEnum("effort_type").notNull(),
    source_series: activityEffortSourceSeriesEnum("source_series").notNull(),
    duration_seconds: integer("duration_seconds").notNull(),
    distance_meters: integer("distance_meters"),
    source_artifact_id: uuid("source_artifact_id").notNull(),
    source_revision: integer("source_revision").notNull(),
    start_offset_ms: bigint("start_offset_ms", { mode: "number" }).notNull(),
    end_offset_ms: bigint("end_offset_ms", { mode: "number" }).notNull(),
    window_coverage: numeric("window_coverage", { mode: "number" }).notNull(),
    max_gap_seconds: numeric("max_gap_seconds", { mode: "number" }).notNull(),
    unit: text("unit").notNull(),
    value: real("value").notNull(),
    source: evidenceObservationSourceEnum("source").notNull(),
    method: text("method").notNull(),
    calculation_version: text("calculation_version").notNull(),
    quality_score: numeric("quality_score", { mode: "number" }),
    provenance: jsonb("provenance").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.segment_id,
        table.activity_id,
        table.profile_id,
        table.activity_category,
        table.source_artifact_id,
        table.source_revision,
      ],
      foreignColumns: [
        activitySegments.id,
        activitySegments.activity_id,
        activitySegments.profile_id,
        activitySegments.activity_category,
        activitySegments.source_artifact_id,
        activitySegments.segment_revision,
      ],
      name: "activity_efforts_exact_source_fkey",
    }).onDelete("cascade"),
    unique("activity_efforts_ownership_unique").on(
      table.id,
      table.profile_id,
      table.activity_id,
      table.activity_category,
      table.effort_type,
      table.source_series,
      table.source_revision,
    ),
    unique("activity_efforts_deterministic_source_window_unique").on(
      table.activity_id,
      table.segment_id,
      table.source_artifact_id,
      table.source_revision,
      table.effort_type,
      table.source_series,
      table.start_offset_ms,
      table.end_offset_ms,
      table.method,
      table.calculation_version,
    ),
    index("idx_activity_efforts_activity_id").on(table.activity_id),
    index("idx_activity_efforts_segment_id").on(table.segment_id),
    index("idx_activity_efforts_source_revision").on(
      table.activity_id,
      table.source_revision,
      table.source_artifact_id,
    ),
    index("idx_activity_efforts_athlete_state_replay").on(table.profile_id, table.id),
    check("activity_efforts_duration_seconds_positive_check", sql`${table.duration_seconds} > 0`),
    check(
      "activity_efforts_distance_meters_bounds_check",
      sql`${table.distance_meters} is null or ${table.distance_meters} > 0`,
    ),
    check("activity_efforts_source_revision_check", sql`${table.source_revision} > 0`),
    check(
      "activity_efforts_window_check",
      sql`${table.start_offset_ms} >= 0 and ${table.end_offset_ms} = ${table.start_offset_ms} + ${table.duration_seconds}::bigint * 1000`,
    ),
    check(
      "activity_efforts_coverage_finite_range_check",
      sql`${table.window_coverage} between 0 and 1 and ${table.window_coverage} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "activity_efforts_max_gap_finite_check",
      sql`${table.max_gap_seconds} > 0 and ${table.max_gap_seconds} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "activity_efforts_value_finite_positive_check",
      sql`${table.value} > 0 and ${table.value} not in ('NaN'::real, 'Infinity'::real, '-Infinity'::real)`,
    ),
    check(
      "activity_efforts_supported_combination_check",
      sql`(${table.activity_category} = 'bike' and ${table.effort_type} = 'power' and ${table.source_series} = 'power') or (${table.activity_category} = 'run' and ${table.effort_type} = 'speed' and ${table.source_series} in ('grade_adjusted_speed', 'raw_speed')) or (${table.activity_category} = 'swim' and ${table.effort_type} = 'speed' and ${table.source_series} = 'swim_speed') or (${table.activity_category} in ('bike', 'run', 'swim') and ${table.effort_type}::text = 'heart_rate' and ${table.source_series} = 'heart_rate')`,
    ),
    check(
      "activity_efforts_unit_compatibility_check",
      sql`(${table.activity_category} = 'bike' and ${table.effort_type} = 'power' and ${table.unit} = 'watts') or (${table.activity_category} in ('run', 'swim') and ${table.effort_type} = 'speed' and ${table.unit} = 'meters_per_second') or (${table.effort_type}::text = 'heart_rate' and ${table.unit} = 'bpm')`,
    ),
    check(
      "activity_efforts_bike_power_max_check",
      sql`${table.activity_category} <> 'bike' or ${table.effort_type} <> 'power' or ${table.value} <= 3000`,
    ),
    check(
      "activity_efforts_run_speed_bounds_check",
      sql`${table.activity_category} <> 'run' or ${table.effort_type} <> 'speed' or (${table.value} >= 0.3 and ${table.value} <= 13)`,
    ),
    check(
      "activity_efforts_swim_speed_bounds_check",
      sql`${table.activity_category} <> 'swim' or ${table.effort_type} <> 'speed' or (${table.value} >= 0.1 and ${table.value} <= 3)`,
    ),
    check(
      "activity_efforts_heart_rate_bounds_check",
      sql`${table.effort_type}::text <> 'heart_rate' or ${table.value} between 30 and 240`,
    ),
    check("activity_efforts_method_not_blank_check", sql`btrim(${table.method}) <> ''`),
    check(
      "activity_efforts_calculation_version_not_blank_check",
      sql`btrim(${table.calculation_version}) <> ''`,
    ),
    check(
      "activity_efforts_quality_score_range_check",
      sql`${table.quality_score} is null or (${table.quality_score} >= 0 and ${table.quality_score} <= 1)`,
    ),
    check(
      "activity_efforts_provenance_object_check",
      sql`jsonb_typeof(${table.provenance}) = 'object'`,
    ),
  ],
);

/** Immutable, idempotent policy outcomes over one activity source revision. */
export const thresholdEvaluations = pgTable(
  "threshold_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activity_category: activityCategoryEnum("activity_category").notNull(),
    metric: thresholdMetricEnum("metric").notNull(),
    method: text("method").notNull(),
    outcome: thresholdEvaluationOutcomeEnum("outcome").notNull(),
    value: numeric("value", { mode: "number" }),
    unit: text("unit").notNull(),
    confidence: numeric("confidence", { mode: "number" }),
    observed_at: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull(),
    rejection_reason: thresholdEvaluationRejectionReasonEnum("rejection_reason"),
    policy_version: text("policy_version").notNull(),
    diagnostics: jsonb("diagnostics").notNull(),
    source_activity_id: uuid("source_activity_id").notNull(),
    source_revision: integer("source_revision").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.source_activity_id, table.profile_id],
      foreignColumns: [activities.id, activities.profile_id],
      name: "threshold_evaluations_source_activity_profile_fkey",
    }).onDelete("cascade"),
    unique("threshold_evaluations_idempotency_unique").on(
      table.profile_id,
      table.source_activity_id,
      table.source_revision,
      table.activity_category,
      table.metric,
      table.method,
      table.policy_version,
    ),
    unique("threshold_evaluations_ownership_unique").on(
      table.id,
      table.profile_id,
      table.activity_category,
      table.metric,
    ),
    unique("threshold_evaluations_qualified_identity_unique").on(
      table.id,
      table.profile_id,
      table.activity_category,
      table.metric,
      table.outcome,
    ),
    check(
      "threshold_evaluations_outcome_check",
      sql`(${table.outcome} = 'qualified' and ${table.value} is not null and ${table.confidence} is not null and ${table.rejection_reason} is null) or (${table.outcome} = 'rejected' and ${table.value} is null and ${table.confidence} is null and ${table.rejection_reason} is not null)`,
    ),
    check(
      "threshold_evaluations_identity_check",
      sql`(${table.activity_category} = 'bike' and ${table.metric} = 'power' and ${table.method} = 'bike_power_30m' and ${table.unit} = 'watts') or (${table.activity_category} = 'run' and ${table.metric} = 'speed' and ${table.method} = 'run_speed_30m' and ${table.unit} = 'meters_per_second') or (${table.activity_category} = 'swim' and ${table.metric} = 'speed' and ${table.method} = 'swim_speed_15m' and ${table.unit} = 'meters_per_second')`,
    ),
    check(
      "threshold_evaluations_value_finite_positive_check",
      sql`${table.value} is null or (${table.value} > 0 and ${table.value} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))`,
    ),
    check(
      "threshold_evaluations_confidence_finite_range_check",
      sql`${table.confidence} is null or (${table.confidence} between 0 and 1 and ${table.confidence} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))`,
    ),
    check("threshold_evaluations_source_revision_check", sql`${table.source_revision} > 0`),
    check(
      "threshold_evaluations_created_after_observed_check",
      sql`${table.created_at} >= ${table.observed_at}`,
    ),
    check("threshold_evaluations_policy_check", sql`btrim(${table.policy_version}) <> ''`),
    check(
      "threshold_evaluations_diagnostics_check",
      sql`jsonb_typeof(${table.diagnostics}) = 'object' and pg_column_size(${table.diagnostics}) <= 16384`,
    ),
    index("threshold_evaluations_profile_identity_observed_idx").on(
      table.profile_id,
      table.activity_category,
      table.metric,
      table.observed_at.desc(),
      table.id,
    ),
    index("threshold_evaluations_source_revision_idx").on(
      table.source_activity_id,
      table.source_revision,
      table.id,
    ),
  ],
);

/** Optional measured inputs; qualified evaluations require one primary exact-window effort. */
export const thresholdEvaluationEfforts = pgTable(
  "threshold_evaluation_efforts",
  {
    evaluation_id: uuid("evaluation_id").notNull(),
    effort_id: uuid("effort_id").notNull(),
    profile_id: uuid("profile_id").notNull(),
    activity_category: activityCategoryEnum("activity_category").notNull(),
    activity_id: uuid("activity_id").notNull(),
    source_revision: integer("source_revision").notNull(),
    metric: thresholdMetricEnum("metric").notNull(),
    effort_type: effortTypeEnum("effort_type").notNull(),
    source_series: activityEffortSourceSeriesEnum("source_series").notNull(),
    role: thresholdEvaluationEffortRoleEnum("role").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.evaluation_id, table.effort_id] }),
    unique("threshold_evaluation_efforts_role_ordinal_unique").on(
      table.evaluation_id,
      table.role,
      table.ordinal,
    ),
    foreignKey({
      columns: [table.evaluation_id, table.profile_id, table.activity_category, table.metric],
      foreignColumns: [
        thresholdEvaluations.id,
        thresholdEvaluations.profile_id,
        thresholdEvaluations.activity_category,
        thresholdEvaluations.metric,
      ],
      name: "threshold_evaluation_efforts_evaluation_ownership_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.effort_id,
        table.profile_id,
        table.activity_id,
        table.activity_category,
        table.effort_type,
        table.source_series,
        table.source_revision,
      ],
      foreignColumns: [
        activityEfforts.id,
        activityEfforts.profile_id,
        activityEfforts.activity_id,
        activityEfforts.activity_category,
        activityEfforts.effort_type,
        activityEfforts.source_series,
        activityEfforts.source_revision,
      ],
      name: "threshold_evaluation_efforts_effort_ownership_fkey",
    }).onDelete("cascade"),
    check(
      "threshold_evaluation_efforts_metric_check",
      sql`(${table.metric} = 'power' and ${table.activity_category} = 'bike' and ${table.effort_type} = 'power' and ${table.source_series} = 'power') or (${table.metric} = 'speed' and ${table.activity_category} = 'run' and ${table.effort_type} = 'speed' and ${table.source_series} in ('grade_adjusted_speed', 'raw_speed')) or (${table.metric} = 'speed' and ${table.activity_category} = 'swim' and ${table.effort_type} = 'speed' and ${table.source_series} = 'swim_speed')`,
    ),
    check("threshold_evaluation_efforts_ordinal_check", sql`${table.ordinal} between 0 and 63`),
    check(
      "threshold_evaluation_efforts_primary_ordinal_check",
      sql`${table.role} <> 'primary' or ${table.ordinal} = 0`,
    ),
    index("threshold_evaluation_efforts_effort_evaluation_idx").on(
      table.effort_id,
      table.evaluation_id,
    ),
    index("threshold_evaluation_efforts_activity_evaluation_idx").on(
      table.activity_id,
      table.source_revision,
      table.evaluation_id,
    ),
  ],
);

/** Immutable effective-dated threshold truth selected from one qualified evaluation. */
export const thresholds = pgTable(
  "thresholds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activity_category: activityCategoryEnum("activity_category").notNull(),
    metric: thresholdMetricEnum("metric").notNull(),
    evaluation_id: uuid("evaluation_id").notNull(),
    evaluation_outcome: thresholdEvaluationOutcomeEnum("evaluation_outcome")
      .notNull()
      .default("qualified"),
    value: numeric("value", { mode: "number" }).notNull(),
    unit: text("unit").notNull(),
    confidence: numeric("confidence", { mode: "number" }).notNull(),
    method: text("method").notNull(),
    effective_at: timestamp("effective_at", { withTimezone: true, mode: "date" }).notNull(),
    policy_version: text("policy_version").notNull(),
    supersedes_id: uuid("supersedes_id"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("thresholds_ownership_unique").on(
      table.id,
      table.profile_id,
      table.activity_category,
      table.metric,
    ),
    unique("thresholds_evaluation_unique").on(table.evaluation_id),
    unique("thresholds_supersedes_unique").on(table.supersedes_id),
    foreignKey({
      columns: [
        table.evaluation_id,
        table.profile_id,
        table.activity_category,
        table.metric,
        table.evaluation_outcome,
      ],
      foreignColumns: [
        thresholdEvaluations.id,
        thresholdEvaluations.profile_id,
        thresholdEvaluations.activity_category,
        thresholdEvaluations.metric,
        thresholdEvaluations.outcome,
      ],
      name: "thresholds_qualified_evaluation_ownership_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.supersedes_id],
      foreignColumns: [table.id],
      name: "thresholds_supersedes_fkey",
    }).onDelete("no action"),
    check("thresholds_qualified_evaluation_check", sql`${table.evaluation_outcome} = 'qualified'`),
    check(
      "thresholds_identity_check",
      sql`(${table.activity_category} = 'bike' and ${table.metric} = 'power' and ${table.method} = 'bike_power_30m' and ${table.unit} = 'watts') or (${table.activity_category} = 'run' and ${table.metric} = 'speed' and ${table.method} = 'run_speed_30m' and ${table.unit} = 'meters_per_second') or (${table.activity_category} = 'swim' and ${table.metric} = 'speed' and ${table.method} = 'swim_speed_15m' and ${table.unit} = 'meters_per_second')`,
    ),
    check(
      "thresholds_value_finite_positive_check",
      sql`${table.value} > 0 and ${table.value} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "thresholds_confidence_finite_range_check",
      sql`${table.confidence} between 0 and 1 and ${table.confidence} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "thresholds_created_after_effective_check",
      sql`${table.created_at} >= ${table.effective_at}`,
    ),
    check("thresholds_policy_check", sql`btrim(${table.policy_version}) <> ''`),
    check(
      "thresholds_supersedes_check",
      sql`${table.supersedes_id} is null or ${table.supersedes_id} <> ${table.id}`,
    ),
    index("thresholds_profile_identity_effective_idx").on(
      table.profile_id,
      table.activity_category,
      table.metric,
      table.effective_at.desc(),
      table.id,
    ),
    uniqueIndex("thresholds_identity_root_unique")
      .on(table.profile_id, table.activity_category, table.metric)
      .where(sql`${table.supersedes_id} is null`),
    index("thresholds_supersedes_idx")
      .on(table.supersedes_id)
      .where(sql`${table.supersedes_id} is not null`),
  ],
);

export const thresholdEvidence = pgTable(
  "threshold_evidence",
  {
    id: uuid("id").primaryKey(),
    profile_id: uuid("profile_id").notNull(),
    activity_id: uuid("activity_id").notNull(),
    contract_version: text("contract_version")
      .notNull()
      .default("athlete-derived-state-persistence-v1"),
    activity_category: activityCategoryEnum("activity_category").notNull(),
    metric: thresholdMetricEnum("metric").notNull(),
    unit: text("unit", { enum: ["watts", "meters_per_second"] }).notNull(),
    method: text("method", {
      enum: ["bike_power_30m", "run_speed_30m", "swim_speed_15m"],
    }).notNull(),
    value: numeric("value", { mode: "number" }).notNull(),
    source_series_id: text("source_series_id").notNull(),
    source_series_metric: text("source_series_metric", {
      enum: ["power", "speed", "grade_adjusted_speed", "heart_rate"],
    }).notNull(),
    start_timestamp_seconds: numeric("start_timestamp_seconds", { mode: "number" }).notNull(),
    end_timestamp_seconds: numeric("end_timestamp_seconds", { mode: "number" }).notNull(),
    exact_window_seconds: integer("exact_window_seconds").notNull(),
    conversion_factor: numeric("conversion_factor", { mode: "number" }).notNull(),
    policy_version: text("policy_version").notNull(),
    plausibility_version: text("plausibility_version").notNull(),
    observed_at: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull(),
    calculation_version: text("calculation_version").notNull(),
    confidence: numeric("confidence", { mode: "number" }).notNull(),
    status: thresholdEvidenceStatusEnum("status").notNull().default("active"),
    invalidated_at: timestamp("invalidated_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("threshold_evidence_id_profile_activity_unique").on(
      table.id,
      table.profile_id,
      table.activity_id,
    ),
    unique("threshold_evidence_profile_category_activity_unique").on(
      table.profile_id,
      table.activity_category,
      table.activity_id,
    ),
    foreignKey({
      columns: [table.activity_id, table.profile_id],
      foreignColumns: [activities.id, activities.profile_id],
      name: "threshold_evidence_activity_owner_fkey",
    }).onDelete("cascade"),
    check(
      "threshold_evidence_contract_version_check",
      sql`${table.contract_version} = 'athlete-derived-state-persistence-v1'`,
    ),
    check(
      "threshold_evidence_identity_check",
      sql`(${table.activity_category} = 'bike' and ${table.metric} = 'power' and ${table.unit} = 'watts' and ${table.method} = 'bike_power_30m' and ${table.source_series_metric} = 'power') or (${table.activity_category} = 'run' and ${table.metric} = 'speed' and ${table.unit} = 'meters_per_second' and ${table.method} = 'run_speed_30m' and ${table.source_series_metric} in ('speed', 'grade_adjusted_speed')) or (${table.activity_category} = 'swim' and ${table.metric} = 'speed' and ${table.unit} = 'meters_per_second' and ${table.method} = 'swim_speed_15m' and ${table.source_series_metric} = 'speed')`,
    ),
    check(
      "threshold_evidence_value_check",
      sql`${table.value} > 0 and ${table.value} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "threshold_evidence_source_series_id_check",
      sql`char_length(btrim(${table.source_series_id})) between 1 and 256`,
    ),
    check(
      "threshold_evidence_window_check",
      sql`${table.exact_window_seconds} > 0 and ${table.end_timestamp_seconds} = ${table.start_timestamp_seconds} + ${table.exact_window_seconds} and ${table.start_timestamp_seconds} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) and ${table.end_timestamp_seconds} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "threshold_evidence_conversion_factor_check",
      sql`${table.conversion_factor} > 0 and ${table.conversion_factor} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check("threshold_evidence_policy_check", sql`${table.policy_version} = 'threshold-policy-v1'`),
    check(
      "threshold_evidence_plausibility_check",
      sql`${table.plausibility_version} = 'threshold-plausibility-v1'`,
    ),
    check(
      "threshold_evidence_calculation_version_check",
      sql`${table.calculation_version} ~ '^[a-z0-9][a-z0-9._-]{0,63}$'`,
    ),
    check(
      "threshold_evidence_confidence_check",
      sql`${table.confidence} between 0 and 1 and ${table.confidence} not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`,
    ),
    check(
      "threshold_evidence_lifecycle_check",
      sql`(${table.status} = 'active' and ${table.invalidated_at} is null) or (${table.status} in ('superseded', 'deleted') and ${table.invalidated_at} >= ${table.observed_at})`,
    ),
    index("threshold_evidence_active_profile_observed_idx")
      .on(table.profile_id, table.observed_at, table.id)
      .where(sql`${table.status} = 'active'`),
    index("threshold_evidence_activity_idx").on(table.activity_id, table.id),
    index("threshold_evidence_profile_identity_observed_idx").on(
      table.profile_id,
      table.activity_category,
      table.metric,
      table.observed_at,
      table.id,
    ),
  ],
);

/** Immutable session-RPE observations; corrections append a replacement row. */
export const activitySessionRpeEvidence = pgTable(
  "activity_session_rpe_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activity_id: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    recorded_at: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    corrected_at: timestamp("corrected_at", { withTimezone: true, mode: "date" }),
    rpe: integer("rpe").notNull(),
    scale: text("scale").notNull(),
    scale_version: text("scale_version").notNull(),
    source: activitySessionRpeSourceEnum("source").notNull(),
    operation_id: uuid("operation_id").notNull(),
    correction_of_id: uuid("correction_of_id"),
    provenance: jsonb("provenance").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("activity_session_rpe_evidence_id_activity_profile_unique").on(
      table.id,
      table.activity_id,
      table.profile_id,
    ),
    foreignKey({
      columns: [table.activity_id, table.profile_id],
      foreignColumns: [activities.id, activities.profile_id],
      name: "activity_session_rpe_evidence_activity_profile_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.correction_of_id, table.activity_id, table.profile_id],
      foreignColumns: [table.id, table.activity_id, table.profile_id],
      name: "activity_session_rpe_evidence_correction_same_activity_profile_fkey",
    }).onDelete("restrict"),
    uniqueIndex("activity_session_rpe_evidence_profile_operation_unique").on(
      table.profile_id,
      table.operation_id,
    ),
    uniqueIndex("activity_session_rpe_evidence_one_replacement_per_evidence_unique")
      .on(table.correction_of_id)
      .where(sql`${table.correction_of_id} is not null`),
    uniqueIndex("activity_session_rpe_evidence_one_root_per_activity_profile_unique")
      .on(table.activity_id, table.profile_id)
      .where(sql`${table.correction_of_id} is null`),
    index("idx_activity_session_rpe_evidence_activity_recorded")
      .on(table.activity_id, table.recorded_at, table.id)
      .where(sql`${table.correction_of_id} is null`),
    check("activity_session_rpe_evidence_rpe_bounds_check", sql`${table.rpe} between 1 and 10`),
    check("activity_session_rpe_evidence_scale_not_blank_check", sql`btrim(${table.scale}) <> ''`),
    check(
      "activity_session_rpe_evidence_scale_version_not_blank_check",
      sql`btrim(${table.scale_version}) <> ''`,
    ),
    check(
      "activity_session_rpe_evidence_correction_timestamp_check",
      sql`(${table.correction_of_id} is null) = (${table.corrected_at} is null)`,
    ),
    check(
      "activity_session_rpe_evidence_correction_manual_check",
      sql`${table.correction_of_id} is null or ${table.source} = 'manual'`,
    ),
    check(
      "activity_session_rpe_evidence_provenance_object_check",
      sql`jsonb_typeof(${table.provenance}) = 'object'`,
    ),
  ],
);

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    external_id: text("external_id").notNull(),
    lifecycle_status: text("lifecycle_status").notNull().default("active"),
    generation: integer("generation").notNull().default(1),
    disconnect_requested_at: timestamp("disconnect_requested_at", {
      withTimezone: true,
      mode: "date",
    }),
    disconnected_at: timestamp("disconnected_at", { withTimezone: true, mode: "date" }),
    remote_revoked_at: timestamp("remote_revoked_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("integrations_id_profile_unique").on(table.id, table.profile_id),
    unique("unique_integration_type").on(table.profile_id, table.provider),
    uniqueIndex("integrations_provider_external_id_unique")
      .on(table.provider, table.external_id)
      .where(sql`${table.external_id} is not null`),
    index("idx_integrations_profile_id").on(table.profile_id),
    index("idx_integrations_external_id").on(table.external_id),
    index("idx_integrations_provider").on(table.provider),
  ],
);

export const integrationCredentials = pgTable(
  "integration_credentials",
  {
    integration_id: uuid("integration_id")
      .primaryKey()
      .references(() => integrations.id, { onDelete: "cascade" }),
    access_token: text("access_token").notNull(),
    refresh_token: text("refresh_token"),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    scope: text("scope"),
    generation: integer("generation").default(1).notNull(),
    reconnect_required_at: timestamp("reconnect_required_at", {
      withTimezone: true,
      mode: "date",
    }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_integration_credentials_expires_at").on(table.expires_at),
    check(
      "integration_credentials_access_token_envelope_check",
      sql`${table.access_token} like 'enc:v1:%'`,
    ),
    check(
      "integration_credentials_refresh_token_envelope_check",
      sql`${table.refresh_token} is null or ${table.refresh_token} like 'enc:v1:%'`,
    ),
  ],
);

export const profileMetrics = pgTable(
  "profile_metrics",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    metric_type: profileMetricTypeEnum("metric_type").notNull(),
    recorded_at: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    unit: text("unit").notNull(),
    notes: text("notes"),
    reference_activity_id: uuid("reference_activity_id").references(() => activities.id, {
      onDelete: "set null",
    }),
    value: numeric("value", { mode: "number" }).notNull(),
    source: evidenceObservationSourceEnum("source"),
    method: text("method"),
    calculation_version: text("calculation_version"),
    quality_score: numeric("quality_score", { mode: "number" }),
    provenance: jsonb("provenance"),
  },
  (table) => [
    check("profile_metrics_value_check", sql`${table.value} >= 0`),
    check(
      "profile_metrics_method_not_blank_check",
      sql`${table.method} is null or btrim(${table.method}) <> ''`,
    ),
    check(
      "profile_metrics_calculation_version_not_blank_check",
      sql`${table.calculation_version} is null or btrim(${table.calculation_version}) <> ''`,
    ),
    check(
      "profile_metrics_quality_score_range_check",
      sql`${table.quality_score} is null or (${table.quality_score} >= 0 and ${table.quality_score} <= 1)`,
    ),
    check(
      "profile_metrics_provenance_object_check",
      sql`${table.provenance} is null or jsonb_typeof(${table.provenance}) = 'object'`,
    ),
    index("idx_profile_metrics_profile").on(table.profile_id, table.recorded_at),
    index("idx_profile_metrics_recorded_at").on(table.recorded_at),
    index("idx_profile_metrics_reference_activity")
      .on(table.reference_activity_id)
      .where(sql`${table.reference_activity_id} is not null`),
    index("idx_profile_metrics_temporal_lookup").on(
      table.profile_id,
      table.metric_type,
      table.recorded_at,
    ),
  ],
);

export const profileTrainingSettings = pgTable("profile_training_settings", {
  profile_id: uuid("profile_id")
    .primaryKey()
    .references(() => profiles.id),
  settings: jsonb("settings").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const apiRateLimitWindows = pgTable(
  "api_rate_limit_windows",
  {
    key_hash: text("key_hash").notNull(),
    window_started_at: timestamp("window_started_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    count: integer("count").notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.key_hash, table.window_started_at] }),
    check("api_rate_limit_windows_count_check", sql`${table.count} > 0`),
    index("idx_api_rate_limit_windows_expiry").on(table.expires_at),
  ],
);

export const profileGoals = pgTable(
  "profile_goals",
  {
    id: uuid("id").primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    title: text("title").notNull(),
    priority: integer("priority").notNull(),
    activity_category: activityCategoryEnum("activity_category").notNull(),
    target_date: date("target_date").notNull(),
    target_payload: jsonb("target_payload").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("idx_profile_goals_profile_id").on(table.profile_id),
    check(
      "profile_goals_title_length_check",
      sql`char_length(btrim(${table.title})) between 1 and 100`,
    ),
    check("profile_goals_priority_range", sql`${table.priority} between 0 and 10`),
    check(
      "profile_goals_target_payload_shape_check",
      sql`jsonb_typeof(${table.target_payload}) = 'object'
        and ${table.target_payload} ? 'type'
        and jsonb_typeof(${table.target_payload}->'type') = 'string'
        and ${table.target_payload}->>'type' in ('event_performance', 'threshold', 'completion', 'consistency')
        and (not (${table.target_payload} ? 'activity_category')
          or (jsonb_typeof(${table.target_payload}->'activity_category') = 'string'
            and ${table.target_payload}->>'activity_category' = ${table.activity_category}::text))`,
    ),
    check(
      "profile_goals_event_performance_payload_check",
      sql`${table.target_payload}->>'type' <> 'event_performance' or (
        ${table.target_payload} - array['type', 'activity_category', 'distance_m', 'target_time_s', 'target_speed_mps', 'environment', 'tolerance_pct']::text[] = '{}'::jsonb
        and ${table.target_payload} ? 'activity_category'
        and ${table.target_payload} ? 'distance_m'
        and case when jsonb_typeof(${table.target_payload}->'distance_m') = 'number'
          then (${table.target_payload}->>'distance_m')::numeric > 0 else false end
        and (${table.target_payload} ? 'target_time_s' or ${table.target_payload} ? 'target_speed_mps')
        and (not (${table.target_payload} ? 'target_time_s') or case
          when jsonb_typeof(${table.target_payload}->'target_time_s') = 'number'
          then (${table.target_payload}->>'target_time_s')::numeric > 0
            and trunc((${table.target_payload}->>'target_time_s')::numeric) = (${table.target_payload}->>'target_time_s')::numeric
          else false end)
        and (not (${table.target_payload} ? 'target_speed_mps') or case
          when jsonb_typeof(${table.target_payload}->'target_speed_mps') = 'number'
          then (${table.target_payload}->>'target_speed_mps')::numeric > 0 else false end)
        and (not (${table.target_payload} ? 'environment') or (
          jsonb_typeof(${table.target_payload}->'environment') = 'string'
          and char_length(btrim(${table.target_payload}->>'environment')) between 1 and 80))
        and (not (${table.target_payload} ? 'tolerance_pct') or case
          when jsonb_typeof(${table.target_payload}->'tolerance_pct') = 'number'
          then (${table.target_payload}->>'tolerance_pct')::numeric between 0 and 1 else false end)
      )`,
    ),
    check(
      "profile_goals_threshold_payload_check",
      sql`${table.target_payload}->>'type' <> 'threshold' or (
        ${table.target_payload} - array['type', 'metric', 'activity_category', 'value', 'test_duration_s', 'tolerance_pct']::text[] = '{}'::jsonb
        and ${table.target_payload} ? 'metric'
        and jsonb_typeof(${table.target_payload}->'metric') = 'string'
        and ${table.target_payload}->>'metric' in ('pace', 'power', 'hr')
        and ${table.target_payload} ? 'value'
        and case when jsonb_typeof(${table.target_payload}->'value') = 'number'
          then (${table.target_payload}->>'value')::numeric > 0 else false end
        and (not (${table.target_payload} ? 'test_duration_s') or case
          when jsonb_typeof(${table.target_payload}->'test_duration_s') = 'number'
          then (${table.target_payload}->>'test_duration_s')::numeric > 0
            and trunc((${table.target_payload}->>'test_duration_s')::numeric) = (${table.target_payload}->>'test_duration_s')::numeric
          else false end)
        and (not (${table.target_payload} ? 'tolerance_pct') or case
          when jsonb_typeof(${table.target_payload}->'tolerance_pct') = 'number'
          then (${table.target_payload}->>'tolerance_pct')::numeric between 0 and 1 else false end)
      )`,
    ),
    check(
      "profile_goals_completion_payload_check",
      sql`${table.target_payload}->>'type' <> 'completion' or (
        ${table.target_payload} - array['type', 'activity_category', 'distance_m', 'duration_s']::text[] = '{}'::jsonb
        and (${table.target_payload} ? 'distance_m' or ${table.target_payload} ? 'duration_s')
        and (not (${table.target_payload} ? 'distance_m') or case
          when jsonb_typeof(${table.target_payload}->'distance_m') = 'number'
          then (${table.target_payload}->>'distance_m')::numeric > 0 else false end)
        and (not (${table.target_payload} ? 'duration_s') or case
          when jsonb_typeof(${table.target_payload}->'duration_s') = 'number'
          then (${table.target_payload}->>'duration_s')::numeric > 0
            and trunc((${table.target_payload}->>'duration_s')::numeric) = (${table.target_payload}->>'duration_s')::numeric
          else false end)
      )`,
    ),
    check(
      "profile_goals_consistency_payload_check",
      sql`${table.target_payload}->>'type' <> 'consistency' or (
        ${table.target_payload} - array['type', 'target_sessions_per_week', 'target_weeks']::text[] = '{}'::jsonb
        and (${table.target_payload} ? 'target_sessions_per_week' or ${table.target_payload} ? 'target_weeks')
        and (not (${table.target_payload} ? 'target_sessions_per_week') or case
          when jsonb_typeof(${table.target_payload}->'target_sessions_per_week') = 'number'
          then (${table.target_payload}->>'target_sessions_per_week')::numeric > 0
            and trunc((${table.target_payload}->>'target_sessions_per_week')::numeric) = (${table.target_payload}->>'target_sessions_per_week')::numeric
          else false end)
        and (not (${table.target_payload} ? 'target_weeks') or case
          when jsonb_typeof(${table.target_payload}->'target_weeks') = 'number'
          then (${table.target_payload}->>'target_weeks')::numeric > 0
            and trunc((${table.target_payload}->>'target_weeks')::numeric) = (${table.target_payload}->>'target_weeks')::numeric
          else false end)
      )`,
    ),
  ],
);

export const oauthStates = pgTable(
  "oauth_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    state: text("state").notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    mobile_redirect_uri: text("mobile_redirect_uri").notNull(),
    callback_uri: text("callback_uri"),
    requested_scope: text("requested_scope"),
    verifier_hash: text("verifier_hash"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    unique("oauth_states_state_unique").on(table.state),
    index("idx_oauth_states_expires_at").on(table.expires_at),
    index("idx_oauth_states_profile_id").on(table.profile_id),
  ],
);

export const integrationResourceLinks = pgTable(
  "integration_resource_links",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    synced_at: timestamp("synced_at", { withTimezone: true, mode: "date" }),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    integration_id: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    resource_kind: integrationResourceKindEnum("resource_kind").notNull(),
    internal_resource_id: uuid("internal_resource_id").notNull(),
    external_id: text("external_id").notNull(),
    provider_updated_at: timestamp("provider_updated_at", { withTimezone: true, mode: "date" }),
    provider_metadata: jsonb("provider_metadata"),
    payload_hash: text("payload_hash"),
  },
  (table) => [
    unique("integration_resource_links_internal_unique").on(
      table.integration_id,
      table.resource_kind,
      table.internal_resource_id,
    ),
    unique("integration_resource_links_external_unique").on(
      table.integration_id,
      table.resource_kind,
      table.external_id,
    ),
    index("idx_integration_resource_links_profile").on(table.profile_id),
    index("idx_integration_resource_links_integration").on(table.integration_id),
    index("idx_integration_resource_links_internal").on(
      table.resource_kind,
      table.internal_resource_id,
    ),
    index("idx_integration_resource_links_provider_external").on(table.provider, table.external_id),
    check(
      "integration_resource_links_no_activity_check",
      sql`${table.resource_kind} <> 'activity'`,
    ),
  ],
);

export const activityImportRuns = pgTable(
  "activity_import_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    integration_id: uuid("integration_id"),
    integration_generation: bigint("integration_generation", { mode: "number" }),
    kind: text("kind", {
      enum: ["onboarding", "history_sync", "manual_sync"],
    }).notNull(),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    window_start_at: timestamp("window_start_at", { withTimezone: true, mode: "date" }),
    window_end_at: timestamp("window_end_at", { withTimezone: true, mode: "date" }),
    next_cursor: text("next_cursor"),
    next_page: integer("next_page"),
    discovered_count: integer("discovered_count").notNull().default(0),
    imported_count: integer("imported_count").notNull().default(0),
    skipped_count: integer("skipped_count").notNull().default(0),
    skipped_diagnostics: jsonb("skipped_diagnostics").notNull().default(sql`'[]'::jsonb`),
    failed_count: integer("failed_count").notNull().default(0),
    material_change_count: integer("material_change_count").notNull().default(0),
    material_effective_from_at: timestamp("material_effective_from_at", {
      withTimezone: true,
      mode: "date",
    }),
    earliest_activity_at: timestamp("earliest_activity_at", {
      withTimezone: true,
      mode: "date",
    }),
    latest_activity_at: timestamp("latest_activity_at", { withTimezone: true, mode: "date" }),
    started_at: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completed_at: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    last_error_code: text("last_error_code"),
    superseded_by_run_id: uuid("superseded_by_run_id").references(
      (): AnyPgColumn => activityImportRuns.id,
      { onDelete: "restrict" },
    ),
    superseded_at: timestamp("superseded_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("activity_import_runs_id_profile_unique").on(table.id, table.profile_id),
    foreignKey({
      columns: [table.integration_id, table.profile_id],
      foreignColumns: [integrations.id, integrations.profile_id],
      name: "activity_import_runs_integration_profile_fkey",
    }).onDelete("cascade"),
    index("activity_import_runs_profile_status_updated_idx").on(
      table.profile_id,
      table.status,
      table.updated_at,
    ),
    index("activity_import_runs_integration_status_updated_idx")
      .on(table.integration_id, table.status, table.updated_at)
      .where(sql`${table.integration_id} is not null`),
    uniqueIndex("activity_import_runs_running_bulk_profile_unique")
      .on(table.profile_id)
      .where(
        sql`${table.status} = 'running' and ${table.kind} in ('onboarding', 'history_sync', 'manual_sync')`,
      ),
    check(
      "activity_import_runs_kind_check",
      sql`${table.kind} in ('onboarding', 'history_sync', 'manual_sync')`,
    ),
    check(
      "activity_import_runs_status_check",
      sql`${table.status} in ('queued', 'running', 'completed', 'failed', 'cancelled')`,
    ),
    check(
      "activity_import_runs_counts_check",
      sql`${table.discovered_count} >= 0 and ${table.imported_count} >= 0 and ${table.skipped_count} >= 0 and ${table.failed_count} >= 0 and ${table.material_change_count} >= 0`,
    ),
    check(
      "activity_import_runs_skipped_diagnostics_check",
      sql`jsonb_typeof(${table.skipped_diagnostics}) = 'array' and jsonb_array_length(${table.skipped_diagnostics}) <= 120 and pg_column_size(${table.skipped_diagnostics}) <= 16384`,
    ),
    check(
      "activity_import_runs_next_page_check",
      sql`${table.next_page} is null or ${table.next_page} >= 1`,
    ),
    check(
      "activity_import_runs_cursor_page_check",
      sql`num_nonnulls(${table.next_cursor}, ${table.next_page}) <= 1`,
    ),
    check(
      "activity_import_runs_integration_generation_check",
      sql`(${table.integration_id} is null) = (${table.integration_generation} is null)`,
    ),
    check(
      "activity_import_runs_terminal_check",
      sql`${table.status} not in ('completed', 'failed', 'cancelled') or ${table.completed_at} is not null`,
    ),
    check(
      "activity_import_runs_error_check",
      sql`${table.last_error_code} is null or btrim(${table.last_error_code}) <> ''`,
    ),
    check(
      "activity_import_runs_supersession_check",
      sql`num_nonnulls(${table.superseded_by_run_id}, ${table.superseded_at}) in (0, 2) and (${table.superseded_by_run_id} is null or (${table.status} = 'failed' and ${table.superseded_by_run_id} <> ${table.id}))`,
    ),
  ],
);

export const activitySourceReferences = pgTable(
  "activity_source_references",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activity_id: uuid("activity_id").notNull(),
    integration_id: uuid("integration_id").notNull(),
    provider: text("provider").notNull(),
    provider_external_id: text("provider_external_id").notNull(),
    provider_revision: text("provider_revision"),
    origin_provider: text("origin_provider"),
    origin_external_id: text("origin_external_id"),
    artifact_sha256: text("artifact_sha256"),
    last_import_run_id: uuid("last_import_run_id"),
    last_material_import_run_id: uuid("last_material_import_run_id"),
    last_material_effective_at: timestamp("last_material_effective_at", {
      withTimezone: true,
      mode: "date",
    }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.integration_id, table.profile_id],
      foreignColumns: [integrations.id, integrations.profile_id],
      name: "activity_source_references_integration_profile_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.activity_id, table.profile_id],
      foreignColumns: [activities.id, activities.profile_id],
      name: "activity_source_references_activity_profile_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.last_import_run_id, table.profile_id],
      foreignColumns: [activityImportRuns.id, activityImportRuns.profile_id],
      name: "activity_source_refs_last_import_run_profile_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.last_material_import_run_id, table.profile_id],
      foreignColumns: [activityImportRuns.id, activityImportRuns.profile_id],
      name: "activity_source_refs_material_import_run_profile_fk",
    }).onDelete("set null"),
    unique("activity_source_references_provider_unique").on(
      table.profile_id,
      table.provider,
      table.provider_external_id,
    ),
    uniqueIndex("activity_source_references_origin_unique")
      .on(table.profile_id, table.origin_provider, table.origin_external_id)
      .where(sql`${table.origin_provider} is not null and ${table.origin_external_id} is not null`),
    uniqueIndex("activity_source_references_artifact_unique")
      .on(table.profile_id, table.artifact_sha256)
      .where(sql`${table.artifact_sha256} is not null`),
    index("activity_source_references_activity_idx").on(table.activity_id),
    index("activity_source_references_integration_idx").on(table.integration_id),
    index("activity_source_references_import_run_idx")
      .on(table.last_import_run_id)
      .where(sql`${table.last_import_run_id} is not null`),
    index("activity_source_references_material_import_run_idx")
      .on(table.last_material_import_run_id)
      .where(sql`${table.last_material_import_run_id} is not null`),
    check(
      "activity_source_references_provider_check",
      sql`btrim(${table.provider}) <> '' and btrim(${table.provider_external_id}) <> ''`,
    ),
    check(
      "activity_source_references_origin_check",
      sql`(${table.origin_provider} is null) = (${table.origin_external_id} is null)`,
    ),
    check(
      "activity_source_references_artifact_check",
      sql`${table.artifact_sha256} is null or ${table.artifact_sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "activity_source_references_material_import_check",
      sql`(${table.last_material_import_run_id} is null) = (${table.last_material_effective_at} is null)`,
    ),
  ],
);

export const providerSyncState = pgTable(
  "provider_sync_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    integration_id: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    resource: text("resource").notNull(),
    publish_horizon_days: integer("publish_horizon_days"),
    sync_mode: text("sync_mode").notNull(),
    last_sync_started_at: timestamp("last_sync_started_at", { withTimezone: true, mode: "date" }),
    last_sync_succeeded_at: timestamp("last_sync_succeeded_at", {
      withTimezone: true,
      mode: "date",
    }),
    last_sync_failed_at: timestamp("last_sync_failed_at", { withTimezone: true, mode: "date" }),
    next_sync_at: timestamp("next_sync_at", { withTimezone: true, mode: "date" }),
    consecutive_failures: integer("consecutive_failures").notNull().default(0),
    last_error: text("last_error"),
    cursor: text("cursor"),
    high_watermark: timestamp("high_watermark", { withTimezone: true, mode: "date" }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    unique("provider_sync_state_integration_resource_unique").on(
      table.integration_id,
      table.resource,
    ),
    index("idx_provider_sync_state_provider_next_sync").on(table.provider, table.next_sync_at),
  ],
);

export const providerSyncJobs = pgTable(
  "provider_sync_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    queue_sequence: bigint("queue_sequence", { mode: "number" })
      .generatedByDefaultAsIdentity()
      .notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    integration_id: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    integration_generation: integer("integration_generation").notNull().default(1),
    import_run_id: uuid("import_run_id"),
    job_type: text("job_type").notNull(),
    operation: text("operation"),
    resource_kind: integrationResourceKindEnum("resource_kind"),
    internal_resource_id: uuid("internal_resource_id"),
    sync_lane_key: text("sync_lane_key"),
    status: text("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(100),
    run_at: timestamp("run_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    attempt: integer("attempt").notNull().default(0),
    max_attempts: integer("max_attempts").notNull().default(8),
    dedupe_key: text("dedupe_key"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    payload_hash: text("payload_hash"),
    supersedes_job_id: uuid("supersedes_job_id"),
    last_error: text("last_error"),
    locked_at: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lock_expires_at: timestamp("lock_expires_at", { withTimezone: true, mode: "date" }),
    locked_by: text("locked_by"),
  },
  (table) => [
    foreignKey({
      columns: [table.import_run_id, table.profile_id],
      foreignColumns: [activityImportRuns.id, activityImportRuns.profile_id],
      name: "provider_sync_jobs_import_run_profile_fkey",
    }).onDelete("set null"),
    uniqueIndex("provider_sync_jobs_queue_sequence_key").on(table.queue_sequence),
    index("idx_provider_sync_jobs_status_run_at_priority").on(
      table.status,
      table.run_at,
      table.priority,
    ),
    index("idx_provider_sync_jobs_provider_profile_status").on(
      table.provider,
      table.profile_id,
      table.status,
    ),
    index("idx_provider_sync_jobs_dedupe_key").on(table.dedupe_key),
    index("idx_provider_sync_jobs_lane_status").on(table.sync_lane_key, table.status, table.run_at),
    index("idx_provider_sync_jobs_integration_id").on(table.integration_id),
    index("idx_provider_sync_jobs_import_run_id")
      .on(table.import_run_id)
      .where(sql`${table.import_run_id} is not null`),
    index("idx_provider_sync_jobs_integration_generation_status").on(
      table.integration_id,
      table.integration_generation,
      table.status,
    ),
    index("idx_provider_sync_jobs_profile_id").on(table.profile_id),
    index("idx_provider_sync_jobs_supersedes_job_id")
      .on(table.supersedes_job_id)
      .where(sql`${table.supersedes_job_id} is not null`),
  ],
);

export const providerWebhookReceipts = pgTable(
  "provider_webhook_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    received_at: timestamp("received_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    processed_at: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    provider: integrationProviderEnum("provider").notNull(),
    integration_id: uuid("integration_id").references(() => integrations.id, {
      onDelete: "cascade",
    }),
    // Immutable ingress fence: never bind a receipt to a later reconnect.
    integration_generation: integer("integration_generation"),
    provider_account_id: text("provider_account_id"),
    provider_event_id: text("provider_event_id"),
    event_type: text("event_type").notNull(),
    object_type: text("object_type"),
    object_id: text("object_id"),
    payload: jsonb("payload").notNull(),
    payload_hash: text("payload_hash"),
    processing_status: text("processing_status").notNull().default("pending"),
    job_id: uuid("job_id").references(() => providerSyncJobs.id, { onDelete: "set null" }),
    last_error: text("last_error"),
  },
  (table) => [
    unique("provider_webhook_receipts_event_unique").on(
      table.provider,
      table.provider_account_id,
      table.provider_event_id,
    ),
    index("idx_provider_webhook_receipts_provider_status").on(
      table.provider,
      table.processing_status,
    ),
    index("idx_provider_webhook_receipts_job_id").on(table.job_id),
    index("idx_provider_webhook_receipts_integration_id")
      .on(table.integration_id)
      .where(sql`${table.integration_id} is not null`),
    index("idx_provider_webhook_receipts_integration_generation_status")
      .on(table.integration_id, table.integration_generation, table.processing_status)
      .where(sql`${table.integration_id} is not null`),
    check(
      "provider_webhook_receipts_integration_generation_pair_check",
      sql`(${table.integration_id} is null) = (${table.integration_generation} is null)`,
    ),
    check(
      "provider_webhook_receipts_integration_generation_positive_check",
      sql`${table.integration_generation} is null or ${table.integration_generation} > 0`,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    actor_id: uuid("actor_id")
      .notNull()
      .references(() => profiles.id),
    type: notificationTypeEnum("type").notNull(),
    entity_id: uuid("entity_id"),
    read_at: timestamp("read_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("idx_notifications_user_id").on(table.user_id),
    index("idx_notifications_actor_id").on(table.actor_id),
    index("idx_notifications_read_at").on(table.read_at),
  ],
);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  is_group: boolean("is_group").notNull().default(false),
  group_name: text("group_name"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  last_message_at: timestamp("last_message_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    last_read_at: timestamp("last_read_at", { withTimezone: true, mode: "date" }),
    last_read_message_id: uuid("last_read_message_id"),
  },
  (table) => [
    primaryKey({ columns: [table.conversation_id, table.user_id] }),
    index("idx_conversation_participants_user_id").on(table.user_id),
    check(
      "conversation_participants_read_cursor_pair_check",
      sql`(${table.last_read_at} is null) = (${table.last_read_message_id} is null)`,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sender_id: uuid("sender_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    read_at: timestamp("read_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("idx_messages_conversation_id").on(table.conversation_id),
    index("idx_messages_sender_id").on(table.sender_id),
  ],
);

export const follows = pgTable(
  "follows",
  {
    follower_id: uuid("follower_id")
      .notNull()
      .references(() => profiles.id),
    following_id: uuid("following_id")
      .notNull()
      .references(() => profiles.id),
    status: text("status", { enum: ["pending", "accepted"] }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.follower_id, table.following_id] }),
    index("idx_follows_following_id").on(table.following_id),
    check("follows_status_check", sql`${table.status} in ('pending', 'accepted')`),
  ],
);

export const likes = pgTable(
  "likes",
  {
    id: uuid("id").primaryKey(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    entity_id: uuid("entity_id").notNull(),
    entity_type: likeEntityTypeEnum("entity_type").notNull(),
  },
  (table) => [
    unique("likes_profile_entity_unique").on(table.profile_id, table.entity_type, table.entity_id),
    index("idx_likes_entity").on(table.entity_type, table.entity_id),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey(),
    profile_id: uuid("profile_id").references(() => profiles.id),
    entity_type: text("entity_type", {
      enum: ["activity", "training_plan", "activity_plan", "route", "event"],
    }).notNull(),
    entity_id: uuid("entity_id").notNull(),
    content: text("content").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("idx_comments_entity").on(table.entity_type, table.entity_id),
    index("idx_comments_profile_id").on(table.profile_id, table.created_at),
    index("idx_comments_created_at").on(table.created_at),
    check(
      "comments_entity_type_check",
      sql`${table.entity_type} in ('activity', 'training_plan', 'activity_plan', 'route', 'event')`,
    ),
  ],
);
