/** Fixed governance roles. Root ownership is an organization identity fact, not a role. */
export const ORGANIZATION_ROLE_KEYS = ["admin", "coach"] as const;
export type OrganizationRoleKey = (typeof ORGANIZATION_ROLE_KEYS)[number];

export const ORGANIZATION_OPERATIONS = [
  "read_organization_context",
  "transfer_root_ownership",
  "manage_administrators",
  "close_organization",
  "manage_coaches",
  "read_administrative_roster",
  "manage_engagements",
  "manage_assignments",
  "cease_organization_processing",
  "read_assigned_roster",
  "read_athlete_basic_profile",
  "read_athlete_training",
  "read_athlete_activities",
  "read_athlete_metrics",
  "read_athlete_goals",
  "read_athlete_calendar",
  "manage_organization_groups",
] as const;
export type OrganizationOperation = (typeof ORGANIZATION_OPERATIONS)[number];

export const ATHLETE_READ_SCOPES = [
  "basic_profile",
  "training",
  "activities",
  "metrics",
  "goals",
  "calendar",
] as const;
export type AthleteReadScope = (typeof ATHLETE_READ_SCOPES)[number];

/** Internal fail-closed outcomes from the complete delegated athlete-read authority chain. */
export const ATHLETE_READ_ACCESS_DENIAL_REASONS = [
  "organization_not_active",
  "membership_not_active",
  "missing_coach_role",
  "engagement_not_active",
  "assignment_missing",
  "consent_missing",
  "consent_expired",
  "consent_ended",
  "consent_policy_not_effective",
] as const;
export type AthleteReadAccessDenialReason = (typeof ATHLETE_READ_ACCESS_DENIAL_REASONS)[number];

export const ORGANIZATION_OPERATION_REQUIREMENTS = {
  read_organization_context: "member",
  transfer_root_ownership: "root_owner",
  manage_administrators: "root_owner",
  close_organization: "root_owner",
  manage_coaches: "admin",
  read_administrative_roster: "admin",
  manage_engagements: "admin",
  manage_assignments: "admin",
  cease_organization_processing: "admin",
  read_assigned_roster: "coach",
  read_athlete_basic_profile: "coach",
  read_athlete_training: "coach",
  read_athlete_activities: "coach",
  read_athlete_metrics: "coach",
  read_athlete_goals: "coach",
  read_athlete_calendar: "coach",
  manage_organization_groups: "admin",
} as const satisfies Record<OrganizationOperation, "member" | "root_owner" | OrganizationRoleKey>;
export type OrganizationOperationRequirement =
  (typeof ORGANIZATION_OPERATION_REQUIREMENTS)[OrganizationOperation];

export const ATHLETE_READ_SCOPE_OPERATIONS = {
  basic_profile: "read_athlete_basic_profile",
  training: "read_athlete_training",
  activities: "read_athlete_activities",
  metrics: "read_athlete_metrics",
  goals: "read_athlete_goals",
  calendar: "read_athlete_calendar",
} as const satisfies Record<AthleteReadScope, OrganizationOperation>;

export const ORGANIZATION_MEMBERSHIP_STATUSES = ["active", "inactive"] as const;
export type OrganizationMembershipStatus = (typeof ORGANIZATION_MEMBERSHIP_STATUSES)[number];

export const ORGANIZATION_ROLE_GRANT_STATUSES = ["active", "inactive"] as const;
export type OrganizationRoleGrantStatus = (typeof ORGANIZATION_ROLE_GRANT_STATUSES)[number];

/** Invitation kinds deliberately do not imply one another or athlete consent. */
export const ORGANIZATION_INVITATION_KINDS = ["staff", "athlete"] as const;
export type OrganizationInvitationKind = (typeof ORGANIZATION_INVITATION_KINDS)[number];

export const ORGANIZATION_INVITATION_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "revoked",
  "expired",
] as const;
export type OrganizationInvitationStatus = (typeof ORGANIZATION_INVITATION_STATUSES)[number];

export const COACHING_ASSIGNMENT_KINDS = ["primary", "supporting"] as const;
export type CoachingAssignmentKind = (typeof COACHING_ASSIGNMENT_KINDS)[number];

export const ORGANIZATION_GROUP_STATUSES = ["active", "archived"] as const;
export type OrganizationGroupStatus = (typeof ORGANIZATION_GROUP_STATUSES)[number];
