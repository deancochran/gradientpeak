### [20260304-120000] Social Network Enhancements

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Phase 1: Database & Types
  - [x] Phase 2: Backend Logic
  - [x] Phase 3: Mobile Frontend
  - [x] Phase 4: Web Frontend
- **Blockers**: None

---

### [20260304-150000] Search Tab Enhancement

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Phase 1: Backend (tRPC procedures)
    - [x] Create searchUsers procedure
    - [x] Add search to activityPlans.list
    - [x] Add search to trainingPlansCrud.listTemplates
    - [x] Verify/create routes search
  - [x] Phase 2: Frontend - Search Infrastructure
    - [x] Refactor discover.tsx with tabs
    - [x] Implement debounced search
    - [x] Create pagination hooks
  - [x] Phase 3: Result Components
    - [x] Create UserSearchCard (inline in discover.tsx)
    - [x] Create TrainingPlanSearchCard (inline in discover.tsx)
    - [x] Create RouteSearchCard (inline in discover.tsx)
  - [x] Phase 4: Navigation
    - [x] Wire up all entity navigations
  - [x] Phase 5: Polish & Error Handling
    - [x] Implement loading states (skeletons)
    - [x] Implement error states
    - [x] Implement empty states
    - [x] Implement pull-to-refresh
  - [x] Phase 6: Testing - type checked (pre-existing errors unrelated to this feature)
- **Blockers**: None
- **Spec Location**: `.opencode/specs/search-tab-enhancement/`

---

### [20260305-000001] Training Plan Template Library Enhancement Spec

- **Status**: completed
- **Complexity**: high
- **Subtasks**:
  - [x] Archive current active spec in `.opencode/specs/archive/`
  - [x] Research online best practices for template vs execution modeling
  - [x] Define enhanced template structure contract for rich library visuals
  - [x] Define apply-time customization payload and guardrails
  - [x] Create new spec docs (`design.md`, `plan.md`, `tasks.md`)
- **Blockers**: None
- **Spec Location**: `.opencode/specs/2026-03-05_training-plan-template-library-enhancement/`
