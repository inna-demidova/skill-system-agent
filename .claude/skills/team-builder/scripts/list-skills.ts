import { supabase } from "../../../../src/supabase";

async function main() {
  const { data, error } = await supabase
    .from("employee_skills_view")
    .select("skill_name")
    .order("skill_name");

  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  const unique = [...new Set(data?.map((r) => r.skill_name))];
  console.log(`Available skills (${unique.length}):\n`);
  console.log(unique.join(", "));
}

main();
