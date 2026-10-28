import { supabase } from "../Database/supabaseClient.js";
import { resolveTemplateGap } from "./TemplateGapsModel.js";
import { chunk, fetchAllPages, getCoursesByIds } from "./CoursesModel.js";
import { getMappingsForCourseIds } from "./CourseSkillMappingModel.js";
import { getAllSkillsAndCompetencies } from "./SkillsModel.js";
import {
  CLASS_YEARS,
  classYearForCourse,
  computeProgress,
  crossedThreshold,
  isClassYear,
  type Category,
  type ClassYear,
  type Progress,
} from "../Utils/progress.js";

// Roadmap Engine (SDS C6) and the milestone side of Progress Tracking (C7).

export type GoalType = "INDUSTRY" | "GRAD";
export type MilestoneStatus = "PENDING" | "COMPLETE";
export type MilestoneSource =
  | "TEMPLATE"
  | "COURSE"
  | "GAP"
  | "EXPERIENCE"
  | "CUSTOM";

export type StudentProfile = {
  firstName: string;
  schoolId: number | null;
  school: string | null;
  majorId: number | null;
  major: string | null;
  classYear: ClassYear | null;
  careerGoal: string | null;
  goalType: GoalType | null;
};

export type Competency = { id: number; name: string };

export type Milestone = {
  id: number;
  name: string;
  description: string;
  category: Category;
  classYear: ClassYear;
  status: MilestoneStatus;
  source: MilestoneSource;
  courseId: number | null;
  courseCode: string | null;
  competencies: Competency[];
  completedAt: string | null;
};

export type RoadmapCourse = {
  courseId: number;
  courseCode: string;
  courseName: string;
  skills: string[];
  competencies: Competency[];
  mapped: boolean;
};

export type RoadmapPayload = {
  profile: StudentProfile;
  roadmap: {
    id: number;
    templateName: string | null;
    usesDefaultTemplate: boolean;
    generatedAt: string;
  };
  lastAssessmentAt: string | null;
  milestones: Milestone[];
  progress: Progress;
};

const MILESTONE_COLUMNS =
  "id, template_milestone_id, course_id, category, class_year, name, description, status, source, competency_ids, completed_at, courses(course_code)";

// ---------------------------------------------------------------------
// Student profile
// ---------------------------------------------------------------------

export async function getStudentProfile(
  studentId: number,
): Promise<StudentProfile> {
  const { data, error } = await supabase
    .from("student")
    .select(
      "firstname, major, major_id, class_year, career_goal, goal_type, majors(id, name, school_id, schools(id, name))",
    )
    .eq("student_id", studentId)
    .single();

  if (error || !data) throw new Error("Student account not found");

  const row = data as any;
  return {
    firstName: row.firstname ?? "",
    schoolId: row.majors?.schools?.id ?? row.majors?.school_id ?? null,
    school: row.majors?.schools?.name ?? null,
    majorId: row.major_id ?? null,
    major: row.majors?.name ?? row.major ?? null,
    classYear: isClassYear(row.class_year) ? row.class_year : null,
    careerGoal: row.career_goal ?? null,
    goalType:
      row.goal_type === "INDUSTRY" || row.goal_type === "GRAD"
        ? row.goal_type
        : null,
  };
}

