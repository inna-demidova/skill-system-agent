import { supabase } from "../../../../src/supabase";

// Parse CLI arguments: --skill "React" --min-exp 5 --position "QA" --department "Engineering" --limit 10
function parseArgs() {
  const args = process.argv.slice(2);
  const skills: string[] = [];
  let minExp: number | undefined;
  let position: string | undefined;
  let department: string | undefined;
  let limit = 20;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--skill":
        skills.push(args[++i]);
        break;
      case "--min-exp":
        minExp = Number(args[++i]);
        break;
      case "--position":
        position = args[++i];
        break;
      case "--department":
        department = args[++i];
        break;
      case "--limit":
        limit = Number(args[++i]);
        break;
    }
  }

  return { skills, minExp, position, department, limit };
}

async function main() {
  const { skills, minExp, position, department, limit } = parseArgs();

  if (skills.length === 0 && !position && !department) {
    console.error("Usage: tsx find-candidates.ts --skill <name> [--min-exp <years>] [--position <name>] [--department <name>] [--limit <n>]");
    console.error("  --skill     Skill name (can repeat for multiple skills)");
    console.error("  --min-exp   Minimum years of experience for the skill");
    console.error("  --position  Filter by position name (partial match)");
    console.error("  --department Filter by department name (partial match)");
    console.error("  --limit     Max results (default 20)");
    process.exit(1);
  }

  // If searching by skills, use employee_skills_view to find candidates
  if (skills.length > 0) {
    let query = supabase
      .from("employee_skills_view")
      .select("*")
      .in("skill_name", skills);

    if (minExp !== undefined) {
      query = query.gte("years_of_experience", minExp);
    }

    const { data, error } = await query.limit(limit * 5); // fetch more to allow grouping

    if (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.log(`No candidates found with skills: ${skills.join(", ")}`);
      return;
    }

    // Group by employee, show all their matching skills
    const grouped: Record<string, { first_name: string; last_name: string; skills: { name: string; years: number }[] }> = {};
    for (const row of data) {
      const key = row.employee_id;
      if (!grouped[key]) {
        grouped[key] = { first_name: row.first_name, last_name: row.last_name, skills: [] };
      }
      grouped[key].skills.push({ name: row.skill_name, years: row.years_of_experience });
    }

    const results = Object.entries(grouped)
      .map(([id, emp]) => ({ employee_id: id, ...emp }))
      .slice(0, limit);

    console.log(`Found ${results.length} candidate(s) with skills: ${skills.join(", ")}\n`);
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // If searching by position or department only
  let query = supabase
    .from("employees")
    .select("id, first_name, last_name, work_email, phone, position_id, department_id, hiring_date");

  if (position) {
    // First find matching position IDs
    const { data: positions } = await supabase
      .from("positions")
      .select("id")
      .ilike("name", `%${position}%`);

    if (!positions || positions.length === 0) {
      console.log(`No positions matching "${position}"`);
      return;
    }
    query = query.in("position_id", positions.map(p => p.id));
  }

  if (department) {
    const { data: departments } = await supabase
      .from("departments")
      .select("id")
      .ilike("name", `%${department}%`);

    if (!departments || departments.length === 0) {
      console.log(`No departments matching "${department}"`);
      return;
    }
    query = query.in("department_id", departments.map(d => d.id));
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  console.log(`Found ${data?.length || 0} candidate(s)\n`);
  console.log(JSON.stringify(data, null, 2));
}

main();
