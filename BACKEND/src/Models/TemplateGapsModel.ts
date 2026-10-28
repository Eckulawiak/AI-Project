// Roadmap template gaps (REQ-ROAD-9): majors whose students got a school or
// university default roadmap because no template exists for their major.
// buildRoadmap records a gap; it is resolved the next time a roadmap for that
// major and goal finds a major-specific template.
import { supabase } from "../Database/supabaseClient.js";

export type TemplateGap = {
  id: number;
  schoolId: number | null;
  school: string | null;
  majorId: number;
  major: string | null;
  goalType: string;
  firstSeenAt: string;
  studentCount: number;
};

// GET /api/admin/template-gaps: open gaps, most students affected first.
export async function getOpenTemplateGaps(): Promise<TemplateGap[]> {
  const { data: gaps, error } = await supabase
    .from("roadmap_template_gaps")
    .select("id, school_id, major_id, goal_type, first_seen_at")
    .is("resolved_at", null);
  if (error) throw new Error(error.message);
  if (!gaps || gaps.length === 0) return [];

  const majorIds = [...new Set(gaps.map((g: any) => g.major_id))];
  const schoolIds = [
    ...new Set(gaps.map((g: any) => g.school_id).filter((x: any) => x != null)),
  ];

  const [majors, schools, students] = await Promise.all([
    supabase.from("majors").select("id, name").in("id", majorIds),
    schoolIds.length
      ? supabase.from("schools").select("id, name").in("id", schoolIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("student")
      .select("major_id, goal_type")
      .in("major_id", majorIds),
  ]);
  for (const r of [majors, schools, students]) {
    if (r.error) throw new Error(r.error.message);
  }

  const majorName = new Map((majors.data ?? []).map((m: any) => [m.id, m.name]));
  const schoolName = new Map((schools.data ?? []).map((s: any) => [s.id, s.name]));

  // Students with no goal set are given the industry roadmap.
  const counts = new Map<string, number>();
  for (const s of students.data ?? []) {
    const key = `${s.major_id}:${s.goal_type ?? "INDUSTRY"}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return gaps
    .map((g: any) => ({
      id: g.id as number,
      schoolId: (g.school_id ?? null) as number | null,
      school: (schoolName.get(g.school_id) ?? null) as string | null,
      majorId: g.major_id as number,
      major: (majorName.get(g.major_id) ?? null) as string | null,
      goalType: g.goal_type as string,
      firstSeenAt: g.first_seen_at as string,
      studentCount: counts.get(`${g.major_id}:${g.goal_type}`) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.studentCount - a.studentCount ||
        a.firstSeenAt.localeCompare(b.firstSeenAt),
    );
}

// Close a major's open gap once a roadmap is built from its own template.
export async function resolveTemplateGap(majorId: number, goalType: string) {
  try {
    const { error } = await supabase
      .from("roadmap_template_gaps")
      .update({ resolved_at: new Date().toISOString() })
      .eq("major_id", majorId)
      .eq("goal_type", goalType)
      .is("resolved_at", null);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("Failed to resolve roadmap template gap:", e);
  }
}
