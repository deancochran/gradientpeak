# GradientPeak OpenCode Agents

Specialized agents for different aspects of GradientPeak development. Each agent has deep expertise in its domain and can be invoked contextually or explicitly referenced.

## Mobile Development

### mobile-recording-assistant

Specialized agent for ActivityRecorder service development. Expert in:

- Sensor integration (BLE, GPS, FTMS devices)
- Metrics tracking and calculations
- Recording UI components (zones, charts, overlays)
- State machine debugging
- Activity plan progression

**When to use:**

- Adding new sensors or metrics to recording
- Debugging recording service issues
- Implementing plan features
- Optimizing recording performance

---

### mobile-form-assistant

Generates forms, modals, and mutations for mobile app. Expert in:

- React Hook Form + Zod validation
- Modal components with state management
- useReliableMutation pattern
- Activity selection store usage
- Error handling and success feedback

**When to use:**

- Creating forms for data entry
- Building modals with submissions
- Adding mutations to lists
- Converting to useReliableMutation pattern

---

### mobile-component-generator

Generates React Native components following GradientPeak mobile patterns.

**When to use:**

- Creating new mobile components
- Adding new screens or modals
- Building list components with data fetching
- Generating UI for features

## Web Development

### web-page-generator

Generates Next.js pages with proper patterns. Expert in:

- Server/Client component split
- tRPC query/mutation setup
- Auth protection
- Loading and error states
- Shadcn/ui component usage

**When to use:**

- Creating new pages (list, detail, form, dashboard)
- Setting up data fetching
- Adding auth-protected pages
- Implementing Next.js patterns

---

### trpc-router-generator

Generates tRPC routers with procedures. Expert in:

- CRUD procedure patterns
- Input validation with Zod
- Auth protection (public vs protected)
- Error handling and TRPC errors
- Database query optimization

**When to use:**

- Creating new API routers
- Adding procedures to existing routers
- Setting up CRUD operations
- Implementing auth-protected endpoints

## Core Package & Infrastructure

### core-logic-assistant

Maintains database-independent core package. Expert in:

- Performance calculations (TSS, zones, power)
- Zod schema creation
- Validation logic
- Utility functions
- Pure function patterns

**When to use:**

- Adding calculations for training metrics
- Creating data validation schemas
- Implementing business logic
- Adding utility functions

---

### database-migration-assistant

Manages database schema and migrations. Expert in:

- Supabase migration SQL
- TypeScript type generation
- Row Level Security policies
- Data integrity and constraints
- Schema design

**When to use:**

- Creating new tables or columns
- Updating database schema
- Adding RLS policies
- Generating TypeScript types
- Creating relationships between tables

---

### api-integration-assistant

Integrates third-party fitness APIs. Expert in:

- OAuth flows (Strava, Garmin, Wahoo)
- API client implementation
- Data sync workflows
- Rate limiting and retries
- External data mapping

**When to use:**

- Integrating new fitness platforms
- Setting up OAuth authentication
- Importing activities from external sources
- Adding webhooks
- Fixing integration issues

## Code Quality & Performance

### code-improvement-reviewer

Reviews code for improvements and optimizations. Expert in:

- Code readability
- Performance optimization
- Best practice adherence
- Security vulnerability detection
- Refactoring suggestions

**When to use:**

- Reviewing code before committing
- Identifying performance bottlenecks
- Improving code quality
- Finding potential bugs

---

### performance-optimizer

Analyzes and optimizes performance. Expert in:

- Component re-render optimization
- Database query optimization
- Bundle size reduction
- Memory leak detection
- Caching strategies

**When to use:**

- App is slow or laggy
- High memory usage
- Database queries are slow
- Bundle size too large
- Investigating performance issues

---

### accessibility-auditor

Ensures WCAG compliance and accessibility. Expert in:

- Screen reader compatibility
- Keyboard navigation
- Color contrast checking
- ARIA labels and roles
- Touch target sizes

**When to use:**

- Auditing components for accessibility
- Adding screen reader support
- Fixing keyboard navigation
- Checking color contrast
- Ensuring WCAG compliance

## Research Agents (No Code Execution)

Research agents analyze and recommend but cannot write code. Use them for complex decisions.

### architecture-research-expert

Research expert for system design and component placement decisions.

### technology-research-expert

Research expert for library selection, API analysis, and feasibility studies.

### quality-assurance-advisor

Research advisor for testing strategies and coverage requirements.

### integration-analyst

Research analyst for third-party APIs, OAuth flows, and data sync.

### performance-specialist

Research specialist for performance bottlenecks and optimization.

### documentation-strategist

Research strategist for documentation planning and JSDoc specs.

### skill-creator-agent

Agent for pattern extraction and skill file generation.

## Usage

### Contextual Invocation

Agents are automatically invoked when the context matches their expertise.

### Explicit Reference

You can explicitly reference an agent by name:

```
"Use the mobile-form-assistant to create a form for creating activities"
"Have the database-migration-assistant create a table for routes"
"Ask the performance-optimizer to review this component"
```

## Agent Capabilities

All implementation agents can:

- Read and analyze code
- Generate new code following project patterns
- Suggest improvements and optimizations
- Explain complex concepts
- Debug issues in their domain

Research agents can:

- Read and analyze code
- Research using web search and documentation
- Provide recommendations and analysis
- Document findings
- NOT write or edit code

## When to Use Which Agent

### Creating New Features

1. **Plan** with appropriate agent (mobile/web/core)
2. **Implement** with agent guidance
3. **Review** with code-improvement-reviewer
4. **Optimize** with performance-optimizer if needed
5. **Audit** with accessibility-auditor

### Fixing Bugs

1. **Identify** the domain (mobile/web/core/db)
2. **Use** corresponding agent for debugging
3. **Verify** fix with appropriate tests

### Complex Multi-Domain Tasks

1. **Commission** research agents (Coordinator handles this)
2. **Review** research findings
3. **Implement** with appropriate implementation agents
4. **Validate** against research recommendations

## Agent Development Guidelines

All agents follow:

- **Rules** in `.opencode/rules/`
- **Code standards** (TypeScript, testing, documentation)
- **Architecture patterns** (monorepo, local-first, JSON-centric)
- **Best practices** for their domain

## Adding New Agents

To add a new agent:

1. Create `agent-name.md` in `.opencode/agents/`
2. Use YAML frontmatter for metadata:
   ```yaml
   ---
   description: "Brief description"
   mode: subagent
   ---
   ```
3. Document responsibilities and usage patterns
4. Add agent entry to `opencode.json`
5. Test the agent with sample tasks
