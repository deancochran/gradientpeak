# Research Index

Master index of all research findings and analysis.

## Directory Structure

```
.opencode/research/
├── architecture/     # System design, architectural decisions
├── technology/       # Library research, API analysis
├── quality/          # Testing strategies, QA recommendations
├── integration/      # Third-party API integration plans
├── performance/      # Optimization recommendations
├── documentation/    # Documentation plans and strategies
└── index.md         # This file
```

## How to Use This Index

1. **Before implementing**: Check relevant research directories
2. **Before adding new tech**: Check `technology/` for existing analysis
3. **Before architectural changes**: Check `architecture/` for patterns
4. **Before integration**: Check `integration/` for API research

## Recent Research

### Architecture

### Technology

### Quality

### Integration

### Performance

### Documentation

## Adding Research

Research agents save findings to:

- Short summary: `.opencode/task/active/[task-id]/[domain]-findings.md`
- Detailed analysis: `.opencode/research/[domain]/YYYY-MM-DD_topic.md`

Update this index when adding new research.

## Research Standards

All research must:

- Provide actionable recommendations
- Include code examples
- Identify risks and mitigation
- Reference authoritative sources
- Follow the research template in agent files
