// What a student picked for resume generation (REQ-RES-1): courses,
// saved projects and career goals. The browser sends only ids and goal
// text; the course skills and project details are looked up here, so the
// AI prompt is built from data the server controls.
import { supabase } from "../Database/supabaseClient.js";
import { getMappingsForCourseIds } from "./CourseSkillMappingModel.js";
import { getProjectsByIds } from "./StudentProjectsModel.js";

export type GenerationMode = "skills" | "talkingPoints";

export const RESUME_LIMITS = {
  maxCourses: 30,
  maxProjects: 10,
  maxGoals: 3,
  goal: 150, // same limit as the career goal on the assessment profile
};

export type ResumeRequest = {
  mode: GenerationMode;
  courseIds: number[];
  projectIds: number[];
  careerGoals: string[];
};

// One headed section of the AI output. The label is the header the AI is
// told to use, so the frontend can tell which course or project each
// group of bullets belongs to.
export type ResumeSection =
  | { kind: "course"; label: string; courseId: number; courseCode: string; courseName: string }
  | { kind: "project"; label: string; projectId: number; title: string };

type CourseBlock = { label: string; skills: string[] };
type ProjectBlock = { label: string; description: string | null; skills: string[] };

export type ResumeInput = {
  courses: CourseBlock[];
  projects: ProjectBlock[];
  careerGoals: string[];
  sections: ResumeSection[];
};

const idList = (value: unknown, max: number, what: string) => {
  if (value == null) return { ids: [] as number[] };
  if (!Array.isArray(value)) return { error: `${what} must be a list.` };
  const ids = [...new Set(value.map(Number))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0))
    return { error: `${what} contains an invalid id.` };
  if (ids.length > max) return { error: `Pick up to ${max} ${what.toLowerCase()}.` };
  return { ids };
};

export function parseResumeRequest(
  body: unknown,
): { request: ResumeRequest } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const mode: GenerationMode = b.mode === "talkingPoints" ? "talkingPoints" : "skills";

  const courses = idList(b.courseIds, RESUME_LIMITS.maxCourses, "Classes");
  if ("error" in courses) return { error: courses.error! };
  const projects = idList(b.projectIds, RESUME_LIMITS.maxProjects, "Projects");
  if ("error" in projects) return { error: projects.error! };

  const rawGoals = b.careerGoals ?? [];
  if (!Array.isArray(rawGoals) || rawGoals.some((g) => typeof g !== "string"))
    return { error: "Career goals must be a list of text." };
  const careerGoals = [
    ...new Set((rawGoals as string[]).map((g) => g.trim().replace(/\s+/g, " ")).filter(Boolean)),
  ];
  if (careerGoals.length > RESUME_LIMITS.maxGoals)
    return { error: `Enter up to ${RESUME_LIMITS.maxGoals} career goals.` };
  if (careerGoals.some((g) => g.length > RESUME_LIMITS.goal))
    return { error: `Keep each career goal under ${RESUME_LIMITS.goal} characters.` };

  if (courses.ids!.length === 0 && projects.ids!.length === 0)
    return { error: "Select at least one class or project." };

  return {
    request: { mode, courseIds: courses.ids!, projectIds: projects.ids!, careerGoals },
  };
}

