export type PermissionAction = "read" | "manage" | "read_geometry";

export type PermissionContentType =
  | "profile"
  | "event"
  | "activity_plan"
  | "activity_route"
  | "training_plan";

export type PermissionResource = {
  type: PermissionContentType;
  id: string;
};

export type AccessLevel = "read" | "read_geometry";

export type AccessReason = "owner" | "public" | "system" | "grant" | "denied";

export type AccessSource = {
  type: "event" | "training_plan";
  id: string;
};

export type PermissionDecision = {
  allowed: boolean;
  accessLevel?: PermissionAction;
  reason?: AccessReason;
  source?: AccessSource;
};

export type GrantInput = {
  actorProfileId: string;
  granteeProfileId: string;
  resource: PermissionResource;
  source: AccessSource;
};
