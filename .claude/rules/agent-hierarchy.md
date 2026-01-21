# Multi-Agent System: Research-Focused Expert Network

## Overview

A structured network of specialized research agents that provide expert analysis and recommendations. Research agents investigate and advise while execution agents (Primary Interface & Delegating) implement based on findings.

**Core Philosophy**: Agents are consultants—they research, analyze, and recommend. Execution agents coordinate implementation based on expert findings.

## File-Based Knowledge Management

### Research Storage (`.claude/research/`)
```
.claude/research/
├── architecture/     # System design, architectural decisions
├── technology/       # Library research, API analysis
├── quality/          # Testing strategies, QA recommendations
├── integration/      # Third-party API integration plans
├── performance/      # Optimization recommendations
├── documentation/    # Documentation plans and strategies
└── index.md         # Master index of all research
```

### Task Context (`.claude/task/`)
```
.claude/task/
├── active/[task-id]/
│   ├── MASTER_CONTEXT.md           # Central task specification (single source of truth)
│   ├── architecture-findings.md    # Domain-specific findings
│   ├── technology-findings.md
│   ├── quality-findings.md
│   └── ...
├── completed/                       # Archived finished tasks
└── templates/                       # Standard templates
```

**Benefits**:
- Context persists across sessions
- No token consumption for context retrieval
- Parallel agent coordination through shared files
- Complete audit trail
- Reusable research across tasks

## Agent Hierarchy

### Tier 1: Executive
- **User**: Project sponsor, decision maker, communicates only with Primary Interface

### Tier 2: Execution & Coordination
- **Primary Interface Agent**: Client liaison + primary executor. Handles simple tasks directly, commissions research for complex tasks, executes implementations
- **Delegating Agent**: Research director + complex executor. Coordinates multiple research streams, synthesizes findings, executes multi-phase implementations

### Tier 3: Research & Advisory (7 Specialists)
1. **Architecture Research Expert** - System design, patterns, component placement
2. **Technology Research Expert** - Library selection, API analysis, feasibility
3. **Quality Assurance Advisor** - Testing strategies, coverage, edge cases
4. **Integration Analyst** - Third-party APIs, OAuth, data sync
5. **Performance Specialist** - Bottleneck identification, optimization
6. **Documentation Strategist** - Documentation planning, structure
7. **Skill Creator Agent** - Pattern extraction, convention documentation

## Universal Research Agent Constraints

All Tier 3 research agents:
- ❌ **No code execution** (Edit, Write, NotebookEdit prohibited)
- ✅ **Research only** (Glob, Grep, Read, WebFetch, WebSearch, Context7)
- ✅ **Read MASTER_CONTEXT.md** before starting
- ✅ **Create findings file** in task directory
- ✅ **Update MASTER_CONTEXT.md** after completion
- ✅ **Save detailed research** to `.claude/research/[domain]/`
- ✅ **Update research index**
- ✅ **Provide actionable recommendations** (not just information)

## Research Agent Protocol

### 1. Before Starting
- Read `.claude/task/active/[task-id]/MASTER_CONTEXT.md`
- Understand task objectives, specifications, constraints
- Identify your assigned research domain

### 2. During Research
- Use research tools only (Glob, Grep, Read, WebFetch, WebSearch, Context7)
- Follow domain-specific standard template
- Document analysis, options, recommendations with rationale

### 3. After Completion
- Create findings file: `.claude/task/active/[task-id]/[domain]-findings.md`
- Update MASTER_CONTEXT.md:
  - Change status to "Complete"
  - Add summary (1-2 sentences)
  - Add key recommendation
  - Add link to detailed research
- Save detailed research: `.claude/research/[domain]/YYYY-MM-DD_topic.md`
- Update research index
- Report completion to Delegating Agent

## Research Templates (Standard Structure)

All research documents follow this structure:

```markdown
# [Topic] Analysis/Plan/Report
**Date**: YYYY-MM-DD
**Agent**: [Agent Name]
**Status**: Draft | Final

## Executive Summary
[1-2 sentence key finding/recommendation]

## [Domain-Specific Analysis Sections]
### Current State
[What exists now]

### Proposed Solution/Findings
[Recommendations with rationale]

## Options/Strategies (if applicable)
### Option 1: [Name]
- **Pros**: [List]
- **Cons**: [List]
- **Effort**: Low | Medium | High

## Code Examples (if applicable)
```[language]
// Example implementation patterns
```

## Risks & Mitigation
[Identify potential issues and solutions]

## Implementation Checklist
- [ ] Task 1
- [ ] Task 2

## References
[Links to docs, rules, related research]
```

**Domain-Specific Sections**:
- **Architecture**: Component Placement, Design Patterns, Dependencies
- **Technology**: Compatibility Assessment, Bundle Size, Integration Strategy
- **Quality**: Testing Scope, Coverage Requirements, Test Cases, Edge Cases
- **Integration**: Authentication Flow, API Endpoints, Data Mapping, Error Handling
- **Performance**: Performance Profile, Bottlenecks, Optimization Strategies, Benchmarking
- **Documentation**: Documentation Scope, Content Structure, JSDoc Requirements

## Execution Agent Workflows

### Primary Interface Agent
```
1. Receive user request
2. Assess complexity:
   - Simple → Execute directly
   - Complex → Commission research OR delegate to Delegating Agent
3. If research commissioned:
   - Spawn research agent(s)
   - Review findings from .claude/research/
4. Execute implementation based on research
5. Validate against research guidelines
6. Present results to user
```

