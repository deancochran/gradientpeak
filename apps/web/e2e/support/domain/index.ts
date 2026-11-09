import type { E2ECleanupRegistry } from "../cleanup";
import type { LocalE2EDatabase } from "../database";
import type { E2EExecutionIdentity } from "../identity";
import {
  ActivityFixtureBuilder,
  ActivityPlanFixtureBuilder,
  RouteFixtureBuilder,
} from "./activity";
import { GroupFixtureBuilder, MessagingFixtureBuilder, SocialFixtureBuilder } from "./community";
import { CalendarFixtureBuilder, TrainingPlanFixtureBuilder } from "./planning";

export function createDomainFixtureBuilders(
  database: LocalE2EDatabase,
  cleanup: E2ECleanupRegistry,
  identity: E2EExecutionIdentity,
) {
  return {
    activities: new ActivityFixtureBuilder(database, cleanup, identity),
    activityPlans: new ActivityPlanFixtureBuilder(database, cleanup, identity),
    calendar: new CalendarFixtureBuilder(database, cleanup, identity),
    groups: new GroupFixtureBuilder(database, cleanup, identity),
    messaging: new MessagingFixtureBuilder(database, cleanup, identity),
    routes: new RouteFixtureBuilder(database, cleanup, identity),
    social: new SocialFixtureBuilder(database, cleanup, identity),
    trainingPlans: new TrainingPlanFixtureBuilder(database, cleanup, identity),
  };
}

export type DomainFixtureBuilders = ReturnType<typeof createDomainFixtureBuilders>;
