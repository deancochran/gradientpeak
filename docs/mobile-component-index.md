# Mobile component index and simplification plan

**Audit date:** 2026-08-13  
**Scope:** production TSX **modules** in `apps/mobile/components`, excluding tests, mocks, fixtures, and route files. The count includes a small number of TSX hooks/controllers and modules that export multiple UI components; it is a file count, not a count of individual exported components.

## Recommendation

Reduce the *kinds of UI shells* before reducing feature composition. The app has **202 production TSX modules** in `apps/mobile/components`; most are justified because they own a domain workflow, a canonical entity presentation, or recording-specific behavior. The near-term reduction opportunity is small and low-risk: remove one dead component and consolidate repeated state, form-row, and generic section shells.

Do **not** merge canonical entity cards, activity-plan execution UI, training-plan builder UI, charts, or recording cockpit components merely because they are components. Those boundaries keep complex domain behavior readable and testable.

## Decision rules for new components

Create a component only when it owns at least one of these:

1. A reusable entity presentation with a stable contract (`ActivityCard`, `GroupCard`, `TrainingPlanCard`).
2. A meaningful user workflow or state boundary (a picker, sheet, editor, chart, recording panel, or detail section).
3. Platform/accessibility behavior that should not be repeated.

Otherwise, keep the markup in the owning screen/feature. In particular, do not create a component only to add spacing, a card border, a title, or a short empty-state message. Prefer the existing shared primitives listed below.

## Canonical shared layer

Use these rather than adding a feature-local equivalent.

| Need | Canonical component(s) | Why it exists |
|---|---|---|
| Entity display | `ActivityCard`, `ActivityPlanCard`, `TrainingPlanCard`, `RouteCard`, `GroupCard`, `GroupEventCard`, `ResourceCardPrimitives` | Keeps resource appearance and navigation consistent across lists, pickers, previews, and detail links. |
| Sheets and modal forms | `AppBottomSheet`, `AppBottomSheetContent`, `AppFormModal`, `AppConfirmModal`, `AppSelectionModal` | Centralizes dismissal, title, actions, loading, and error behavior. |
| Detail structure | `DetailScaffold`, `DetailLoadingState`, `DetailNotFoundState`, `DetailOverflowMenu`, `DetailDeleteConfirmModal` | Provides a predictable detail-screen hierarchy and destructive-action flow. |
| Lists, pickers, and search | `ResourceList`, `ResourcePickerModal`, `SearchableBottomSheetList`, `SearchField`, `IndexSearchBar`, `IndexFilterSheet` | Prevents a new picker/search/list shell for every feature. |
| Generic state | `ScreenState`, `LoadingState`, `EmptyState`, `ErrorState` | Standardizes normal loading, empty, and recoverable-error presentation. |
| Header and small actions | `AppHeader`, `HeaderAction`, `HeaderButtons`, `ClearFieldAction` | Keeps navigational/header actions and clear affordances consistent. |
| Base controls | `@repo/ui` `Text`, `Button`, `Card`, `Form`, inputs, avatar, progress, alert, loading, and semantic date/time controls | Cross-platform primitives with stable public contracts. |

## Production TSX module index

**Classification:** **Keep** means the boundary is justified; **Consolidate** means preserve behavior but replace or move the generic shell; **Remove** means no production reference was found. A grouped row lists modules rather than every export. Multi-component modules include the onboarding step module, which exports `IntroStep`, `IdentityStep`, `ActivityCategoryStep`, `ProfileAndIntentStep`, `TrainingBaselineStep`, `GoalsPreferencesStep`, and `SummaryStep`.

