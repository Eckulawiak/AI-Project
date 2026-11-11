import { supabase } from "../Database/supabaseClient.js";
import { resolveTemplateGap } from "./TemplateGapsModel.js";
import { chunk, fetchAllPages, getCoursesByIds } from "./CoursesModel.js";
import { getMappingsForCourseIds } from "./CourseSkillMappingModel.js";
import { getAllSkillsAndCompetencies } from "./SkillsModel.js";
import {
  certWays,
  courseWays,
  internshipWays,
  normalizeSkill,
  skillWays,
  suggestForCareerGoal,
} from "./AiSuggestionsModel.js";
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
  | "CUSTOM"
  | "AI" // suggested by AI from the career goal
  | "COURSE_SKILL"; // a skill taught in a required course not yet completed

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
  component: string | null;
  resources: string[];
  required: boolean; // optional milestones don't count toward progress
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
  "id, template_milestone_id, course_id, category, class_year, name, description, status, source, competency_ids, component, resources, required, completed_at, courses(course_code)";

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
      major: major.name, // legacy text column the talking-points tool still reads
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

// The courses a major's roadmap and assessment use: only the ones every
// student in the major takes (major_courses REQUIRED). Electives and
// pick-one courses are left out, and a major with no requirements listed
// gets no course milestones rather than every course in its subject.
export async function getRoadmapCoursesForMajor(
  majorId: number,
  competencies: Competency[],
): Promise<RoadmapCourse[]> {
  const courseIds = (
    await fetchAllPages<{ course_id: number }>((from, to) =>
      supabase
        .from("major_courses")
        .select("course_id")
        .eq("major_id", majorId)
        .eq("requirement_type", "REQUIRED")
        .order("course_id", { ascending: true })
        .range(from, to),
    )
  ).map((r) => r.course_id);

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
      "id, category, class_year, name, description, course_id, gap_competency_id, component, resources, position, required, template_milestone_competencies(competency_id)",
    )
    .eq("template_id", templateId)
    .order("position", { ascending: true, nullsFirst: false })
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
    component: (t.component ?? null) as string | null,
    resources: (t.resources ?? []) as string[],
    required: t.required !== false,
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
    .select(
      "id, template_id, generated_at, roadmap_templates(name, school_id, major_id)",
    )
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

// Every card gets a "ways to complete" list. Rows saved without one (older
// roadmaps, template milestones with no details, experience from the
// assessment) get one from their category.
function waysToComplete(row: any, careerGoal: string | null): string[] {
  const saved = (row.resources ?? []) as string[];
  if (saved.length > 0) return saved;
  const name = String(row.name ?? "");
  switch (row.category) {
    case "COURSE": {
      const code = row.courses?.course_code;
      return code ? courseWays(code) : ["Register for this course during your registration window"];
    }
    case "CERT":
      return certWays(name.replace(/^(earn|get|complete)\s+(the\s+|a\s+|an\s+)?/i, ""));
    case "EXPERIENCE":
      return /intern/i.test(name)
        ? internshipWays(careerGoal?.trim() || "internship")
        : [
            "Find openings through Handshake and Career Development",
            ...internshipWays(careerGoal?.trim() || name).slice(0, 1),
          ];
    case "SKILL":
      return skillWays(name);
    default:
      return [
        "Book a meeting with Career Development through Handshake: https://app.joinhandshake.com",
      ];
  }
}

function toMilestone(
  row: any,
  lookup: Map<number, Competency>,
  careerGoal: string | null = null,
): Milestone {
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
    component: row.component ?? null,
    resources: waysToComplete(row, careerGoal),
    required: row.required !== false,
    completedAt: row.completed_at ?? null,
  };
}

