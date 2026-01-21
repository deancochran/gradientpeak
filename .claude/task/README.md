# Task Context Management System

This directory manages active task context using a file-based orchestration system that enables persistent, scalable agent collaboration without token consumption concerns.

## 🎯 Purpose

**File-Based Context Management** ensures:
- Agent outputs persist across conversation boundaries
- Context survives session restarts
- Multiple agents access shared project state
- Token limits never constrain information availability
- Complete audit trail of all agent actions

## 📂 Directory Structure

```
.claude/task/
├── active/           # Currently active task contexts
│   └── [task-id]/   # One directory per active task
│       ├── MASTER_CONTEXT.md        # Central task specification & status
│       ├── architecture-findings.md  # Architecture Expert outputs
│       ├── technology-findings.md    # Technology Expert outputs
│       ├── quality-findings.md       # QA Advisor outputs
│       ├── integration-findings.md   # Integration Analyst outputs
│       ├── performance-findings.md   # Performance Specialist outputs
│       └── documentation-findings.md # Documentation Strategist outputs
├── completed/       # Archived completed tasks
└── templates/       # Standard templates for task files
```

## 🔄 Agent Workflow Protocol

### **DELEGATING AGENT** - Task Initialization

When receiving a complex task from Primary Interface:

**1. Create Task Context**
```bash
Task ID: [unique-id] (e.g., "strava-integration-2026-01-21")
Directory: .claude/task/active/[task-id]/
```

**2. Create MASTER_CONTEXT.md**
- Project objectives
- Specifications
- Requirements
- Constraints
- Success criteria
- Agent assignments
- Status tracking

**3. Spawn Research Agents**
- Assign specific agents to domains
- Each agent reads MASTER_CONTEXT.md before starting
- Each agent updates MASTER_CONTEXT.md after completing

**4. Monitor & Coordinate**
- Track agent completion via MASTER_CONTEXT.md status
- Synthesize findings from agent-specific files
- Update master context with consolidated decisions

**5. Execute Implementation**
- Follow recommendations from research findings
- Update MASTER_CONTEXT.md with implementation progress
- Reference findings files during execution

**6. Archive on Completion**
```bash
mv .claude/task/active/[task-id] .claude/task/completed/[task-id]
```

### **RESEARCH AGENTS** - Task Execution

**Before Starting Work:**
1. **Read MASTER_CONTEXT.md** in task directory
2. Understand project objectives, constraints, specifications
3. Identify your assigned research domain

**During Research:**
1. Investigate assigned domain
2. Create findings in `[domain]-findings.md`
3. Follow standard research template
4. Document all analysis, options, recommendations

**After Completing Research:**
1. **Update MASTER_CONTEXT.md** with:
   - Your status (Research Complete)
   - Summary of findings
   - Key recommendations
   - Link to your detailed findings file
2. Save detailed research to `.claude/research/[domain]/` for long-term reference
3. Report completion to Delegating Agent

### **EXECUTION AGENTS** - Implementation

**Primary Interface & Delegating Agents:**

**Before Implementation:**
1. Read MASTER_CONTEXT.md for project overview
2. Read all completed research findings files
3. Synthesize recommendations

**During Implementation:**
1. Update MASTER_CONTEXT.md with implementation progress
2. Reference findings files for guidance
3. Document key decisions

**After Implementation:**
1. Update MASTER_CONTEXT.md with completion status
2. Add implementation notes
3. Archive task context to completed/

## 📋 MASTER_CONTEXT.md Template

Location: `.claude/task/templates/MASTER_CONTEXT_TEMPLATE.md`

Every task has a master context file as the single source of truth.

