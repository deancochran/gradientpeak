import {
  integrationProviderIdValues,
  socialCommentEntityTypeValues,
  socialLikeEntityTypeValues,
} from "@repo/core";
import { integrationProviderEnum, likeEntityTypeEnum } from "./enums";

/**
 * Explicit ownership boundary for database enum parity. Comments intentionally
 * retain a text column for historical rows; repository validation maps it to
 * the narrower Core comment taxonomy.
 */
export const coreEnumParityManifest = {
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
