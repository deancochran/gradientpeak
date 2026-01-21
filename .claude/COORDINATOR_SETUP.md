# Coordinator Agent Setup for GradientPeak

## Overview

The coordinator agent system has been configured for GradientPeak to enable intelligent task orchestration and parallel agent execution.

## Configuration Status

### ✅ Coordinator Agent Created
- **Location**: `.claude/agents/coordinator.md`
- **Role**: Research Director & Implementation Orchestrator
- **Capabilities**:
  - Analyzes task complexity
  - Commissions specialized research agents
  - Synthesizes findings
  - Executes implementations
  - Manages parallel workflows

### ✅ Permissions Configured
- **File**: `.claude/settings.local.json`
- **Task Permission**: Enabled (allows spawning agents)
- **Parallel Execution**: Supported via Task tool

## How Parallel Agent Execution Works in Claude Code

### Using the Task Tool for Parallel Execution

Claude Code supports parallel agent execution through the **Task tool**. The coordinator agent can spawn multiple agents in a **single message with multiple tool calls**:

```
Example: Spawning 5 research agents in parallel for a complex feature

COORDINATOR sends single message with 5 Task tool calls:
  - Task 1: Architecture Expert
  - Task 2: Technology Expert
  - Task 3: Integration Analyst
  - Task 4: QA Advisor
  - Task 5: Documentation Strategist

All 5 agents run concurrently, each reading MASTER_CONTEXT.md for context
and writing findings to their domain files.
```

**Key Principles:**
1. **Single Message**: All Task tool calls must be in one message
2. **Concurrent Execution**: Claude Code runs them in parallel automatically
3. **File-Based Context**: Agents coordinate via `.claude/task/active/[task-id]/` directory
4. **No Token Consumption**: Context shared through files, not conversation

### Maximum Concurrent Agents

Based on Claude Code's architecture, you can run **6-8 agents concurrently** without performance degradation. The coordinator agent is configured to manage up to 6 parallel agents.

## Available Agents

### Research Agents (Read-Only, No Code Execution)
These agents analyze and recommend but don't write code:

1. **Architecture Expert** - System design, component placement
2. **Technology Expert** - Library selection, API analysis (uses Context7)
3. **QA Advisor** - Testing strategies, coverage requirements
4. **Integration Analyst** - Third-party APIs, OAuth flows
5. **Performance Specialist** - Bottleneck identification, optimization
6. **Documentation Strategist** - Documentation planning, JSDoc specs
7. **Skill Creator Agent** - Pattern extraction, skill file generation

### Implementation Agents (Full Code Execution)
These agents write code following research recommendations:

1. **mobile-component-generator** - React Native components
2. **web-page-generator** - Next.js pages with proper Server/Client split
3. **trpc-router-generator** - tRPC routers with validation
4. **database-migration-assistant** - Supabase migrations
5. **api-integration-assistant** - Third-party integrations
6. **code-improvement-reviewer** - Code quality analysis
7. **performance-optimizer** - Performance improvements
8. **accessibility-auditor** - WCAG compliance
9. **core-logic-assistant** - Pure function development in @repo/core

## Workflow Example: Complex Feature Implementation

### Scenario: "Implement Strava integration with activity sync"

**Phase 1: Research (Parallel)**
```
Coordinator spawns 5 research agents in parallel:

  1. Architecture Expert → Designs integration architecture
  2. Technology Expert → Analyzes Strava API v3
  3. Integration Analyst → Designs OAuth 2.0 flow
  4. QA Advisor → Defines testing strategy
  5. Documentation Strategist → Plans user documentation

All agents read MASTER_CONTEXT.md for context.
All agents write findings to their domain files.
All agents update MASTER_CONTEXT.md with status.
```

**Phase 2: Synthesis**
```
Coordinator:
  1. Reads all findings from task directory
  2. Synthesizes recommendations
  3. Updates MASTER_CONTEXT.md with implementation strategy
  4. Reads relevant skills (backend-skill.md, web-frontend-skill.md)
```

**Phase 3: Implementation (Sequential or Parallel)**
```
Coordinator either:
  - Implements directly following research + skills
  - Spawns implementation agents if work can be parallelized:
    * mobile-component-generator for mobile UI
    * web-page-generator for web UI
    * trpc-router-generator for API endpoints
```