export async function updateStudentProfile(
  studentId: number,
  updates: {
    majorId: number;
    classYear: ClassYear;
    careerGoal: string;
    goalType: GoalType;
  },
) {
  const { data: major, error: majorError } = await supabase
    .from("majors")
    .select("id, name")
    .eq("id", updates.majorId)
    .maybeSingle();
  if (majorError) throw new Error(majorError.message);
  if (!major) throw new Error("Major not found");

  const { error } = await supabase
    .from("student")
    .update({
      major: major.name, // legacy text column the resume builder still reads
      major_id: major.id,
      class_year: updates.classYear,
      career_goal: updates.careerGoal,
      goal_type: updates.goalType,
    })
    .eq("student_id", studentId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------
// Competencies and courses
// ---------------------------------------------------------------------

export async function getCompetencies(): Promise<Competency[]> {
  const { competencies } = await getAllSkillsAndCompetencies();
  return competencies
    .map((c) => ({ id: c.Skill_Id, name: c.Skill_name }))
    .sort((a, b) => a.id - b.id);
}

// The courses a major's roadmap and assessment use: the major's required
// courses from major_courses, or the courses it owns when none are listed.
export async function getRoadmapCoursesForMajor(
  majorId: number,
  competencies: Competency[],
): Promise<RoadmapCourse[]> {
  let courseIds = (
    await fetchAllPages<{ course_id: number }>((from, to) =>
      supabase
        .from("major_courses")
        .select("course_id")
        .eq("major_id", majorId)
        .order("course_id", { ascending: true })
        .range(from, to),
    )
  ).map((r) => r.course_id);

  if (courseIds.length === 0) {
    courseIds = (
      await fetchAllPages<{ course_id: number }>((from, to) =>
        supabase
          .from("courses")
          .select("course_id")
          .eq("major_id", majorId)
          .eq("is_active", true)
          .order("course_id", { ascending: true })
          .range(from, to),
      )
    ).map((r) => r.course_id);
  }

  const courses = await getCoursesByIds(courseIds);
  const mappings = await getMappingsForCourseIds(courses.map((c) => c.course_id));
  const byName = new Map(competencies.map((c) => [c.name, c]));

  // One entry per course code; alternate special-topics titles share it.
  // When several rows share a code, keep a mapped one so its skills show.
  const byCode = new Map<string, RoadmapCourse>();
  for (const c of courses) {
    const m = mappings.get(c.course_id) ?? { skills: [], competencies: [] };
    const entry: RoadmapCourse = {
      courseId: c.course_id,
      courseCode: c.course_code,
      courseName: c.course_name,
      skills: m.skills,
      competencies: m.competencies
        .map((name) => byName.get(name))
        .filter((x): x is Competency => !!x),
      mapped: m.skills.length > 0 && m.competencies.length > 0,
    };
    const existing = byCode.get(c.course_code);
    if (!existing || (!existing.mapped && entry.mapped))
      byCode.set(c.course_code, entry);
  }
  const result = [...byCode.values()];

  return result.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
}

// course id -> COMPLETED | IN_PROGRESS
export async function getCourseHistory(studentId: number) {
  const { data, error } = await supabase
    .from("student_course_history")
    .select("course_id, status")
    .eq("student_id", studentId);
  if (error) throw new Error(error.message);

  return new Map<number, string>(
    (data ?? []).map((r: any) => [r.course_id, r.status ?? "COMPLETED"]),
  );
}

// Save the statuses from the assessment. NONE removes the course.
export async function saveCourseHistory(
  studentId: number,
  courses: Array<{ courseId: number; status: "COMPLETED" | "IN_PROGRESS" | "NONE" }>,
) {
  const keep = courses.filter((c) => c.status !== "NONE");
  const drop = courses.filter((c) => c.status === "NONE").map((c) => c.courseId);

  if (keep.length > 0) {
    const { error } = await supabase.from("student_course_history").upsert(
      keep.map((c) => ({
        student_id: studentId,
        course_id: c.courseId,
        status: c.status,
      })),
      { onConflict: "student_id,course_id" },
    );
    if (error) throw new Error(error.message);
  }

  for (const ids of chunk(drop)) {
    const { error } = await supabase
      .from("student_course_history")
      .delete()
      .eq("student_id", studentId)
      .in("course_id", ids);
    if (error) throw new Error(error.message);
  }
}

// ---------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------

type TemplateRow = {
  id: number;
  school_id: number | null;
  major_id: number | null;
  goal_type: string;
  name: string;
};

// Most specific template first: major -> school default -> university
// default. Within a level an exact goal type beats ANY.
async function selectTemplate(profile: StudentProfile) {
  const { data, error } = await supabase
    .from("roadmap_templates")
    .select("id, school_id, major_id, goal_type, name");
  if (error) throw new Error(error.message);

  const goal = profile.goalType ?? "INDUSTRY";
  const rows = ((data ?? []) as TemplateRow[]).filter(
    (t) => t.goal_type === goal || t.goal_type === "ANY",
  );
  const best = (items: TemplateRow[]) =>
    items.sort(
      (a, b) => Number(a.goal_type !== goal) - Number(b.goal_type !== goal),
    )[0] ?? null;

  const levels: Array<["MAJOR" | "SCHOOL" | "UNIVERSITY", TemplateRow[]]> = [
    [
      "MAJOR",
      profile.majorId == null
        ? []
        : rows.filter((t) => t.major_id === profile.majorId),
    ],
    [
      "SCHOOL",
      profile.schoolId == null
        ? []
        : rows.filter(
            (t) => t.school_id === profile.schoolId && t.major_id == null,
          ),
    ],
    [
      "UNIVERSITY",
      rows.filter((t) => t.school_id == null && t.major_id == null),
    ],
  ];

  for (const [level, items] of levels) {
    const template = best(items);
    if (template) return { template, level };
  }
  return { template: null, level: null };
}

// REQ-ROAD-9: remember majors that fell back to a default template.
async function recordTemplateGap(profile: StudentProfile) {
  if (profile.majorId == null) return;
  const goal = profile.goalType ?? "INDUSTRY";

  try {
    const { data, error } = await supabase
      .from("roadmap_template_gaps")
      .select("id")
      .eq("major_id", profile.majorId)
      .eq("goal_type", goal)
      .is("resolved_at", null)
      .limit(1);
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return;

    const { error: insertError } = await supabase
      .from("roadmap_template_gaps")
      .insert({
        school_id: profile.schoolId,
        major_id: profile.majorId,
        goal_type: goal,
      });
    if (insertError) throw new Error(insertError.message);
  } catch (e) {
    console.error("Failed to record roadmap template gap:", e);
  }
}

async function getTemplateMilestones(templateId: number) {
  const { data, error } = await supabase
    .from("template_milestones")
    .select(
      "id, category, class_year, name, description, course_id, gap_competency_id, template_milestone_competencies(competency_id)",
    )
    .eq("template_id", templateId)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((t: any) => ({
    id: t.id as number,
    category: t.category as Category,
    classYear: t.class_year as ClassYear,
    name: t.name as string,
    description: (t.description ?? "") as string,
    courseId: (t.course_id ?? null) as number | null,
    gapCompetencyId: (t.gap_competency_id ?? null) as number | null,
    competencyIds: ((t.template_milestone_competencies ?? []) as any[]).map(
      (c) => c.competency_id as number,
    ),
  }));
}

// ---------------------------------------------------------------------
// Roadmaps and milestones
// ---------------------------------------------------------------------

async function findRoadmap(studentId: number) {
  const { data, error } = await supabase
    .from("student_roadmaps")
    .select("id, template_id, generated_at, roadmap_templates(name, major_id)")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as any;
}

async function getMilestoneRows(roadmapId: number) {
  const { data, error } = await supabase
    .from("student_milestones")
    .select(MILESTONE_COLUMNS)
    .eq("roadmap_id", roadmapId)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

function toMilestone(row: any, lookup: Map<number, Competency>): Milestone {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    category: row.category,
    classYear: isClassYear(row.class_year) ? row.class_year : "FIRST",
    status: row.status === "COMPLETE" ? "COMPLETE" : "PENDING",
    source: row.source ?? "TEMPLATE",
    courseId: row.course_id ?? null,
    courseCode: row.courses?.course_code ?? null,
    competencies: ((row.competency_ids ?? []) as number[])
      .map((id) => lookup.get(Number(id)))
      .filter((x): x is Competency => !!x),
    completedAt: row.completed_at ?? null,
  };
}

// Identity of a milestone across regenerations, so a completed one is never
// added a second time.
function milestoneKey(row: {
  template_milestone_id?: number | null;
  course_id?: number | null;
  source?: string;
  name: string;
}) {
  if (row.template_milestone_id) return `t:${row.template_milestone_id}`;
  if (row.course_id) return `c:${row.course_id}`;
  return `${row.source ?? "CUSTOM"}:${row.name.trim().toLowerCase()}`;
}

async function getWeakCompetencyIds(studentId: number) {
  const { data, error } = await supabase
    .from("student_assessments")
    .select("ratings")
    .eq("student_id", studentId)
    .order("completed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const ratings = (data?.[0]?.ratings ?? {}) as Record<string, number>;
  return new Set(
    Object.entries(ratings)
      .filter(([, rating]) => Number(rating) <= 2)
      .map(([id]) => Number(id)),
  );
}

// generate / regenerate (SDS 3.1.2). Pending milestones are rebuilt from the
// current profile, template, course history and latest assessment;
// completed milestones are kept as history (REQ-ROAD-4).
export async function buildRoadmap(
  studentId: number,
): Promise<RoadmapPayload> {
  const profile = await getStudentProfile(studentId);
  const competencies = await getCompetencies();

  const { template, level } = await selectTemplate(profile);
  if (level !== "MAJOR") await recordTemplateGap(profile);
  else if (profile.majorId != null)
    await resolveTemplateGap(profile.majorId, profile.goalType ?? "INDUSTRY");

  const { data: roadmap, error: roadmapError } = await supabase
    .from("student_roadmaps")
    .upsert(
      {
        student_id: studentId,
        template_id: template?.id ?? null,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "student_id" },
    )
    .select("id")
    .single();
  if (roadmapError || !roadmap)
    throw new Error(roadmapError?.message ?? "Could not save roadmap");

  const { error: deleteError } = await supabase
    .from("student_milestones")
    .delete()
    .eq("roadmap_id", roadmap.id)
    .eq("status", "PENDING");
  if (deleteError) throw new Error(deleteError.message);

  const [kept, templateMilestones, courses, history, weak] = await Promise.all([
    getMilestoneRows(roadmap.id),
    template ? getTemplateMilestones(template.id) : Promise.resolve([]),
    profile.majorId != null
      ? getRoadmapCoursesForMajor(profile.majorId, competencies)
      : Promise.resolve([]),
    getCourseHistory(studentId),
    getWeakCompetencyIds(studentId),
  ]);

  const existingKeys = new Set(kept.map(milestoneKey));
  const currentYear = profile.classYear
    ? CLASS_YEARS.indexOf(profile.classYear)
    : 0;
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  const add = (row: Record<string, any>) => {
    const key = milestoneKey(row as any);
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    rows.push({ roadmap_id: roadmap.id, ...row });
  };

  for (const t of templateMilestones) {
    if (t.gapCompetencyId != null) {
      // weak competency (rated 1 or 2) -> targeted milestone
      if (!weak.has(t.gapCompetencyId)) continue;
    } else if (CLASS_YEARS.indexOf(t.classYear) < currentYear) {
      // only the remaining class years
      continue;
    }
    add({
      template_milestone_id: t.id,
      course_id: t.courseId,
      category: t.category,
      class_year: t.classYear,
      name: t.name,
      description: t.description,
      source: t.gapCompetencyId != null ? "GAP" : "TEMPLATE",
      competency_ids: t.competencyIds,
      status: "PENDING",
    });
  }

  // Course milestones carry their mapped skills (REQ-ROAD-7) and are ticked
  // off for courses the student has completed.
  for (const c of courses) {
    const done = history.get(c.courseId) === "COMPLETED";
    add({
      template_milestone_id: null,
      course_id: c.courseId,
      category: "COURSE",
      class_year: classYearForCourse(c.courseCode),
      name: `Complete ${c.courseCode}`,
      description: c.skills.length
        ? `${c.courseName}. Skills: ${c.skills.join(", ")}.`
        : `${c.courseName}.`,
      source: "COURSE",
      competency_ids: c.competencies.map((x) => x.id),
      status: done ? "COMPLETE" : "PENDING",
      completed_at: done ? now : null,
    });
  }

  for (const group of chunk(rows, 500)) {
    const { error } = await supabase.from("student_milestones").insert(group);
    if (error) throw new Error(error.message);
  }

  return getRoadmapPayload(studentId);
}

export async function getRoadmapPayload(
  studentId: number,
): Promise<RoadmapPayload> {
  const roadmap = await findRoadmap(studentId);
  if (!roadmap) return buildRoadmap(studentId);

  const [profile, competencies, rows, assessment] = await Promise.all([
    getStudentProfile(studentId),
    getCompetencies(),
    getMilestoneRows(roadmap.id),
    supabase
      .from("student_assessments")
      .select("completed_at")
      .eq("student_id", studentId)
      .order("completed_at", { ascending: false })
      .limit(1),
  ]);

  const lookup = new Map(competencies.map((c) => [c.id, c]));
  const milestones = rows.map((r) => toMilestone(r, lookup));

  return {
    profile,
    roadmap: {
      id: roadmap.id as number,
      templateName: (roadmap.roadmap_templates?.name ?? null) as string | null,
      usesDefaultTemplate: roadmap.roadmap_templates?.major_id == null,
      generatedAt: roadmap.generated_at as string,
    },
    lastAssessmentAt: (assessment.data?.[0]?.completed_at ?? null) as
      | string
      | null,
    milestones,
    progress: computeProgress(milestones),
  };
}

export async function getProgressForStudent(studentId: number) {
  const roadmap = await findRoadmap(studentId);
  const rows = roadmap ? await getMilestoneRows(roadmap.id) : [];
  return computeProgress(rows);
}

export class NotFoundError extends Error {}

// PUT /api/milestones/:id. Milestones can be completed in any order.
export async function setMilestoneStatus(
  studentId: number,
  milestoneId: number,
  status: MilestoneStatus,
) {
  const roadmap = await findRoadmap(studentId);
  if (!roadmap) throw new NotFoundError("Milestone not found");

  const rows = await getMilestoneRows(roadmap.id);
  const target = rows.find((r) => r.id === milestoneId);
  if (!target) throw new NotFoundError("Milestone not found");

  const before = computeProgress(rows).overall;

  const { data, error } = await supabase
    .from("student_milestones")
    .update({
      status,
      completed_at: status === "COMPLETE" ? new Date().toISOString() : null,
    })
    .eq("id", milestoneId)
    .eq("roadmap_id", roadmap.id)
    .select(MILESTONE_COLUMNS)
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not update milestone");

  // Keep course history in step so a regenerate keeps the course ticked.
  if (target.course_id && target.category === "COURSE") {
    try {
      if (status === "COMPLETE") {
        await saveCourseHistory(studentId, [
          { courseId: target.course_id, status: "COMPLETED" },
        ]);
      } else {
        await supabase
          .from("student_course_history")
          .delete()
          .eq("student_id", studentId)
          .eq("course_id", target.course_id)
          .eq("status", "COMPLETED");
      }
    } catch (e) {
      console.error("Failed to sync course history:", e);
    }
  }

  const updatedRows = rows.map((r) => (r.id === milestoneId ? data : r));
  const progress = computeProgress(updatedRows);
  const lookup = new Map((await getCompetencies()).map((c) => [c.id, c]));

  return {
    milestone: toMilestone(data, lookup),
    progress,
    crossedThreshold:
      status === "COMPLETE" ? crossedThreshold(before, progress.overall) : null,
  };
}

const EXPERIENCE_CATEGORY: Record<string, Category> = {
  INTERNSHIP: "EXPERIENCE",
  JOB: "EXPERIENCE",
  CERT: "CERT",
  PROJECT: "SKILL",
};

// Experience the student already has becomes completed milestones. An
// internship also completes the roadmap's internship milestones.
export async function addExperienceMilestones(
  studentId: number,
  experience: Array<{ kind: string; title: string }>,
) {
  if (experience.length === 0) return;

  const roadmap = await findRoadmap(studentId);
  if (!roadmap) return;
  const profile = await getStudentProfile(studentId);
  const rows = await getMilestoneRows(roadmap.id);
  const keys = new Set(rows.map(milestoneKey));
  const now = new Date().toISOString();

  const inserts = experience
    .map((e) => ({
      roadmap_id: roadmap.id,
      category: EXPERIENCE_CATEGORY[e.kind] ?? "EXPERIENCE",
      class_year: profile.classYear ?? "FIRST",
      name: e.title.trim().slice(0, 150),
      description: "Added from your skill assessment.",
      source: "EXPERIENCE",
      competency_ids: [],
      status: "COMPLETE",
      completed_at: now,
    }))
    .filter((r) => {
      const key = milestoneKey(r);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });

  if (inserts.length > 0) {
    const { error } = await supabase.from("student_milestones").insert(inserts);
    if (error) throw new Error(error.message);
  }

  if (experience.some((e) => e.kind === "INTERNSHIP")) {
    const { error } = await supabase
      .from("student_milestones")
      .update({ status: "COMPLETE", completed_at: now })
      .eq("roadmap_id", roadmap.id)
      .eq("category", "EXPERIENCE")
      .eq("status", "PENDING")
      .ilike("name", "%internship%");
    if (error) throw new Error(error.message);
  }
}

// The assessment is the source of truth for coursework: courses it says are
// not completed go back to pending so the next build re-checks them.
export async function reopenCourseMilestones(
  studentId: number,
  courseIds: number[],
) {
  const roadmap = await findRoadmap(studentId);
  if (!roadmap || courseIds.length === 0) return;

  for (const ids of chunk(courseIds)) {
    const { error } = await supabase
      .from("student_milestones")
      .update({ status: "PENDING", completed_at: null })
      .eq("roadmap_id", roadmap.id)
      .eq("category", "COURSE")
      .in("course_id", ids);
    if (error) throw new Error(error.message);
  }
}