**Structure:**
```markdown
# [Task Name] - Master Context

**Task ID**: [unique-id]
**Created**: YYYY-MM-DD HH:MM
**Status**: Planning | Research | Implementation | Testing | Complete
**Priority**: High | Medium | Low

## Executive Summary
[1-2 sentence overview of the task]

## Objectives
- [ ] Primary objective 1
- [ ] Primary objective 2
- [ ] Primary objective 3

## Specifications
### Functional Requirements
- Requirement 1
- Requirement 2

### Non-Functional Requirements
- Performance: [targets]
- Compatibility: [versions]
- Security: [considerations]

### Constraints
- Must comply with GradientPeak architectural rules
- Core package must remain database-independent
- Mobile: All Text components must be styled
- [Additional constraints]

## Agent Assignments

### Architecture Research Expert
- **Status**: Not Started | In Progress | Complete
- **Assigned**: YYYY-MM-DD
- **Completed**: YYYY-MM-DD
- **Output File**: architecture-findings.md
- **Summary**: [1-2 sentence summary after completion]
- **Key Recommendation**: [Primary recommendation]

### Technology Research Expert
- **Status**: Not Started | In Progress | Complete
- **Output File**: technology-findings.md
- **Summary**: [Summary]

### Quality Assurance Advisor
- **Status**: Not Started | In Progress | Complete
- **Output File**: quality-findings.md
- **Summary**: [Summary]

### Integration Analyst
- **Status**: Not Started | In Progress | Complete
- **Output File**: integration-findings.md
- **Summary**: [Summary]

### Performance Specialist
- **Status**: Not Started | In Progress | Complete
- **Output File**: performance-findings.md
- **Summary**: [Summary]

### Documentation Strategist
- **Status**: Not Started | In Progress | Complete
- **Output File**: documentation-findings.md
- **Summary**: [Summary]

## Research Synthesis
[Delegating Agent fills this after all research complete]

### Consolidated Recommendations
1. [Recommendation from synthesis]
2. [Recommendation from synthesis]

### Implementation Strategy
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Identified Risks
- **Risk 1**: [Description] → Mitigation: [Strategy]
- **Risk 2**: [Description] → Mitigation: [Strategy]

## Implementation Progress

### Phase 1: [Name]
- **Status**: Not Started | In Progress | Complete
- **Files Changed**:
  - apps/mobile/...
  - packages/core/...
- **Notes**: [Implementation notes]

### Phase 2: [Name]
- **Status**: Not Started | In Progress | Complete
- **Files Changed**: [List]
- **Notes**: [Notes]

## Testing Status
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Manual testing complete
- [ ] Coverage target met (X%)

## Documentation Status
- [ ] Code documented (JSDoc)
- [ ] README updated
- [ ] API documentation updated
- [ ] User guide created (if applicable)

## Completion Checklist
- [ ] All objectives met
- [ ] All agent research complete
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation complete
- [ ] Code reviewed
- [ ] User approved

## Timeline
- **Created**: YYYY-MM-DD HH:MM
- **Research Started**: YYYY-MM-DD HH:MM
- **Research Completed**: YYYY-MM-DD HH:MM
- **Implementation Started**: YYYY-MM-DD HH:MM
- **Implementation Completed**: YYYY-MM-DD HH:MM
- **Total Duration**: X hours/days

## References
- Related Research: [Links to .claude/research/ docs]
- Related Tasks: [Links to other task contexts]
- External Documentation: [Links]
- GradientPeak Rules: [Relevant rules from .claude/rules/]

## Change Log
### YYYY-MM-DD HH:MM - [Agent Name]
[Description of change to master context]

### YYYY-MM-DD HH:MM - [Agent Name]
[Description of change]
```

## 🔍 Finding Task Context

### Current Active Tasks
```bash
ls .claude/task/active/
```

### Specific Task
```bash
cat .claude/task/active/[task-id]/MASTER_CONTEXT.md
```

### Completed Tasks
```bash
ls .claude/task/completed/
cat .claude/task/completed/[task-id]/MASTER_CONTEXT.md
```

## 🎯 Benefits of File-Based Context

### 1. **No Token Consumption**
- Context stored in files, not conversation history
- Unlimited information retention
- Access past context without token cost

### 2. **Session Persistence**
- Task state survives conversation restarts
- Work continues seamlessly across sessions
- No context loss on session boundaries

