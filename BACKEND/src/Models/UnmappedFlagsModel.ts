import { supabase } from "../Database/supabaseClient.js";
import { getMappingsForCourseIds } from "./CourseSkillMappingModel.js";

// REQ-SKM-7: courses students select that have no complete mapping are
// flagged for Career Development; the flag clears once a mapping exists.

// Same rule as the dashboards: at least one skill and one competency.
async function splitByMapped(courseIds: number[]) {
  const mappings = await getMappingsForCourseIds(courseIds);
  const mapped: number[] = [];
  const unmapped: number[] = [];
  for (const [id, m] of mappings) {
    if (m.skills.length > 0 && m.competencies.length > 0) mapped.push(id);
    else unmapped.push(id);
  }
  return { mapped, unmapped };
}

// Raise (or bump) an open flag for each selected course that is unmapped.
export async function flagUnmappedCourses(courseIds: number[]) {
  const ids = Array.from(new Set(courseIds));
  if (ids.length === 0) return [];

  const { unmapped } = await splitByMapped(ids);
  if (unmapped.length === 0) return [];

  const { data: open, error } = await supabase
    .from("unmapped_course_flags")
    .select("id, course_id, flag_count")
    .in("course_id", unmapped)
    .is("resolved_at", null);
  if (error) throw new Error(error.message);

  const openByCourse = new Map(
    (open ?? []).map((f: any) => [f.course_id as number, f]),
  );

  for (const courseId of unmapped) {
    const existing = openByCourse.get(courseId);
    const result = existing
      ? await supabase
          .from("unmapped_course_flags")
          .update({ flag_count: existing.flag_count + 1 })
          .eq("id", existing.id)
      : await supabase
          .from("unmapped_course_flags")
          .insert({ course_id: courseId });
    if (result.error) throw new Error(result.error.message);
  }

  return unmapped;
}

// Clear open flags on courses that are now mapped. Called after a mapping
// save; failures are logged so they never block the save itself.
export async function resolveFlagsForMappedCourses(courseIds: number[]) {
  try {
    const ids = Array.from(new Set(courseIds));
    if (ids.length === 0) return;

    const { mapped } = await splitByMapped(ids);
    if (mapped.length === 0) return;

    const { error } = await supabase
      .from("unmapped_course_flags")
      .update({ resolved_at: new Date().toISOString() })
      .in("course_id", mapped)
      .is("resolved_at", null);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("Failed to resolve unmapped course flags:", e);
  }
}

export async function getOpenFlags() {
  const { data, error } = await supabase
    .from("unmapped_course_flags")
    .select(
      "id, course_id, flag_count, first_flagged_at, courses(course_code, course_name, major)",
    )
    .is("resolved_at", null)
    .order("flag_count", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((f: any) => ({
    id: f.id as number,
    courseId: f.course_id as number,
    courseCode: (f.courses?.course_code ?? "") as string,
    courseName: (f.courses?.course_name ?? "") as string,
    major: (f.courses?.major ?? "") as string,
    flagCount: f.flag_count as number,
    firstFlaggedAt: f.first_flagged_at as string,
  }));
}
