import { supabase } from "../Database/supabaseClient.js";

// DB columns are lowercase; the API keeps the { Skill_Id, Skill_name, Type } shape
export function toSkillRow(row: any) {
  return {
    Skill_Id: row.skill_id as number,
    Skill_name: row.skill_name as string,
    Type: row.type as boolean,
  };
}

export async function getAllSkillsAndCompetencies() {
  const { data, error } = await supabase
    .from("skills")
    // Description removed — names only
    .select("skill_id, skill_name, type")
    .order("skill_name", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []).map(toSkillRow);
  const skills = rows.filter((x) => x.Type === false);
  const competencies = rows.filter((x) => x.Type === true);

  return { skills, competencies };
}

// Find existing skill by NAME (skills only), case-insensitive
export async function findSkillByName(name: string) {
  const trimmed = name.trim();

  const { data, error } = await supabase
    .from("skills")
    .select("skill_id, skill_name, type")
    .eq("type", false)
    .ilike("skill_name", trimmed)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toSkillRow(data) : null;
}

// Create skill using NAME (no Description)
export async function createSkillWithName(name: string) {
  const trimmed = name.trim();

  const { data, error } = await supabase
    .from("skills")
    .insert([
      {
        skill_name: trimmed,
        type: false,
      },
    ])
    .select("skill_id, skill_name, type")
    .single();

  if (error) throw new Error(error.message);
  return toSkillRow(data);
}

/**
 * Skills should NOT be deleted anymore.
 * Only delete mappings when Save is pressed.
 */
export async function deleteSkillById(_skillId: number) {
  throw new Error(
    "Deleting Skills rows is disabled. Remove skills from a course by updating the courses_skill_mapping on Save.",
  );
}

export async function findSkillsByNames(names: string[]) {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);

  if (trimmed.length === 0) return [];

  const { data, error } = await supabase
    .from("skills")
    .select("skill_id, skill_name, type")
    .eq("type", false)
    .in("skill_name", trimmed);

  if (error) throw new Error(error.message);
  return (data ?? []).map(toSkillRow);
}

export async function findOrCreateSkillByName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Skill name cannot be empty");
  }

  const existing = await findSkillByName(trimmed);
  if (existing) return existing;

  return await createSkillWithName(trimmed);
}