| Area | Modules/components | Why used | Classification |
|---|---|---|---|
| Activity detail | `activity/charts/{ElevationProfileChart,MultiMetricChart,StreamChart}`; `activity/maps/{ActivityRouteMap,RouteElevationCard}`; `activity/{SessionRpeCard}`; `activity/shared/{ActivityHeader,ZoneDistributionCard}`; `activity/plan/ActivityPlanComparison` | Activity-specific maps, streams, metrics, and planned-versus-completed comparison. | Keep |
| Activity-plan composition | `activity-plan/{ActivityPlanBasicsSection,ActivityPlanComposerScreen,ActivityPlanContentPreview,ActivityPlanDetailScreen}`; `activity-plan/structure/{StructureBuilderCard,StructureIntervalSheet}` | Plan authoring and detail workflows. | Keep |
| Activity-plan execution | `activity-plan/activity/{ActiveActivityMode,ActivityCategorySelector,ActivityMetricsGrid,ActivityProgress,CurrentStepDisplay,IntervalWizard,NextStepPreview,ProgressTrackingDisplay,SegmentHeader,StepBreakdown,StepDurationField,StepEditorDialog,StepPreviewCard,TargetMetricsCard,TargetZoneIndicator,TimelineChart}` | Active workout execution and interval editing; splitting avoids an unmaintainable execution screen. | Keep |
| Athlete baseline and authentication | `athlete-baseline/AthleteBaselineFields`; `auth/{AppBootstrapGate,ServerUrlOverride}` | Baseline form and startup/configuration boundary. `ServerUrlOverride` is configuration/dev support, not general UI. | Keep |
| Calendar | `calendar/{AgendaCards,CalendarActionsSheet,CalendarDayList,CalendarEventCard,CalendarHeader,CalendarManualCreateModal,CalendarMonthList,CalendarPlannedActivityPickerModal,CalendarTabScaffold,CalendarTimelineRows,CalendarWeekStrip,PlannedDaySummary}` | Calendar navigation, timeline rows, event display, creation, and scheduling. | Keep; review `GoalAgendaCard` in `AgendaCards` |
| Cross-feature charts | `charts/{ChartRangeModal,ConsistencyHeatmap,InteractiveChartValueTray,PerformanceTrendsChart,PlanReadinessComparisonChart,PlanVsActualChart,VolumeTrendsChart,ZoneDistributionOverTimeChart}` | Different analytical data shapes and interaction models. | Keep |
| Dev preview | `dev/MobileCardPreviewSurface` | Used only by the external Storybook route. | Keep as dev-only; do not ship it in ordinary navigation |
| Discover and feed | `discover/DiscoverFilterSheet`; `feed/{FeedEmptyState,FeedList}` | Search filters and feed-specific list state. | Keep; `FeedEmptyState` retains its two-CTA contract until shared state supports it |
| Cross-feature utilities | `EditAvatar`, `ErrorBoundary`, `RecordingValidationSheet`, `ScheduleActivityModal`, `TimeRangeSelector` | App-level recovery, user field editing, scheduling, recording validation, and time selection. | Keep |
| Events | `event/{EventEditorCard}`; `event/create/{CreateEventFlow,CreateEventMainStep,RepeatStep}` | Event editing and multi-step creation flow. | Keep |
| Goals | `goals/{GoalEditorModal,GoalIntelligenceCard}` | Goal authoring and goal-specific decision context. | Keep |
| Groups | `groups/{GroupActions,GroupBadges,GroupCards,GroupEventCards,GroupEventDetail,GroupEventForm,GroupEventList,GroupEventStates,GroupForm,GroupList,GroupRows,GroupStates}` | Canonical group/event cards, membership rows, forms, and group-specific permissions. | Keep cards/forms/rows; consolidate ordinary empty states |
| Integrations and onboarding | `integrations/IntegrationProviderList`; `onboarding/{ProviderProcessingStep,ProviderSelectionStep,steps/GroupsAndPeopleStep}` | Provider connection and onboarding choices/progress. | Keep |
| Plan overview and ledger | `plan/{GoalListItem,GoalReadinessRing,PlanAdherenceMiniChart,PlanCapabilityMiniChart,PlanStatusSummaryCard,WeeklyLedger,WeekStrip}`; `plan/calendar/{ActivityStepChart,StepEditSheet}`; `plan/ledger/PlanningLedgerView` | Goal browsing, planning metrics, weekly ledger, and planned-step editing. | Keep; remove `GhostCard` below |
| Training-path review | `plan/training-path/{DailyTrainingAdjustmentChart,DailyTrainingAdjustmentTray,TrainingPathChart,TrainingPathLegend,TrainingPathLoadChartSection,TrainingPathReviewChartSection,TrainingPathSection,TrainingPathSelectedDayPanel,TrainingPathWeekReviewShell,TrainingPathWeekSummaryCard}` | High-density plan analysis with linked selection and chart state. | Keep |
| Recording cockpit | `recording/{RecordingActivityQuickEdit}`; `recording/cockpit/{RecordingBackdrop,RecordingControlSheet,RecordingFloatingPanel,RecordingLiveCockpit,RouteElevationBackdrop}`; `recording/cockpit/cards/{ActivityIntervalInsightCard,ClimbInsightCard,MetricsInsightCard,MetricTile,RouteProgressInsightCard,TrainerInsightCard}`; `recording/dock/RecordControlDock`; `recording/footer/RecordingControls`; `recording/ftms/{EllipticalControlUI,RowerControlUI,TreadmillControlUI}` | Live native recording, sensor/device controls, and contextual insight panels. These should remain isolated from generic UI work. | Keep |
| Profile | `profile/{PerformanceModelSummary,ProfileCard,ProfileGroupsSection,ProfileSummaryCard}` | Profile identity, memberships, and model summary. | Keep |
| Settings | `settings/{ProfileSection,TrainingPreferencesSummaryCard}`; `settings/training-preferences/{GlobalTrainingPreferenceCatalogSection,TrainingPreferenceFieldRenderer,TrainingPreferencesBottomSheet,TrainingPreferencesContent,TrainingPreferencesEditor,TrainingPreferencesPanel,TrainingPreferencesSurface,TrainingPreferencesTabs}`; `settings/training-preferences/sections/{AdaptationPreferencesSection,AvailabilitySection,BaselineFitnessSection,GoalStrategySection,PlanLocalPreferencesSection,RecoverySection,ScheduleSection,TrainingStyleSection}` | Preference editing has a real form/state boundary; each section maps to a distinct preference domain. | Keep |
| Shared entity and surface layer | `shared/{ActivityCard,ActivityPlanAttributionRow,ActivityPlanCard,ActivityPlanSummary,AppBottomSheet,AppFormModal,AppHeader,AppSelectionModal,ClearFieldAction,CompactInsightCard,DetailChartModal,EntityOwnerRow,HeaderAction,HeaderButtons,IndexFilterSheet,IndexSearchBar,LayoutPrimitives,ResourceCardPrimitives,ResourceList,RouteCard,ScreenState,SearchableBottomSheetList,SearchField,StaticRouteMapPreview,TrainingPlanCard,TrainingPlanPeriodizationPreview}`; `shared/detail/{DetailDeleteConfirmModal,DetailOverflowMenu,DetailScaffold,DetailState}`; `shared/resource-picker/{ResourcePickerModal,ResourcePickerResultRow}` | Reused display, navigation, modal, picker, and state patterns. | Keep; consolidate selected `LayoutPrimitives` only after reuse expands |
| Social | `social/EntityCommentsSection` | Shared entity engagement surface. | Keep |
| Training-plan detail, forms, and builder | `training-plan/{PlanningGoalCard,PlanningInputFieldRow,TrainingPlanDangerZoneCard,TrainingPlanDetailFocusBanner,TrainingPlanDetailHeaderActionsSection,TrainingPlanEventCard,TrainingPlanKpiRow,TrainingPlanNoPlanEmptyState,TrainingPlanStructureSection,TrainingPlanSummaryHeader,TrainingPlanTemplateSchedulingDialog}`; `training-plan/forms/{ActivityDistributionForm,PeriodizationForm,RecoveryRulesForm,WeeklyTargetsForm}`; `training-plan/modals/components/{ActivitySelector,ConstraintIndicator}`; `training-plan/create/{BuilderActivityAssignmentSheetContent,BuilderAssumptionsPreferencesForms,BuilderAuthoritativeProjectionCard,BuilderFieldList,BuilderGoalEditorSheetContent,BuilderProjectionOverview,BuilderScheduleEditor,BuilderSessionEditorSheetContent,BuilderStrategyComposer,BuilderTrainingPathReviewSection,TrainingPlanBuilderEventCard,TrainingPlanBuilderScreen,TrainingPlanBuilderSheetContent,TrainingPlanBuilderSheetFrame,TrainingPlanBuilderSheets,TrainingPlanBuilderSurfaces}` | Training-plan creation is a complex, stateful workflow. The feature components are cohesive composition, not generic wrappers. | Keep; consolidate `PlanningInputFieldRow` with a shared field-layout decision |
| Trends | `trends/CollapsibleSection` | Generic expandable section currently confined to the trends feature. | Consolidate or keep feature-local; do not move to `@repo/ui` until a second feature needs it |

