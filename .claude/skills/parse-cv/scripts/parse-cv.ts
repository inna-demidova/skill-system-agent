import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../../../../src/supabase";

const SYSTEM_PROMPT = `You are an HR AI specialized in parsing software developers' resumes.

Your task:

Given the raw extracted text of a resume (below), analyze it and extract the following information in a STRICT JSON format.

Your JSON MUST FOLLOW EXACTLY this structure:

{
  "employee": {
    "first_name": "",
    "last_name": "",
    "phone": "",
    "personal_email": "",
    "position": "",
    "english_level": "",
    "working_experience": 0,
    "education": [
      {
        "school": "",
        "degree": "",
        "start_year": "",
        "end_year": "",
        "field_of_study": ""
      }
    ]
  },
  "technical_skills": [
    {
      "skill_name": "",
      "years_of_experience": 0,
      "seniority_level": ""
    }
  ],
  "soft_skills": [
    {
      "skill_name": ""
    }
  ],
  "unrecognized_technical_skills": [
    {
      "skill_name": "",
      "years_of_experience": 0,
      "seniority_level": ""
    }
  ],
  "unrecognized_soft_skills": [
    {
      "skill_name": ""
    }
  ]
}

DATA REQUIREMENTS:

employee.first_name / last_name:
- Detect based on typical resume structure.
- If the name appears in "Name: ___" or at the top of CV, extract it.
- If only full name is present, split it.
- Always title-case names.

employee.position:
- Extract the most recent or primary role.
- If multiple positions exist, choose the one most consistent with the last job or summary.

employee.working_experience:
- Total years of professional working experience.
- Calculate from employment history dates if not explicitly stated.

technical_skills array:
- skill_name: must EXACTLY match one of: {{ technical_skills }}
- years_of_experience: estimate based on dates in the resume. If unclear, use best guess (1-10).
- seniority_level: Junior, Middle, or Senior — infer from how the skill is described and applied.
- DO NOT include any skill unless it exists in the standardized list.

soft_skills array:
- skill_name: must EXACTLY match one of: {{ soft_skills }}
- DO NOT include any skill unless it exists in the standardized list.

unrecognized_technical_skills:
- All detected technical skills that do NOT exist in the standardized list.
- Use commonly accepted casing (AWS, SQL, MongoDB, Node.js, TypeScript, etc.).

unrecognized_soft_skills:
- All detected soft skills that do NOT exist in the standardized list.
- Use Title Case.

english_level:
- Return exactly one of: {{ english_levels }}

education:
- Extract all education entries. Prefer the highest or most relevant degree.
- school, degree, field_of_study, start_year (YYYY), end_year (YYYY).

Output rules:
- Valid JSON only. No commentary. No markdown. No explanations.`;

interface ParseCVResult {
  employee: Record<string, unknown>;
  technical_skills: Array<{ skill_name: string; years_of_experience: number; seniority_level: string }>;
  soft_skills: Array<{ skill_name: string }>;
  unrecognized_technical_skills: Array<{ skill_name: string; years_of_experience: number; seniority_level: string }>;
  unrecognized_soft_skills: Array<{ skill_name: string }>;
}

export async function parseCV(cvText: string): Promise<ParseCVResult> {
  // Load reference data from DB
  const [skillsRes, softSkillsRes, englishRes] = await Promise.all([
    supabase.from("skills").select("id, name").order("name"),
    supabase.from("soft_skills").select("id, name").order("name"),
    supabase.from("english_levels").select("id, name").order("id"),
  ]);

  const technicalSkills = (skillsRes.data || []).map((s) => s.name).join(", ");
  const softSkills = (softSkillsRes.data || []).map((s) => s.name).join(", ");
  const englishLevels = (englishRes.data || []).map((l) => l.name).join(", ");

  const resolvedPrompt = SYSTEM_PROMPT
    .replace("{{ technical_skills }}", technicalSkills)
    .replace("{{ soft_skills }}", softSkills)
    .replace("{{ english_levels }}", englishLevels);

  // Call Claude API
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4000,
    temperature: 0.3,
    system: resolvedPrompt,
    messages: [
      { role: "user", content: cvText.slice(0, 80000) },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Parse JSON from response (handle possible markdown wrapping)
  const raw = content.text;
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const parsed: ParseCVResult = JSON.parse((jsonMatch?.[1] ?? raw).trim());

  return parsed;
}

// CLI mode: read CV text from stdin
if (require.main === module) {
  let input = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", async () => {
    try {
      const result = await parseCV(input.trim());
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });
}
