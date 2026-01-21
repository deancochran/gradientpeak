# GradientPeak Research Directory

This directory contains all research findings from specialized agents. Research is organized by domain and serves as a persistent knowledge base across development sessions.

## 📂 Directory Structure

```
.claude/research/
├── architecture/       # System design & architectural decisions
├── technology/         # Library research & API analysis
├── quality/            # Testing strategies & QA recommendations
├── integration/        # Third-party API integration plans
├── performance/        # Optimization & bottleneck analysis
├── documentation/      # Documentation plans & strategies
├── index.md           # Master index of all research
└── README.md          # This file
```

## 🎯 Purpose

**Research agents** are domain experts who:
- Investigate options and analyze feasibility
- Provide recommendations based on GradientPeak principles
- Document findings for reuse across sessions
- **Never execute code** - only research and advise

**Execution agents** (Primary Interface & Delegating):
- Read research findings before implementing
- Execute implementations based on expert recommendations
- Validate results against research specifications

## 📝 Research Workflow

1. **Commission Research** - Primary Interface or Delegating Agent spawns research agent
2. **Investigate** - Research agent analyzes domain using available tools
3. **Document** - Agent creates research document using standard template
4. **Index** - Agent updates `index.md` with new entry
5. **Execute** - Execution agent implements based on research
6. **Validate** - Verify implementation matches research recommendations

## 🔍 Finding Research

**Check index first:**
```bash
cat .claude/research/index.md
```

**Search by topic:**
```bash
grep -r "FIT file" .claude/research/
grep -r "Strava" .claude/research/integration/
```

**Browse by domain:**
- Architecture decisions → `architecture/`
- Technology choices → `technology/`
- Testing strategies → `quality/`
- API integrations → `integration/`
- Performance issues → `performance/`
- Documentation plans → `documentation/`

## 📋 Research Document Standards

All research documents follow these standards:

### File Naming
Format: `YYYY-MM-DD_topic-description.md`

### Required Sections
- Executive Summary (1-2 sentences)
- Detailed Analysis
- Recommendations (actionable)
- Implementation Checklist
- References

### Template Locations
See `.claude/rules/agent-hierarchy.md` for domain-specific templates:
- Architecture Research Expert → architecture template
- Technology Research Expert → technology template
- Quality Assurance Advisor → quality template
- Integration Analyst → integration template
- Performance Specialist → performance template
- Documentation Strategist → documentation template

## 🚀 Creating New Research

**Manual creation (not recommended):**
- Follow template for the domain
- Update `index.md` with new entry
- Use proper file naming convention

**Automated creation (recommended):**
- Invoke research agent via Primary Interface or Delegating Agent
- Agent will create document, follow template, and update index automatically

Example invocations:
```
"Research FIT file parsing libraries for React Native"
"Analyze Strava API for integration planning"
"Create performance optimization strategy for recording service"
```

## 📊 Research Metrics

Track research effectiveness:
- **Reuse Rate**: How often past research is referenced
- **Implementation Accuracy**: How well implementations match research
- **Decision Quality**: Fewer architectural pivots due to informed decisions
- **Time Savings**: Faster implementations with pre-researched solutions

## ⚠️ Important Notes

- **Research is persistent** - Unlike conversation context, research files remain across sessions
- **Research is indexed** - Always check `index.md` before commissioning new research
- **Research is reusable** - Multiple implementations can reference the same research
- **Research is advisory** - Execution agents can deviate with documented rationale

## 🔗 Related Documentation

- **Agent System**: `.claude/rules/agent-hierarchy.md`
- **Project Architecture**: `CLAUDE.md`
- **Development Rules**: `.claude/rules/` directory
- **Research Index**: `index.md`

---

**Last Updated**: 2026-01-21
