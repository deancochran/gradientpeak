# GradientPeak Claude Code Agents

Specialized agents for different aspects of GradientPeak development. Each agent has deep expertise in its domain and can be invoked contextually or explicitly referenced.

## Mobile Development

### mobile-recording-assistant
**Color:** Blue | **Model:** Sonnet

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
**Color:** Green | **Model:** Sonnet

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

## Web Development

### web-page-generator
**Color:** Purple | **Model:** Sonnet

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
- Implementing Next.js 15 App Router patterns

---

### trpc-router-generator
**Color:** Orange | **Model:** Sonnet

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
**Color:** Yellow | **Model:** Sonnet

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
**Color:** Red | **Model:** Sonnet

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
**Color:** Cyan | **Model:** Sonnet

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
**Model:** Sonnet

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
**Color:** Yellow | **Model:** Sonnet

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
**Color:** Pink | **Model:** Sonnet

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

## Usage

### Contextual Invocation
Agents are automatically invoked when the context matches their expertise. For example:
- Asking "How do I add a new sensor to the recording service?" will likely invoke the mobile-recording-assistant
- Asking "Create a list page for activities" will likely invoke the web-page-generator

### Explicit Reference
You can explicitly reference an agent by name:
```
"Use the mobile-form-assistant to create a form for creating activities"
"Have the database-migration-assistant create a table for routes"
"Ask the performance-optimizer to review this component"
```

## Agent Capabilities

All agents can:
- Read and analyze code
- Generate new code following project patterns
- Suggest improvements and optimizations
- Explain complex concepts
- Debug issues in their domain

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

### Refactoring
1. **Review** current code with code-improvement-reviewer
2. **Refactor** with domain-specific agent
3. **Optimize** with performance-optimizer if needed

## Agent Development Guidelines

All agents follow:
- **Project rules** in `.claude/rules/`
- **Code standards** (TypeScript, testing, documentation)
- **Architecture patterns** (monorepo, local-first, JSON-centric)
- **Best practices** for their domain

## Adding New Agents

To add a new agent:
1. Create `agent-name.md` in this directory
2. Use YAML frontmatter for metadata:
   ```yaml
   ---
   name: agent-name
   description: "Brief description"
   model: sonnet
   color: blue
   ---
   ```
3. Document responsibilities and usage patterns
4. Add to this README
5. Test the agent with sample tasks

## Feedback

If an agent isn't working as expected:
- Ensure the task is in the agent's domain
- Try being more specific about what you need
- Check if another agent might be more appropriate
- Provide more context about the problem
