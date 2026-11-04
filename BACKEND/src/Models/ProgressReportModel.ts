// De-identified progress reporting for faculty (REQ-PROG-7, REQ-ROAD-8) and
// admins (REQ-PROG-8).
//
// Privacy rules, enforced here on the server (REQ-SEC-6):
// - Results are only ever counts, averages, medians and percentages.
//   No student id, name or email leaves this module.
// - Any group with fewer than MIN_GROUP_SIZE students is suppressed: the
//   response says it is too small and carries no numbers.
// - Milestones the student typed in themselves (experience entries, custom
//   milestones) are never listed, since their titles could identify someone.
//   Trends only list milestones that appear on at least MIN_GROUP_SIZE roadmaps.
import { supabase } from "../Database/supabaseClient.js";
import { chunk, fetchAllPages } from "./CoursesModel.js";
import {
  CATEGORIES,
  CLASS_YEARS,
  computeProgress,
  type Category,
  type ClassYear,
} from "../Utils/progress.js";

export const MIN_GROUP_SIZE = 5;
const THRESHOLDS = [25, 50, 75] as const;
const TREND_SOURCES = new Set(["TEMPLATE", "COURSE", "GAP"]);
const TREND_LIMIT = 5;

type MilestoneRow = {
  roadmap_id: number;
  category: Category;
  class_year: string;
  status: string;
  source: string | null;
  name: string;
  required: boolean | null;
};

// One student's roadmap, already stripped of who they are.
type CohortMember = {
  majorId: number | null;
  milestones: MilestoneRow[];
};

export type GroupStats =
  | { suppressed: true; minGroupSize: number }
  | {
      suppressed: false;
      students: number;
      avgOverall: number;
      medianOverall: number;
      byCategory: Record<Category, number>; // average % per category
      reached: Record<"25" | "50" | "75", number>; // % of students at or past
      byClassYear: Array<{ classYear: ClassYear; pct: number; milestones: number }>;
    };

export type MilestoneTrend = {
  name: string;
  category: Category;
  classYear: ClassYear | null;
  onRoadmaps: number;
  completedPct: number;
};

const msg = (e: any) => (e?.message ? String(e.message) : "Database error");

const round1 = (n: number) => Math.round(n * 10) / 10;

function median(values: number[]) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

// Students (optionally only some majors) who have a roadmap, with their
// milestones. Student ids are used only to join tables and are dropped here.
export async function loadCohort(majorIds: number[] | null): Promise<CohortMember[]> {
  let students: Array<{ student_id: number; major_id: number | null }> = [];
  try {
    if (majorIds === null) {
      students = await fetchAllPages((from, to) =>
        supabase
          .from("student")
          .select("student_id, major_id")
          .order("student_id", { ascending: true })
          .range(from, to),
      );
    } else {
      for (const ids of chunk(majorIds)) {
        const part = await fetchAllPages<{ student_id: number; major_id: number | null }>(
          (from, to) =>
            supabase
              .from("student")
              .select("student_id, major_id")
              .in("major_id", ids)
              .order("student_id", { ascending: true })
              .range(from, to),
        );
        students.push(...part);
      }
    }
  } catch (e) {
    throw new Error(msg(e));
  }
  if (students.length === 0) return [];

  const majorOf = new Map(students.map((s) => [s.student_id, s.major_id]));

  const roadmaps: Array<{ id: number; student_id: number }> = [];
  for (const ids of chunk([...majorOf.keys()])) {
    const { data, error } = await supabase
      .from("student_roadmaps")
      .select("id, student_id")
      .in("student_id", ids);
    if (error) throw new Error(error.message);
    roadmaps.push(...((data ?? []) as any[]));
  }
  if (roadmaps.length === 0) return [];

  const byRoadmap = new Map<number, MilestoneRow[]>(roadmaps.map((r) => [r.id, []]));
  for (const ids of chunk(roadmaps.map((r) => r.id))) {
    let rows: MilestoneRow[];
    try {
      rows = await fetchAllPages<MilestoneRow>((from, to) =>
        supabase
          .from("student_milestones")
          .select("roadmap_id, category, class_year, status, source, name, required")
          .in("roadmap_id", ids)
          .order("id", { ascending: true })
          .range(from, to),
      );
    } catch (e) {
      throw new Error(msg(e));
    }
    for (const r of rows) byRoadmap.get(r.roadmap_id)?.push(r);
  }

  // Only roadmaps with at least one milestone count as a student "on" the roadmap.
  return roadmaps
    .map((r) => ({
      majorId: majorOf.get(r.student_id) ?? null,
      milestones: byRoadmap.get(r.id) ?? [],
    }))
    .filter((m) => m.milestones.length > 0);
}

