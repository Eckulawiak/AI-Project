import { supabase } from "../Database/supabaseClient.js";
import { toSkillRow } from "./SkillsModel.js";

export async function getSkillIdsForMajor(majorId: number): Promise<number[]> {
  const { data, error } = await supabase
    .from("skill_major_mapping")
    .select("skill_id")
    .eq("major_id", majorId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.skill_id);
}

/**
 * Returns skills rows for a major (joined through skill_major_mapping).
 * Adds majorMatch: true.
 */
export async function getSkillsForMajor(majorId: number): Promise<
  Array<{
    Skill_Id: number;
    Skill_name: string;
    Type: boolean;
    majorMatch: boolean;
  }>
> {
  const { data, error } = await supabase
    .from("skill_major_mapping")
    .select("skill_id, skills(skill_id, skill_name, type)")
    .eq("major_id", majorId);

  if (error) throw new Error(error.message);

  const flattened = (data ?? [])
    .map((row: any) => row.skills)
    .filter(Boolean)
    .map((s: any) => ({ ...toSkillRow(s), majorMatch: true }));

  // dedup safety
  const seen = new Set<number>();
  return flattened.filter((s) => {
    if (seen.has(s.Skill_Id)) return false;
    seen.add(s.Skill_Id);
    return true;
  });
}

export async function linkSkillToMajor(skillId: number, majorId: number) {
  const { error } = await supabase
    .from("skill_major_mapping")
    .upsert([{ skill_id: skillId, major_id: majorId }], {
      onConflict: "skill_id,major_id",
    });

  if (error) throw new Error(error.message);
}
