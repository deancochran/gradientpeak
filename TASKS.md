# TurboFit Task List

---

##  In Progress




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
  * [ ] `apps/mobile/src/routes/(internal)/planned_activities.tsx` - Planned activities browser
  * [ ] Show both completed and incomplete planned activities
  * [ ] Add filtering by status, difficulty, and type
  * [ ] Include progress tracking indicators

* [ ] **Planned Activity Detail View**
  * [ ] `apps/mobile/src/routes/(internal)/planned_activity-detail.tsx` - Structured activity viewer
  * [ ] Migrate functionality from `PlannedActivityModal.tsx`
  * [ ] Render step-by-step plan structure with intervals
  * [ ] Display intensity targets and duration estimates
  * [ ] Add start activity navigation integration