### Delegating Agent
```
1. Receive complex task from Primary Interface
2. Create task context directory
3. Create MASTER_CONTEXT.md with:
   - Task objectives & specifications
   - Constraints & requirements
   - Agent assignments
   - Status tracking
4. Spawn research agents in parallel
5. Monitor progress via MASTER_CONTEXT.md
6. Synthesize findings from all agents
7. Update MASTER_CONTEXT.md with synthesis
8. Execute implementation in phases
9. Update MASTER_CONTEXT.md with progress
10. Validate against research
11. Archive task context to completed/
12. Report to Primary Interface
```

## Access Control Matrix

| Agent | Code Execution | Research Tools | Research R/W | Spawn Agents | User Access |
|-------|---------------|---------------|--------------|--------------|-------------|
| User | - | - | - | ✅ Primary | - |
| Primary Interface | ✅ Full | ✅ | ✅ | ✅ Delegating | ✅ |
| Delegating | ✅ Full | ✅ | ✅ | ✅ Research | ❌ |
| Research Agents (7) | ❌ | ✅ | ✅ | ❌ | ❌ |

## Workflow Examples

### Simple Task (No Research)
```
User: "Fix TypeScript error in ActivityCard"
→ Primary Interface:
  1. Read file
  2. Fix error directly
  3. Test
  4. Report to user
```

### Medium Complexity (Single Research Agent)
```
User: "Add FIT file parsing"
→ Primary Interface → Technology Expert:
  1. Research FIT parser libraries
  2. Save findings to .claude/research/technology/
→ Primary Interface:
  1. Read research
  2. Implement recommended library
  3. Test
  4. Report to user
```

### Complex Multi-Domain Task
```
User: "Implement Strava integration"
→ Primary Interface → Delegating Agent:
  1. Create .claude/task/active/strava-integration-[date]/
  2. Create MASTER_CONTEXT.md
  3. Spawn 5 research agents in parallel:
     - Architecture Expert → architecture-findings.md
     - Technology Expert → technology-findings.md
     - Integration Analyst → integration-findings.md
     - QA Advisor → quality-findings.md
     - Documentation Strategist → documentation-findings.md
  4. Each agent:
     - Reads MASTER_CONTEXT.md
     - Researches assigned domain
     - Writes findings file
     - Updates MASTER_CONTEXT.md status
     - Saves detailed research to .claude/research/
  5. Delegating Agent:
     - Reads all findings
     - Synthesizes recommendations
     - Updates MASTER_CONTEXT.md with synthesis
     - Executes implementation in phases
     - Updates MASTER_CONTEXT.md with progress
     - Archives task context
→ Primary Interface → User:
  "Integration complete. Research saved to .claude/research/"
```

## When to Use Research

**Trigger research for**:
- New technology/library selection
- Third-party service integrations
- Architectural decisions
- Performance optimization
- Complex testing strategies
- Documentation planning

**Direct execution (no research)**:
- Bug fixes
- Minor updates
- Obvious implementations
- Style tweaks

## Critical Rules

### For Delegating Agent
1. ✅ CREATE task context directory for multi-agent coordination
2. ✅ CREATE MASTER_CONTEXT.md before spawning agents
3. ✅ MONITOR progress via MASTER_CONTEXT.md
4. ✅ SYNTHESIZE findings before implementation
5. ✅ UPDATE MASTER_CONTEXT.md throughout process
6. ✅ ARCHIVE completed tasks
7. ❌ NEVER proceed without reading context files

### For Research Agents
1. ❌ NEVER use Edit, Write, NotebookEdit
2. ✅ READ MASTER_CONTEXT.md before starting
3. ✅ CREATE findings file in task directory
4. ✅ UPDATE MASTER_CONTEXT.md after completion
5. ✅ SAVE detailed research to long-term storage
6. ✅ UPDATE research index
7. ✅ PROVIDE actionable recommendations (not info dumps)

### For Execution Agents
1. ✅ READ research before implementing
2. ✅ FOLLOW research recommendations
3. ✅ UPDATE task context with progress
4. ✅ VALIDATE against research specs
5. ✅ COMMISSION research for complex/unfamiliar domains
6. ❌ DON'T skip research when warranted

### For All Agents
1. ✅ Follow GradientPeak architectural rules (`.claude/rules/`)
2. ✅ Maintain communication boundaries per hierarchy
3. ✅ Use TodoWrite for progress tracking
4. ✅ Document all decisions

## Integration with GradientPeak Rules

All agents must comply with:
- `monorepo-structure.md` - Package organization
- `core-package.md` - Database independence
- `mobile-development.md` - Mobile patterns
- `web-development.md` - Next.js patterns
- `typescript-standards.md` - Type safety
- `testing-requirements.md` - Test coverage
- `documentation-standards.md` - Doc formats
- `git-workflow.md` - Version control

Research agents should reference these rules in recommendations.

## Success Metrics

**Quality Research**:
- ✅ Clear recommendations (not just information)
- ✅ Actionable implementation steps
- ✅ Risk identification with mitigation
- ✅ Code examples and patterns
- ✅ References to authoritative sources
- ✅ Alignment with GradientPeak principles

**Successful Execution**:
- ✅ Working implementation matching research specs
- ✅ Validated against research recommendations
- ✅ Documented decisions traceable to research
- ✅ Tests covering scenarios from QA research
- ✅ Documentation following strategist plan

## Benefits

1. **Reduced Token Consumption** - Research saved to files, not context
2. **Persistent Knowledge Base** - Findings reusable across sessions
3. **Better Decisions** - Multiple expert perspectives synthesized
4. **Clear Separation** - Research distinct from execution
5. **Audit Trail** - Complete traceability from requirement to implementation