// Identity of a milestone across regenerations, so a completed one is never
// added a second time. A course counts once even when a template lists it
// in several years or the major also requires it.
function milestoneKey(row: {
  template_milestone_id?: number | null;
  course_id?: number | null;
  source?: string;
  name: string;
}) {
  if (row.course_id) return `c:${row.course_id}`;
  if (row.template_milestone_id) return `t:${row.template_milestone_id}`;
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
// completed milestones are kept as history (REQ-ROAD-4). With fresh (a
// retaken assessment) every milestone is removed first, so nothing from the
// old roadmap carries over; courses the student marked completed come back
// already checked off.
export async function buildRoadmap(
  studentId: number,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<RoadmapPayload> {
  const profile = await getStudentProfile(studentId);
  const competencies = await getCompetencies();

  const { template, level } = await selectTemplate(profile);
  // School templates (like the School of Communications framework) cover
  // their majors; only the university fallback is a gap (REQ-ROAD-9). A
  // major or school template closes any gap left from before it existed.
  if (level !== "MAJOR" && level !== "SCHOOL") await recordTemplateGap(profile);
  else if (profile.majorId != null)
    await resolveTemplateGap(profile.majorId, profile.goalType ?? "INDUSTRY");

  const courses =
    profile.majorId != null
      ? await getRoadmapCoursesForMajor(profile.majorId, competencies)
      : [];
  const history = await getCourseHistory(studentId);

  // AI suggestions from the career goal only. They must not repeat any
  // skill the major's courses already teach. null = AI unavailable.
  const courseSkills = [...new Set(courses.flatMap((c) => c.skills))];
  const ai = profile.careerGoal?.trim()
    ? await suggestForCareerGoal({
        careerGoal: profile.careerGoal,
        goalType: profile.goalType,
        courseSkills,
        earliestYear: profile.classYear ?? "FIRST",
      }).catch((e) => {
        console.error("AI roadmap suggestions failed:", e);
        return null;
      })
    : [];

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

  let toDelete = supabase
    .from("student_milestones")
    .delete()
    .eq("roadmap_id", roadmap.id);
  if (!fresh) toDelete = toDelete.eq("status", "PENDING");
  // If the AI is down, keep the suggestions it made last time (REQ-PERF-6).
  if (!fresh && ai === null) toDelete = toDelete.neq("source", "AI");
  const { error: deleteError } = await toDelete;
  if (deleteError) throw new Error(deleteError.message);

  const [kept, templateMilestones, weak] = await Promise.all([
    getMilestoneRows(roadmap.id),
    template ? getTemplateMilestones(template.id) : Promise.resolve([]),
    getWeakCompetencyIds(studentId),
  ]);

  // Weak-competency milestones come from the university default when the
  // chosen template has none of its own.
  if (
    level !== "UNIVERSITY" &&
    !templateMilestones.some((t) => t.gapCompetencyId != null)
  ) {
    const fallback = await selectTemplate({
      ...profile,
      schoolId: null,
      majorId: null,
    });
    if (fallback.template) {
      const gaps = (await getTemplateMilestones(fallback.template.id)).filter(
        (t) => t.gapCompetencyId != null,
      );
      templateMilestones.push(...gaps);
    }
  }

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
    const done = t.courseId != null && history.get(t.courseId) === "COMPLETED";
    add({
      template_milestone_id: t.id,
      course_id: t.courseId,
      category: t.category,
      class_year: t.classYear,
      name: t.name,
      description: t.description,
      source: t.gapCompetencyId != null ? "GAP" : "TEMPLATE",
      competency_ids: t.competencyIds,
      component: t.component,
      resources: t.resources,
      // suggestions for a low self-rating are always optional
      required: t.gapCompetencyId == null && t.required,
      status: done ? "COMPLETE" : "PENDING",
      completed_at: done ? now : null,
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
      component: null,
      resources: courseWays(c.courseCode, c.courseName),
      required: true, // major requirements
      status: done ? "COMPLETE" : "PENDING",
      completed_at: done ? now : null,
    });
  }

  // Skills track: the skills taught in required courses the student hasn't
  // completed yet, one card per skill, in the year of its earliest course.
  for (const s of courseSkillMilestones(courses, history)) {
    add({
      template_milestone_id: null,
      course_id: null, // keyed by name; the course has its own card
      category: "SKILL",
      class_year: s.classYear,
      name: s.name,
      description: `Taught in ${s.courses.map((c) => c.courseCode).join(", ")}.`,
      source: "COURSE_SKILL",
      competency_ids: s.competencyIds,
      component: null,
      resources: s.courses.flatMap((c, i) =>
        courseWays(c.courseCode, c.courseName).slice(0, i === 0 ? 2 : 1),
      ),
      required: true,
      status: "PENDING",
      completed_at: null,
    });
  }

  // AI suggestions are optional: they change when the goal changes, so
  // they never hold back progress, and the student should review them
  // (REQ-SAFE-1).
  for (const s of ai ?? []) {
    add({
      template_milestone_id: null,
      course_id: null,
      category: s.category,
      class_year: s.classYear,
      name: s.name,
      description: s.description,
      source: "AI",
      competency_ids: [],
      component: null,
      resources: s.resources,
      required: false,
      status: "PENDING",
      completed_at: null,
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
  const milestones = rows.map((r) => toMilestone(r, lookup, profile.careerGoal));

  return {
    profile,
    roadmap: {
      id: roadmap.id as number,
      templateName: (roadmap.roadmap_templates?.name ?? null) as string | null,
      // Only the university fallback counts as the general roadmap; a school
      // template is built for the student's school.
      usesDefaultTemplate:
        roadmap.roadmap_templates?.school_id == null &&
        roadmap.roadmap_templates?.major_id == null,
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

  // A course's skill cards follow the course.
  let updatedRows = rows.map((r) => (r.id === milestoneId ? data : r));
  if (target.course_id && target.category === "COURSE") {
    try {
      updatedRows = await syncCourseSkills(
        studentId,
        roadmap.id,
        target.course_id,
        status,
        updatedRows,
      );
    } catch (e) {
      console.error("Failed to sync course skills:", e);
    }
  }
  const progress = computeProgress(updatedRows);
  const lookup = new Map((await getCompetencies()).map((c) => [c.id, c]));

  const statusBefore = new Map(rows.map((r) => [r.id, r.status]));
  const related = updatedRows
    .filter((r) => r.id !== milestoneId && statusBefore.get(r.id) !== r.status)
    .map((r) => toMilestone(r, lookup));

  return {
    milestone: toMilestone(data, lookup),
    related, // other cards that changed with it (a course's skills)
    progress,
    crossedThreshold:
      status === "COMPLETE" ? crossedThreshold(before, progress.overall) : null,
  };
}

// Skill cards for courses not completed yet. A skill several courses teach
// gets one card listing all of them; skills a completed course already
// covers are left out.
export function courseSkillMilestones(
  courses: RoadmapCourse[],
  history: Map<number, string>,
) {
  const covered = new Set(
    courses
      .filter((c) => history.get(c.courseId) === "COMPLETED")
      .flatMap((c) => c.skills.map(normalizeSkill)),
  );
  const bySkill = new Map<
    string,
    { name: string; courses: RoadmapCourse[]; competencyIds: Set<number> }
  >();
  for (const c of courses) {
    if (history.get(c.courseId) === "COMPLETED") continue;
    for (const skill of c.skills) {
      const key = normalizeSkill(skill);
      if (!key || covered.has(key)) continue;
      const entry = bySkill.get(key) ?? {
        name: skill.trim(),
        courses: [],
        competencyIds: new Set<number>(),
      };
      entry.courses.push(c);
      c.competencies.forEach((x) => entry.competencyIds.add(x.id));
      bySkill.set(key, entry);
    }
  }
  return [...bySkill.values()].map((s) => {
    const years = s.courses.map((c) =>
      CLASS_YEARS.indexOf(classYearForCourse(c.courseCode)),
    );
    return {
      name: s.name,
      courses: s.courses,
      competencyIds: [...s.competencyIds],
      classYear: CLASS_YEARS[Math.min(...years)]!,
    };
  });
}

// Completing a course completes the skill cards it teaches; un-completing
// it reopens the ones no other completed course covers.
async function syncCourseSkills(
  studentId: number,
  roadmapId: number,
  courseId: number,
  status: MilestoneStatus,
  rows: any[],
) {
  const mappings = await getMappingsForCourseIds([courseId]);
  const skills = new Set(
    (mappings.get(courseId)?.skills ?? []).map(normalizeSkill),
  );
  if (skills.size === 0) return rows;

  if (status === "PENDING") {
    const history = await getCourseHistory(studentId);
    const done = [...history]
      .filter(([, s]) => s === "COMPLETED")
      .map(([id]) => id);
    const others = await getMappingsForCourseIds(done);
    for (const m of others.values())
      m.skills.forEach((s) => skills.delete(normalizeSkill(s)));
  }

  const want = status === "COMPLETE" ? "PENDING" : "COMPLETE";
  const ids = rows
    .filter(
      (r) =>
        r.source === "COURSE_SKILL" &&
        r.status === want &&
        skills.has(normalizeSkill(r.name)),
    )
    .map((r) => r.id as number);
  if (ids.length === 0) return rows;

  const completedAt = status === "COMPLETE" ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("student_milestones")
    .update({ status, completed_at: completedAt })
    .eq("roadmap_id", roadmapId)
    .in("id", ids);
  if (error) throw new Error(error.message);

  const changed = new Set(ids);
  return rows.map((r) =>
    changed.has(r.id) ? { ...r, status, completed_at: completedAt } : r,
  );
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
      required: false, // extra experience, not part of the plan
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
