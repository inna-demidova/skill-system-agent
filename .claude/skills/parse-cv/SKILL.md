---
name: parse-cv
description: Parse raw CV/resume text into structured JSON with employee info, technical skills, soft skills, and education. Use when the user provides resume text to extract structured data.
user_invocable: false
---

# Parse CV

Parses raw resume text into structured JSON using the Claude API directly (not the Agent SDK).

## Usage

This skill is called programmatically via the `/api/action` endpoint, not through chat.

```bash
# CLI mode: pipe CV text via stdin
cat resume.txt | tsx .claude/skills/parse-cv/scripts/parse-cv.ts
```

## What it does

1. Loads reference data from Supabase (skills, soft_skills, english_levels)
2. Builds a prompt with the standardized skill lists injected
3. Calls Claude API (claude-sonnet-4-5) to parse the CV text
4. Returns structured JSON with:
   - `employee` — name, phone, email, position, english level, experience, education
   - `technical_skills` — matched against the DB skill list
   - `soft_skills` — matched against the DB soft skill list
   - `unrecognized_technical_skills` — skills found but not in the DB
   - `unrecognized_soft_skills` — soft skills found but not in the DB

## Integration

The React app calls `POST /api/action` with:

```json
{
  "action": "parse-cv",
  "payload": { "cvText": "..." }
}
```
test github integration
The server calls `parseCV(cvText)` directly and returns the JSON result.
