import { supabase } from "../Database/supabaseClient.js";

// Pull course + mapped skills (with type so we can split skills vs competencies)
export async function getCourseMappings(courseId: number) {
  const { data, error } = await supabase
    .from("courses_skill_mapping")
    .select("skills(skill_name, type)")
    .eq("course_id", courseId);

  if (error) throw new Error(error.message);

  const skills: string[] = [];
  const competencies: string[] = [];

  for (const row of data ?? []) {
    const skill = (row as any).skills;
    if (!skill) continue;

    const type = skill.type as boolean | undefined;

    if (type === true) {
      if (skill.skill_name) competencies.push(skill.skill_name);
    } else {
      if (skill.skill_name) skills.push(skill.skill_name);
    }
  }

  return { skills, competencies };
}

export async function replaceCourseMappings(
  courseId: number,
  skillIds: number[],
) {
  const del = await supabase
    .from("courses_skill_mapping")
    .delete()
    .eq("course_id", courseId);

  if (del.error) throw new Error(del.error.message);

  if (skillIds.length === 0) return;

  const rows = skillIds.map((sid) => ({ course_id: courseId, skill_id: sid }));

  const ins = await supabase.from("courses_skill_mapping").insert(rows);
  if (ins.error) throw new Error(ins.error.message);
}

export async function replaceMappingsForCourseIds(
  courseIds: number[],
  skillIds: number[],
) {
  const uniqueCourseIds = Array.from(
    new Set(courseIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)),
  );

  if (uniqueCourseIds.length === 0) return;

  const del = await supabase
    .from("courses_skill_mapping")
    .delete()
    .in("course_id", uniqueCourseIds);

  if (del.error) throw new Error(del.error.message);

  if (skillIds.length === 0) return;

  const uniqueSkillIds = Array.from(
    new Set(skillIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)),
  );

  const rows = uniqueCourseIds.flatMap((courseId) =>
    uniqueSkillIds.map((skillId) => ({
      course_id: courseId,
      skill_id: skillId,
    })),
  );

  if (rows.length === 0) return;

  const ins = await supabase.from("courses_skill_mapping").insert(rows);
  if (ins.error) throw new Error(ins.error.message);
}

// Used when deleting a Skill itself: remove all mappings everywhere
export async function deleteMappingsBySkillId(skillId: number) {
  const del = await supabase
    .from("courses_skill_mapping")
    .delete()
    .eq("skill_id", skillId);

  if (del.error) throw new Error(del.error.message);
}

export async function isCourseFullyMapped(courseId: number) {
  const { data, error } = await supabase
    .from("courses_skill_mapping")
    .select(
      `
      skill_id,
      skills(type)
    `,
    )
    .eq("course_id", courseId);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return false;

  let hasSkill = false;
  let hasCompetency = false;

  for (const row of data as any[]) {
    const type = row.skills?.[0]?.type;

    if (type === false) hasSkill = true;
    if (type === true) hasCompetency = true;

    if (hasSkill && hasCompetency) return true;
  }

  return false;
}