export function groupStats(members: CohortMember[]): GroupStats {
  if (members.length < MIN_GROUP_SIZE) {
    return { suppressed: true, minGroupSize: MIN_GROUP_SIZE };
  }

  const progress = members.map((m) => computeProgress(m.milestones));
  const overall = progress.map((p) => p.overall);

  const byCategory = {} as Record<Category, number>;
  for (const c of CATEGORIES) {
    // Average over the students who have milestones in this category.
    const pcts = progress.filter((p) => p.byCategory[c].total > 0).map((p) => p.byCategory[c].pct);
    byCategory[c] = pcts.length ? round1(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  }

  const reached = {} as Record<"25" | "50" | "75", number>;
  for (const t of THRESHOLDS) {
    reached[String(t) as "25" | "50" | "75"] = round1(
      (overall.filter((o) => o >= t).length / overall.length) * 100,
    );
  }

  // Share of all milestones in each roadmap year that are complete.
  const byClassYear = CLASS_YEARS.map((y) => {
    let total = 0;
    let done = 0;
    for (const m of members) {
      for (const row of m.milestones) {
        if (row.class_year !== y) continue;
        total += 1;
        if (row.status === "COMPLETE") done += 1;
      }
    }
    return { classYear: y, pct: total ? round1((done / total) * 100) : 0, milestones: total };
  }).filter((y) => y.milestones > 0);

  return {
    suppressed: false,
    students: members.length,
    avgOverall: round1(overall.reduce((a, b) => a + b, 0) / overall.length),
    medianOverall: round1(median(overall)),
    byCategory,
    reached,
    byClassYear,
  };
}

// Most and least completed shared milestones in a group (REQ-ROAD-8).
export function milestoneTrends(members: CohortMember[]): {
  mostCompleted: MilestoneTrend[];
  leastCompleted: MilestoneTrend[];
} | null {
  if (members.length < MIN_GROUP_SIZE) return null;

  const tally = new Map<
    string,
    { name: string; category: Category; years: Map<string, number>; on: number; done: number }
  >();
  for (const m of members) {
    const seen = new Set<string>();
    for (const row of m.milestones) {
      if (!TREND_SOURCES.has(row.source ?? "TEMPLATE")) continue;
      const key = `${row.category}:${row.name.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const t =
        tally.get(key) ??
        { name: row.name.trim(), category: row.category, years: new Map(), on: 0, done: 0 };
      t.on += 1;
      if (row.status === "COMPLETE") t.done += 1;
      t.years.set(row.class_year, (t.years.get(row.class_year) ?? 0) + 1);
      tally.set(key, t);
    }
  }

  const items: MilestoneTrend[] = [...tally.values()]
    .filter((t) => t.on >= MIN_GROUP_SIZE)
    .map((t) => {
      const year = [...t.years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        name: t.name,
        category: t.category,
        classYear: (CLASS_YEARS as readonly string[]).includes(year ?? "")
          ? (year as ClassYear)
          : null,
        onRoadmaps: t.on,
        completedPct: round1((t.done / t.on) * 100),
      };
    });

  const byPct = (dir: 1 | -1) => (a: MilestoneTrend, b: MilestoneTrend) =>
    dir * (a.completedPct - b.completedPct) || b.onRoadmaps - a.onRoadmaps || a.name.localeCompare(b.name);

  // The two lists never share a milestone: with few milestones the top half
  // goes to "most" and the rest to "least".
  const ranked = [...items].sort(byPct(-1));
  const mostCount = Math.min(TREND_LIMIT, Math.ceil(ranked.length / 2));
  const mostCompleted = ranked.slice(0, mostCount);
  const leastCompleted = ranked.slice(mostCount).sort(byPct(1)).slice(0, TREND_LIMIT);
  return { mostCompleted, leastCompleted };
}

// ---------------------------------------------------------------------
// Faculty scope: which majors a faculty member reports on.
// ---------------------------------------------------------------------

export type ScopeMajor = { id: number; name: string; schoolId: number | null; school: string | null };

export type FacultyScope = {
  // ASSIGNED: from faculty_majors. COURSES: from the courses they teach.
  source: "ASSIGNED" | "COURSES" | "NONE";
  majors: ScopeMajor[];
};

async function majorsWithSchools(ids: number[]): Promise<ScopeMajor[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("majors")
    .select("id, name, school_id, schools(id, name)")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[])
    .map((m) => ({
      id: m.id as number,
      name: m.name as string,
      schoolId: (m.school_id ?? null) as number | null,
      school: (m.schools?.name ?? null) as string | null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFacultyScope(facultyId: number): Promise<FacultyScope> {
  const assigned = await supabase
    .from("faculty_majors")
    .select("major_id")
    .eq("faculty_id", facultyId);
  if (assigned.error) throw new Error(assigned.error.message);
  const assignedIds = [...new Set((assigned.data ?? []).map((r: any) => r.major_id as number))];
  if (assignedIds.length > 0) {
    return { source: "ASSIGNED", majors: await majorsWithSchools(assignedIds) };
  }

  // Fall back to the majors of the courses they teach (faculty_courses).
  const owned = await supabase
    .from("faculty_courses")
    .select("course_id")
    .eq("faculty_id", facultyId);
  if (owned.error) throw new Error(owned.error.message);
  const courseIds = (owned.data ?? []).map((r: any) => r.course_id as number);

  const majorIds = new Set<number>();
  for (const ids of chunk(courseIds)) {
    const { data, error } = await supabase
      .from("courses")
      .select("major_id")
      .in("course_id", ids);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) if ((c as any).major_id != null) majorIds.add((c as any).major_id);
  }
  if (majorIds.size === 0) return { source: "NONE", majors: [] };
  return { source: "COURSES", majors: await majorsWithSchools([...majorIds]) };
}

// GET /api/faculty/progress
export async function getFacultyProgressReport(facultyId: number) {
  const scope = await getFacultyScope(facultyId);
  if (scope.majors.length === 0) {
    return { minGroupSize: MIN_GROUP_SIZE, scope, overall: null, majors: [], schools: [], trends: null };
  }

  // School-level groups cover every major in the faculty member's schools.
  const schoolIds = [...new Set(scope.majors.map((m) => m.schoolId).filter((x): x is number => x != null))];
  let schoolMajors: Array<{ id: number; school_id: number }> = [];
  if (schoolIds.length > 0) {
    const { data, error } = await supabase
      .from("majors")
      .select("id, school_id")
      .in("school_id", schoolIds);
    if (error) throw new Error(error.message);
    schoolMajors = (data ?? []) as any[];
  }
  const allMajorIds = [...new Set([...scope.majors.map((m) => m.id), ...schoolMajors.map((m) => m.id)])];
  const cohort = await loadCohort(allMajorIds);

  const inScope = new Set(scope.majors.map((m) => m.id));
  const scoped = cohort.filter((m) => m.majorId != null && inScope.has(m.majorId));
  const schoolOf = new Map(schoolMajors.map((m) => [m.id, m.school_id]));
  const schoolName = new Map(scope.majors.map((m) => [m.schoolId, m.school]));

  return {
    minGroupSize: MIN_GROUP_SIZE,
    scope,
    overall: groupStats(scoped),
    majors: scope.majors.map((major) => ({
      id: major.id,
      name: major.name,
      school: major.school,
      stats: groupStats(scoped.filter((m) => m.majorId === major.id)),
    })),
    schools: schoolIds.map((id) => ({
      id,
      name: schoolName.get(id) ?? null,
      stats: groupStats(cohort.filter((m) => m.majorId != null && schoolOf.get(m.majorId) === id)),
    })),
    trends: milestoneTrends(scoped),
  };
}

// Progress for every school, for the admin report (REQ-PROG-8).
export async function getAllSchoolsProgress() {
  const [cohort, schools, majors] = await Promise.all([
    loadCohort(null),
    supabase.from("schools").select("id, name").order("name", { ascending: true }),
    supabase.from("majors").select("id, school_id"),
  ]);
  if (schools.error) throw new Error(schools.error.message);
  if (majors.error) throw new Error(majors.error.message);
  const schoolOf = new Map(((majors.data ?? []) as any[]).map((m) => [m.id, m.school_id]));

  return {
    overall: groupStats(cohort),
    trends: milestoneTrends(cohort),
    schools: ((schools.data ?? []) as any[]).map((s) => {
      const members = cohort.filter((m) => m.majorId != null && schoolOf.get(m.majorId) === s.id);
      return {
        id: s.id as number,
        name: s.name as string,
        studentsWithRoadmaps: members.length >= MIN_GROUP_SIZE ? members.length : null,
        stats: groupStats(members),
      };
    }),
  };
}
