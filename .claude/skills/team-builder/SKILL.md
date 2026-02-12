---
name: team-builder
description: Build a project team by searching for employees matching required skills, positions, experience levels, and departments. Use when the user asks to assemble, create, or suggest a team for a project.
---

# Team Builder

Assemble project teams by finding candidates in the company Supabase database.

## Step 1: Understand the database schema (if needed)

If you're unsure about available tables or columns, use the Supabase MCP tools (e.g. `list_tables`, `get_table_definition`).

## Step 2: Search for candidates

Use the find-candidates script. Run it **once per role** the user needs.

### Search by skill (with optional minimum experience)

```bash
tsx .claude/skills/team-builder/scripts/find-candidates.ts --skill "React" --min-exp 5
```

### Search by multiple skills

```bash
tsx .claude/skills/team-builder/scripts/find-candidates.ts --skill "React" --skill "TypeScript" --min-exp 3
```

### Search by position

```bash
tsx .claude/skills/team-builder/scripts/find-candidates.ts --position "QA"
```

### Search by department

```bash
tsx .claude/skills/team-builder/scripts/find-candidates.ts --department "Engineering"
```

### Combine filters

```bash
tsx .claude/skills/team-builder/scripts/find-candidates.ts --skill ".NET" --position "Developer" --min-exp 5
```

## Step 3: Present the team

After collecting candidates for each role:

1. Match each role requirement to the best candidates
2. Avoid assigning the same person to multiple roles
3. Present results as a structured team proposal with:
   - Role name
   - Candidate name
   - Matching skills and experience
   - Why this candidate fits

## Example

User: "Build a team: 1 React developer (5+ years), 2 QA engineers"

1. Run: `tsx .claude/skills/team-builder/scripts/find-candidates.ts --skill "React" --min-exp 5`
2. Run: `tsx .claude/skills/team-builder/scripts/find-candidates.ts --position "QA"`
3. Combine results, avoid duplicates, present the team