### Non-component production modules intentionally excluded

The component tree also contains hooks, controllers, type modules, pure models, formatters, and accessibility helpers. They are not UI components and should stay separate: examples include `useCalendarTimelineController`, `useTrainingPlanBuilderController`, activity-plan selection/process hooks, training-path presentation/layout modules, recording cockpit models, and onboarding data/recovery helpers. Moving them into TSX components would increase—not reduce—complexity.

## Immediate reduction backlog

| Priority | Change | Evidence | Safe replacement / stop condition |
|---|---|---|---|
| 1 | Remove `plan/GhostCard.tsx`. | It has no production or test import outside its own definition. | Delete it and add no replacement. Stop if route/dynamic import inspection finds a consumer. |
| 2 | Standardize `GroupEmptyState` and `GroupEventEmptyState` on `ScreenState` where their visual treatment can match. | They are ordinary empty-state variants; `ScreenState` already owns loading, empty, and error behavior. | Add feature copy/icon/action props at call sites, retaining `GroupMembersOnlyLockedState` because it expresses authorization. Stop if card-versus-page placement needs materially different layout. Keep `FeedEmptyState` separate until a shared state contract can preserve its two CTAs, accessibility labels, and test IDs. |
| 3 | Replace or relocate `PlanningInputFieldRow`. | It is a 40-line label/supporting-copy/clear-action wrapper used only by `BuilderFieldList`; `ClearFieldAction` and shared form wrappers already cover part of its role. | Inline into `BuilderFieldList` if it remains single-use; otherwise create a narrowly named shared field-layout primitive. Stop before changing form semantics. |
| 4 | Keep `GoalAgendaCard` calendar-local but rebase it on `ResourceCardPrimitives` only if goal cards need a common presentation. | It is single-consumer (`calendar-day`) and intentionally calls out a timeline anchor. | Preserve calendar-specific wording and test ID. Do not turn it into a generic goal card without a second use. |
| 5 | Treat `CollapsibleSection` as feature-local until another feature uses the exact interaction. | No production consumer was found beyond its barrel; its unit test alone does not establish reuse. | Remove it only after confirming no route import; otherwise keep it in trends. Do not promote a single-use abstraction to `@repo/ui`. |
| 6 | Keep `LayoutPrimitives` app-local for now. | `ScreenSection` and `InlineNotice` have active group/calendar consumers, while `SettingsRow` currently has no detected consumer. | Remove `SettingsRow` after a focused reference check; retain the other two until more features share the contract. |

