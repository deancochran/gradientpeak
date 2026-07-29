import { integrationProviderIdValues } from "@repo/core/integrations/provider-capabilities";
import {
  ATHLETE_READ_SCOPES,
  type AthleteReadScope,
  ORGANIZATION_ROLE_KEYS,
  type OrganizationRoleKey,
} from "@repo/core/organizations/constants";
import { socialCommentEntityTypeValues, socialLikeEntityTypeValues } from "@repo/core/social";
import { canonicalActivityCategoryDbValues } from "./canonical-activity-categories";
import { integrationProviderEnum, likeEntityTypeEnum } from "./enums";

// These literals are DB-owned: Core can validate their union membership but does not supply them.
export const organizationRoleKeyDbValues = [
  "admin",
  "coach",
] as const satisfies readonly OrganizationRoleKey[];
export const athleteReadScopeDbValues = [
  "basic_profile",
  "training",
  "activities",
  "metrics",
  "goals",
  "calendar",
] as const satisfies readonly AthleteReadScope[];

/**
 * Explicit ownership boundary for database enum parity. Comments intentionally
 * retain a text column for historical rows; repository validation maps it to
 * the narrower Core comment taxonomy.
 */
export const coreEnumParityManifest = {
  organization_role_key: {
    coreValues: [...ORGANIZATION_ROLE_KEYS].sort(),
    databaseValues: [...organizationRoleKeyDbValues].sort(),
    strategy: "check-constraint" as const,
  },
  athlete_read_scope: {
    coreValues: [...ATHLETE_READ_SCOPES].sort(),
    databaseValues: [...athleteReadScopeDbValues].sort(),
    strategy: "check-constraint" as const,
  },
  canonical_activity_categories: {
    coreValues: canonicalActivityCategoryDbValues,
    databaseValues: canonicalActivityCategoryDbValues,
    strategy: "reference-table-seed" as const,
  },
  integration_provider: {
    coreValues: [...integrationProviderIdValues].sort(),
    databaseValues: integrationProviderEnum.enumValues,
    strategy: "exact" as const,
  },
  like_entity_type: {
    coreValues: [...socialLikeEntityTypeValues].sort(),
    databaseValues: likeEntityTypeEnum.enumValues,
    strategy: "exact" as const,
  },
  comments_entity_type: {
    coreValues: socialCommentEntityTypeValues,
    databaseValues: "text" as const,
    strategy: "repository-validates-core-values" as const,
  },
} as const;