### 3. **Parallel Agent Coordination**
- Multiple agents update shared context
- No race conditions (file-based locking)
- Clear communication channel

### 4. **Complete Audit Trail**
- Every agent action documented
- Timeline preserved
- Decision rationale captured

### 5. **Scalability**
- Add more agents without context bloat
- Task complexity doesn't impact token usage
- Historical context always accessible

## 📊 Task Lifecycle

```
1. USER REQUEST
   ↓
2. PRIMARY INTERFACE recognizes complexity
   ↓
3. DELEGATING AGENT creates task context
   - Creates .claude/task/active/[task-id]/
   - Creates MASTER_CONTEXT.md
   ↓
4. DELEGATING spawns RESEARCH AGENTS
   - Each reads MASTER_CONTEXT.md
   - Each creates [domain]-findings.md
   - Each updates MASTER_CONTEXT.md on completion
   ↓
5. DELEGATING synthesizes findings
   - Reads all findings files
   - Updates MASTER_CONTEXT.md with synthesis
   ↓
6. DELEGATING executes implementation
   - Follows research recommendations
   - Updates MASTER_CONTEXT.md with progress
   ↓
7. DELEGATING archives task
   - Moves to .claude/task/completed/
   ↓
8. PRIMARY INTERFACE reports to USER
```

## 🛠️ Agent-Specific Output Files

### architecture-findings.md
- Component placement recommendations
- Service boundary designs
- State management strategies
- Dependency analysis
- References: .claude/research/architecture/ for detailed ADRs

### technology-findings.md
- Library comparisons
- Technology recommendations
- Integration patterns
- Version compatibility
- References: .claude/research/technology/ for detailed analysis

### quality-findings.md
- Test strategy
- Coverage requirements
- Edge case analysis
- Acceptance criteria
- References: .claude/research/quality/ for detailed test specs

### integration-findings.md
- API integration plans
- OAuth flow designs
- Data mapping specifications
- Sync strategies
- References: .claude/research/integration/ for detailed blueprints

### performance-findings.md
- Bottleneck analysis
- Optimization recommendations
- Benchmarking results
- Caching strategies
- References: .claude/research/performance/ for detailed audits

### documentation-findings.md
- Documentation structure
- JSDoc requirements
- Content outlines
- Example specifications
- References: .claude/research/documentation/ for detailed plans

## ⚠️ Critical Protocols

### For Delegating Agent
1. ✅ **ALWAYS create task context** for multi-agent coordination
2. ✅ **ALWAYS create MASTER_CONTEXT.md** first
3. ✅ **ALWAYS assign agents** in master context
4. ✅ **ALWAYS wait** for agents to update status before synthesis
5. ✅ **ALWAYS archive** completed tasks

### For Research Agents
1. ✅ **ALWAYS read MASTER_CONTEXT.md** before starting
2. ✅ **ALWAYS create findings file** in task directory
3. ✅ **ALWAYS update MASTER_CONTEXT.md** after completion
4. ✅ **ALWAYS save detailed research** to .claude/research/
5. ❌ **NEVER execute code** - research only

### For Execution Agents
1. ✅ **ALWAYS read MASTER_CONTEXT.md** before implementing
2. ✅ **ALWAYS read all findings files** before executing
3. ✅ **ALWAYS update MASTER_CONTEXT.md** with progress
4. ✅ **ALWAYS reference findings** during implementation
5. ✅ **ALWAYS validate** against research specifications

## 📚 Integration Points

**With Research System:**
- Task-specific findings in `.claude/task/active/[task-id]/`
- Long-term research in `.claude/research/[domain]/`
- Research index references task contexts

**With Agent Hierarchy:**
- Defined in `.claude/rules/agent-hierarchy.md`
- File-based context enables the hierarchy
- Access control enforced through protocols

**With GradientPeak Rules:**
- All agents follow `.claude/rules/` standards
- Master context references applicable rules
- Findings validate against architectural principles

---

**Last Updated**: 2026-01-21
**System Status**: ✅ Production Ready