## Guardrails that will actually lower the count

- Start each new screen with its own layout. Extract only after a second real consumer appears or when the unit owns interaction/state.
- Add a canonical card only for a user-facing entity used in browsing, selection, or linked content. Reuse it everywhere else.
- Add no new modal, sheet, picker, list, search, loading, empty, error, header-action, or card-shell component before checking the canonical layer.
- Keep forms local to their workflow. Share semantic inputs through `@repo/ui`, not whole feature forms.
- Keep all recording UI under `components/recording`; it has runtime constraints that ordinary UI primitives should not absorb.
- Move a primitive to `@repo/ui` only when it is genuinely cross-surface (web and native) and has a stable public contract. A mobile-only reuse belongs in `components/shared`.

## Audit method and limits

- Inspected all production TSX modules under `apps/mobile/components` (202 files), their component barrels, representative implementations, mobile route consumers, and `@repo/ui` imports.
- Excluded tests, mocks, fixtures, pure TS support modules, and route files from the count. The module count includes multi-export TSX files and a small number of TSX hooks/controllers.
- Confirmed that `GhostCard` has no textual consumer; confirmed `MobileCardPreviewSurface` is used by the Storybook route; confirmed `GoalListItem`, `GoalAgendaCard`, `PlanningInputFieldRow`, and group empty states have active consumers.
- Textual references do not prove runtime reachability through all dynamic composition. Before deleting any candidate, run a targeted typecheck/test and inspect route/barrel imports.
