---
name: skill-creator
description: Create a new agent skill from scratch. Use when the user wants to create, generate, design, or build a new skill for the AI assistant. Helps define what the skill does, writes SKILL.md with proper frontmatter, and generates supporting scripts if needed.
user-invocable: true
---

# Skill Creator

You help users create new skills for this AI assistant. A skill is a folder containing a SKILL.md file (instructions for the agent) and optional scripts.

## Process

### Step 1: Understand what the user wants

Ask clarifying questions before writing anything:

- What should this skill do? (specific use case)
- Should it be triggered by the user in chat (`user-invocable: true`) or only used programmatically (`user-invocable: false`)?
- Does it need scripts (e.g., database queries, API calls) or is it purely instructional?
- What data sources or tools will it use? (Supabase, external APIs, MCP tools, etc.)

Keep it conversational. Don't ask all questions at once — adapt based on answers.

### Step 2: Choose a skill name

Pick a short, lowercase, hyphenated name that describes the skill (e.g., `parse-cv`, `team-builder`, `send-report`).

Confirm the name with the user before proceeding.

### Step 3: Generate the skill files

Create the skill as a **draft** in the `.claude/skill-drafts/` directory. NEVER write to `.claude/skills/` directly.

```bash
mkdir -p .claude/skill-drafts/{skill-name}
```

#### SKILL.md format

Every skill needs a SKILL.md with YAML frontmatter and markdown instructions:

```markdown
---
name: {skill-name}
description: {When to trigger this skill — be specific so the agent knows when to use it vs other skills}
user-invocable: {true or false}
---

# {Skill Title}

{Clear instructions for the agent: what to do, what tools/scripts to use, what format to return results in.}
```

Write the SKILL.md:

```bash
cat > .claude/skill-drafts/{skill-name}/SKILL.md << 'SKILL_EOF'
{content}
SKILL_EOF
```

#### Scripts (if needed)

If the skill needs scripts, create them in a `scripts/` subdirectory:

```bash
mkdir -p .claude/skill-drafts/{skill-name}/scripts
cat > .claude/skill-drafts/{skill-name}/scripts/{script-name}.ts << 'SCRIPT_EOF'
{content}
SCRIPT_EOF
```

Scripts should:
- Import supabase client from `../../../../src/supabase` (if using database)
- Be executable with `tsx .claude/skills/{skill-name}/scripts/{script-name}.ts`
- Accept arguments via CLI flags (e.g., `--name "value"`)
- Output results as JSON to stdout

### Step 4: Summarize

After creating the draft files, tell the user:

1. What files were created
2. A brief summary of what the skill does
3. That the draft is ready for review — they can preview and approve it in the Skills UI

## Important rules

- ALWAYS write to `.claude/skill-drafts/`, NEVER to `.claude/skills/`
- The `description` field in frontmatter is critical — it determines when the agent triggers this skill vs others. Be specific.
- Keep SKILL.md concise. The context window is a shared resource.
- Reference existing patterns from other skills in this project (parse-cv, team-builder) when relevant.
- If the skill needs database access, use the Supabase client from `src/supabase.ts`.