**Phase 4: Validation**
```
Coordinator:
  1. Validates against research specs
  2. Runs tests per QA recommendations
  3. Creates documentation per strategist plan
  4. Archives task context to completed/
```

## Skills Integration

Before any implementation, the coordinator automatically reads relevant skill files:

- **Mobile work** → `mobile-frontend-skill.md`
- **Web work** → `web-frontend-skill.md`
- **Backend work** → `backend-skill.md`
- **Core package** → `core-package-skill.md`
- **Testing** → `testing-skill.md`
- **Documentation** → `documentation-skill.md`

This ensures all implementations follow established patterns.

## File-Based Context Management

### Task Context Directory Structure
```
.claude/task/
├── active/
│   └── strava-integration-2026-01-21/
│       ├── MASTER_CONTEXT.md           # Central coordination file
│       ├── architecture-findings.md     # Architecture Expert output
│       ├── technology-findings.md       # Technology Expert output
│       ├── integration-findings.md      # Integration Analyst output
│       ├── quality-findings.md          # QA Advisor output
│       └── documentation-findings.md    # Documentation Strategist output
└── completed/
    └── [archived tasks]
```

### Research Storage
```
.claude/research/
├── architecture/
├── technology/
├── quality/
├── integration/
├── performance/
├── documentation/
└── index.md  # Master research index
```

## Benefits of This Approach

### 1. **Intelligent Orchestration**
- Coordinator analyzes task complexity
- Commissions only needed agents
- Runs research in parallel when beneficial
- Synthesizes multi-domain findings

### 2. **Reduced Token Consumption**
- Context shared via files, not conversation
- Research findings persist across sessions
- No redundant API calls for same information
- Reusable research saves future tokens

### 3. **Better Decision Making**
- Multiple expert perspectives
- Risks identified before coding
- Traceable decision trail
- Validation against research

### 4. **Consistent Quality**
- Skills enforce project patterns
- Research provides expert guidance
- Validation against specifications
- Complete audit trail

### 5. **Persistent Knowledge**
- Research accumulates over time
- Institutional memory across sessions
- Future agents reference past work
- No knowledge loss

## How to Use the Coordinator

The coordinator agent is **not currently set as default** in Claude Code (the configuration schema doesn't support this yet). However, you can invoke it explicitly:

### Method 1: Direct Invocation (Future Feature)
```
Once Claude Code supports default agents:
- All requests automatically go to coordinator
- Coordinator decides when to spawn sub-agents
- Automatic parallel execution when beneficial
```

### Method 2: Explicit Invocation (Current Method)
```
You (Primary Interface) can explicitly spawn the coordinator for complex tasks:

User: "Implement Strava integration"

Primary Interface: "This is complex, let me spawn the coordinator"
[Spawns coordinator via Task tool]

Coordinator: [Analyzes, commissions research, implements]
```

### Method 3: Manual Coordination (Current Best Practice)
```
You can follow the coordinator's workflow manually:
1. Identify complex multi-domain task
2. Spawn research agents in parallel
3. Synthesize findings
4. Read relevant skills
5. Implement following research + skills
6. Validate and document
```

## Configuration Files

### Current Configuration
- **Coordinator Agent**: `.claude/agents/coordinator.md` ✅
- **Permissions**: `.claude/settings.local.json` (Task enabled) ✅
- **Skills System**: `.claude/skills/` (6 skill files) ✅
- **Agent Hierarchy**: `.claude/rules/agent-hierarchy.md` (updated) ✅

### Future Enhancement Opportunities
When Claude Code supports agent configuration:
- Set coordinator as default agent
- Configure max concurrent agents
- Define agent routing rules
- Enable automatic parallelization

## Next Steps

1. **Test the coordinator agent** - Try a complex implementation task
2. **Use parallel research** - Spawn multiple research agents in single message
3. **Validate against skills** - Ensure implementations follow patterns
4. **Build knowledge base** - Accumulate research in `.claude/research/`
5. **Refine workflows** - Improve coordinator prompts based on experience

---

**The coordinator system is ready!** Complex tasks can now leverage parallel research, expert synthesis, and skill-guided implementation for higher quality outcomes.
