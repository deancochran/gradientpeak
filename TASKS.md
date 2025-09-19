# TurboFit Task List

---

##  In Progress

* [x] **Mobile Auth Simplification**
  * [x] Remove duplicate AuthProvider implementation
  * [x] Create simplified useAuth hook with tRPC reactivity
  * [x] Add navigation auth hooks for route protection
  * [x] Ensure single source of truth for authentication state
  * [x] Maintain Zustand persistence with tRPC real-time updates

* [x] **Unified Auth Store Implementation**
  * [x] Update Zustand store to combine Supabase user + tRPC profile data
  * [x] Add profile field with proper typing from Postgres schema
  * [x] Implement refreshProfile method using tRPC query
  * [x] Update initialize method to fetch profile on auth state change
  * [x] Add proper error handling and loading states
  * [x] Update persistence to include both user and profile data
  * [x] Create combined useAuthProfile hook for easy access
  * [x] Ensure type safety with Supabase User and Profile types

---

##  High Priority




---

##  High Priority

* [ ] **Mobile App Configuration**
* [ ] **Web App Configuration**
* [ ] **Shared Package Configuration**
* [ ] **Update Documentation**
* [ ] **Update Apps Documentation**
* [ ] **Update Packages Documentation**
* [ ] **Update AI Agent rules Documentation**
---

##  Medium Priority

---

##  Low Priority

* [ ] **Trends & Analytics**
  * [ ] Charts: zone distribution, performance curves
  * [ ] Comparison charts (week/week, year/year)
  * [ ] Interactive drill-down features
  * [ ] Advanced analytics (fitness progression, recovery, predictions)

* [ ] **Training Plan Infrastructure**
  * [ ] Plan templates (beginner/intermediate/advanced)
  * [ ] Plan assignment to users
  * [ ] Plan scheduling & periodization
  * [ ] Replace mock planned activities with real queries
  * [ ] Display plan progress/completion

* [ ] **Structured Activity Support**
  * [ ] Activity step guidance (intervals, rest, zones)
  * [ ] Progress tracking within recording
  * [ ] Step completion validation
  * [ ] Plan adherence scoring
  * [ ] Activity effectiveness analysis
  * [ ] Adaptive plan recommendations

* [ ] **Activity Library**
  * [ ] Standard activity structures
  * [ ] Schema validation via `@repo/core`
  * [ ] Intensity targets (HR, power zones)
  * [ ] Duration & TSS estimation

* [ ] **Planned Activities Listing**
  * [ ] `apps/mobile/src/app/(internal)/planned_activities.tsx` - Planned activities browser
  * [ ] Show both completed and incomplete planned activities
  * [ ] Add filtering by status, difficulty, and type
  * [ ] Include progress tracking indicators

* [ ] **Planned Activity Detail View**
  * [ ] `apps/mobile/src/app/(internal)/planned_activity-detail.tsx` - Structured activity viewer
  * [ ] Migrate functionality from `PlannedActivityModal.tsx`
  * [ ] Render step-by-step plan structure with intervals
  * [ ] Display intensity targets and duration estimates
  * [ ] Add start activity navigation integration
