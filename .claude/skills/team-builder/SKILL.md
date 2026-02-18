---
name: team-builder
description: Build a project team by searching for employees matching required skills, positions, experience levels, and departments. Use when the user asks to assemble, create, or suggest a team for a project.
---

# Team Builder

Assemble project teams by finding candidates in the company Supabase database.

## Step 1: Discover available skills

**Always start here.** Before searching for candidates, check what skills exist in the database:

```bash
tsx .claude/skills/team-builder/scripts/list-skills.ts
```

Use the returned list to map the user's request to exact skill names from the database. For example:
- "frontend team" → look for React.js, TypeScript, CSS, HTML, Vue.js, Angular, etc. from the list
- "backend developers" → look for Node.js, Python, Java, .NET, Go, etc. from the list
- "mobile team" → look for Swift, Kotlin, React Native, Flutter, etc. from the list

## Important: default behavior

- When the user does NOT specify seniority or years of experience, **always pick the most experienced candidates** (highest years_of_experience).
- "2 React developers" means "2 most experienced React developers".
- "1 middle .NET engineer" means a candidate with ~2-5 years of experience.
- Never say "skill not found" if you haven't checked the available skills list first (Step 1).

## Step 2: Search for candidates

Use the find-candidates script. Run it **once per role** the user needs. Always use the **exact skill names** from Step 1 — never guess.

### Search by skill (with optional minimum experience)

```bash
tsx .claude/skills/team-builder/scripts/find-candidates.ts --skill "React.js" --min-exp 5
```

### Search by multiple skills

```bash
tsx .claude/skills/team-builder/scripts/find-candidates.ts --skill "React.js" --skill "TypeScript" --min-exp 3
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

## Error handling

If any script fails (e.g., database error, column not found), **do not give up**. Fall back to the Supabase MCP tools to query the database directly:

1. Use `list_tables` to see available tables
2. Use `get_table_definition` to check current column names
3. Run a direct query via MCP to get the data the user needs

Never return an error to the user without attempting the MCP fallback first.

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

User: "I want to build a strong frontend team"

1. Run: `tsx .claude/skills/team-builder/scripts/list-skills.ts` to see available skills
2. From the list, identify frontend skills (e.g. React.js, TypeScript, CSS, Vue.js)
3. Run find-candidates for each relevant skill
4. Combine results, avoid duplicates, present the team

User: "Build a team: 1 React developer (5+ years), 2 QA engineers"

1. Run: `tsx .claude/skills/team-builder/scripts/list-skills.ts` to find exact skill name
2. Run: `tsx .claude/skills/team-builder/scripts/find-candidates.ts --skill "React.js" --min-exp 5`
3. Run: `tsx .claude/skills/team-builder/scripts/find-candidates.ts --position "QA"`
4. Combine results, avoid duplicates, present the team
test text
