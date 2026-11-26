# Shared objectives: proposed additive persistence

Status: design only; schema implementation and activation are not authorized.
Owner: `gp-h2d` M7. Source inspected: `4b0b913c`.

## Why persistence is needed

- `profile_goals` owns individual goals but has no shared-objective or plan link.
- Training-plan goal blueprints copy goal content. The builder's
  `sourceProfileGoalId` does not survive the canonical persisted blueprint.
  Matching titles or dates cannot establish a relationship.
- A planned session's `group_event_id` links scheduled work to an event, not a
  personal goal.
- Community `groups`/`group_events` and coaching `organization_groups` have
  different membership and privacy rules. Neither implies the other's access.

Sources: `packages/db/src/schema/tables.ts` (`profileGoals`, `trainingPlans`,
`plannedSessions`, `groupEvents`, `organizationGroups`);
`packages/core/schemas/training-plan-structure/domain-schemas.ts`
(`trainingPlanGoalBlueprintSchema`);
`packages/core/plan/canonicalTrainingPlanProjection.ts`.

## Recommended smallest coherent design

Reuse personal goals, plans, schedules, simulations, and consent policies. Add a
coordination object, not a second training engine or a new team/membership model.

1. **Shared objectives:** identity and exactly one owning community group or
   organization group; current revision; active/archived state. Organization
   group identity stays tenant-bound. Creation and revision follow the owning
   group's authorized management role; management never grants athlete writes.
2. **Objective revisions:** immutable title and target date, revision number,
   actor and timestamp. Date changes produce a new revision instead of erasing
   the date a participant accepted. No private athlete evidence lives here.
3. **Athlete objective links:** an athlete-owned goal and optionally their owned
   training plan, linked to an explicitly accepted objective revision, with a
   link revision and attribution. A link is created only by the athlete after
   confirmation; a coach can communicate a proposal through existing messaging
   without creating a new proposal workflow. Multiple objectives may coexist.

Exact column names remain implementation detail. Required database invariants:

- Scope is exclusive, with real foreign keys to the selected existing group.
- Goal and optional plan ownership use composite owner foreign keys, adding
  matching unique owner keys where needed; an application check alone is not
  enough.
- Accepted objective revision must belong to that same objective.
- Revisions are positive, dates valid, titles bounded/nonempty, identities
  unique, and relationships indexed for bounded participant reads.
- Removing a link never removes or rewrites the personal goal, plan, or sessions.
  Archiving an objective preserves accepted history.
- New tables default-deny to public clients. Deliberate API authorization must
  still enforce scope, membership, assignment and each evidence consent.

This avoids separate goal-link and plan-link approval systems and a fourth
date-negotiation table. No links are inferred or backfilled.

## Change and privacy behavior

- A shared date change does not change any personal goal date or plan schedule.
  The UI compares the accepted and current objective revisions and shows the
  pending difference.
- An athlete explicitly accepts the new coordination revision, keeps their own
  date, or requests an individual adjustment using existing preview/edit flows.
  Accepting a coordination revision alone never applies a plan change.
- Personal goal/plan changes and link updates use their own concurrency checks.
  A stale read cannot silently relink a different goal or apply an old proposal.
- Leaving a group or losing access stops group-scoped access immediately, but
  does not delete the athlete's personal work. Private history must not remain
  visible to a revoked coach through a previously loaded roster.
- Participation does not publish private goals, plan contents, or physiology.
  Coaches see only separately authorized evidence; community members do not
  gain access to another athlete's evidence merely by sharing an objective.
- No automatic ranking, catch-up, bulk rescheduling, or cross-scope aggregation.
  Coach writes remain blocked on the separately approved operation policy.

## Approval boundary

Requested authority is limited to source schema/contracts, the repository-owned
fresh-target baseline artifacts, and verification on documented disposable
targets. It would not authorize migrating/resetting preview, preserved local
data, hosted data, deployment, or production activation.

Follow `packages/db/README.md` and the fresh-only baseline workflow. Do not
invent an additive migration pipeline or apply the fresh-only baseline to a
preserved target. Any eventual preserved-target activation requires a separate
compatibility/migration proposal and approval.

## Required evidence before delivery

- Two athletes retain different owned goals/plans while sharing an objective.
- Wrong owner, organization, group, missing consent and revoked access are
  denied at the real API/database boundary.
- Multiple objectives and concurrent revisions retain independent links.
- Shared date changes leave personal records byte-for-byte unchanged until an
  explicit, separately authorized personal edit.
- Old clients and existing self-service flows work with no coordination rows.
- No mandatory fields are added to existing client DTOs.
- New empty tables require no backfill and do not change existing plans' JSON.
- Disposable schema verification, ownership/constraint tests, and web/native
  participant journeys pass. Fresh-target success does not prove preserved
  database upgrade compatibility.

Until approved, M7 persistence is blocked; other visual/read work continues.