// Header text the AI can repeat back exactly: letters, digits, spaces and
// a few safe symbols, no colons or newlines.
const toLabel = (text: string) =>
  text.replace(/[^A-Za-z0-9 &+#.\-/]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export async function loadResumeInput(
  studentId: number,
  request: ResumeRequest,
): Promise<ResumeInput> {
  const sections: ResumeSection[] = [];
  const used = new Set<string>();
  const unique = (base: string) => {
    let label = base || "Project";
    for (let n = 2; used.has(label.toLowerCase()); n++) label = `${base} ${n}`;
    used.add(label.toLowerCase());
    return label;
  };

  // Courses, in the order picked; a course with no mapped skills is left out.
  const courses: CourseBlock[] = [];
  if (request.courseIds.length > 0) {
    const [{ data, error }, mappings] = await Promise.all([
      supabase
        .from("courses")
        .select("course_id, course_code, course_name, course_name_alt")
        .in("course_id", request.courseIds),
      getMappingsForCourseIds(request.courseIds),
    ]);
    if (error) throw new Error(error.message);
    const byId = new Map((data ?? []).map((r: any) => [r.course_id as number, r]));

    for (const id of request.courseIds) {
      const row = byId.get(id);
      const mapped = mappings.get(id);
      if (!row || !mapped) continue;
      const skills = [...new Set([...mapped.skills, ...mapped.competencies])];
      if (skills.length === 0) continue;

      const code = String(row.course_code ?? "").trim();
      const name = String(row.course_name || row.course_name_alt || code).trim();
      const label = unique(toLabel(code) || toLabel(name));
      courses.push({ label, skills });
      sections.push({ kind: "course", label, courseId: id, courseCode: code, courseName: name });
    }
  }

  // Projects: only this student's, so another student's ids are ignored.
  const projects: ProjectBlock[] = [];
  for (const p of await getProjectsByIds(studentId, request.projectIds)) {
    const label = unique(toLabel(p.title));
    projects.push({
      label,
      description: p.description ? oneLine(p.description) : null,
      skills: p.skills.map(oneLine),
    });
    sections.push({ kind: "project", label, projectId: p.id, title: p.title });
  }

  return { courses, projects, careerGoals: request.careerGoals, sections };
}

function inputBlocks(input: ResumeInput) {
  const blocks: string[] = [];
  for (const c of input.courses) {
    blocks.push(`Course: ${c.label}\n${c.skills.map((s) => `- ${s}`).join("\n")}`);
  }
  for (const p of input.projects) {
    const lines = [`Project: ${p.label}`];
    if (p.description) lines.push(`Description: ${p.description}`);
    if (p.skills.length > 0) lines.push(`Tools and skills used: ${p.skills.join(", ")}`);
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

function goalLine(goals: string[]) {
  if (goals.length === 0) return "";
  return `\nThe student's career goal${goals.length > 1 ? "s are" : " is"}: ${goals.join("; ")}.
Where it is accurate, choose wording, verbs and emphasis that are relevant to ${
    goals.length > 1 ? "these goals" : "this goal"
  }. Never invent experience, employers, numbers or results that were not given.\n`;
}

const headerRule = `Start each section with its label exactly as written after "Course:" or "Project:" above, followed by a colon, on its own line (for example "SER 491:"). Use the labels exactly once each, in the same order.`;

export function buildResumePrompt(input: ResumeInput) {
  return `Act as a professional resume writer.
I will provide skills learned in university courses and projects the student worked on.
Transform these into strong, action-oriented resume bullet points.

${inputBlocks(input)}
${goalLine(input.careerGoals)}
Requirements:
1. ${headerRule}
2. Under each course, list 2-4 bullet points using strong action verbs (e.g., Engineered, Orchestrated, Developed).
3. Under each project, list 2-3 bullet points describing what the student built or did, based only on the description and tools given.
4. Consolidate related skills within the same section where appropriate.
5. Begin each bullet point with a dash (-) on its own line.
6. Do not include any markdown formatting.
7. Return plain text only, with section headers followed by bullet points on new lines.
`;
}

export function buildTalkingPointsPrompt(input: ResumeInput) {
  return `Act as a technical interview coach.

I will provide skills learned in university courses and projects the student worked on.
Transform them into interview-ready talking points that a student can say out loud.

${inputBlocks(input)}
${goalLine(input.careerGoals)}
Requirements:
1. ${headerRule}
2. For each course skill provided, generate EXACTLY ONE talking point. Do NOT combine skills together, and do NOT create multiple talking points for a single skill.
3. For each project, generate 2-3 talking points about what the student built, the tools they used and what they learned, based only on what was given.
4. Each talking point must be on its own new line and begin with a dash (-).
5. Write each talking point in first-person language (e.g., "I built...", "I implemented...", "I worked with...").
6. Each talking point should clearly explain what was done, reference tools, technologies, or concepts when possible, and sound natural for an interview response.
7. Keep each talking point concise (1-2 sentences max).
8. Do not include markdown formatting.
9. Return plain text only.

Strict Rule:
- If a course has N skills listed, you must return exactly N talking points for that course.
`;
}
