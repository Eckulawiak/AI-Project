// Student projects for the resume builder (REQ-RES-1). Every query is
// scoped to the signed-in student, so one student can never read or change
// another student's projects.
import { supabase } from "../Database/supabaseClient.js";

export const PROJECT_LIMITS = {
  maxProjects: 25,
  title: 120,
  description: 1000,
  maxSkills: 15,
  skill: 40,
};

export type StudentProject = {
  id: number;
  title: string;
  description: string | null;
  skills: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  title: string;
  description: string | null;
  skills: string[];
};

const COLUMNS = "id, title, description, skills, created_at, updated_at";

function toProject(row: any): StudentProject {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    skills: Array.isArray(row.skills) ? row.skills : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Returns the cleaned input, or an error message for the student.
export function parseProjectInput(
  body: unknown,
): { input: ProjectInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return { error: "Give your project a title." };
  if (title.length > PROJECT_LIMITS.title)
    return { error: `Keep the title under ${PROJECT_LIMITS.title} characters.` };

  if (b.description != null && typeof b.description !== "string")
    return { error: "Description must be text." };
  const description = (b.description as string | undefined)?.trim() || null;
  if (description && description.length > PROJECT_LIMITS.description)
    return {
      error: `Keep the description under ${PROJECT_LIMITS.description} characters.`,
    };

  const rawSkills = b.skills ?? [];
  if (!Array.isArray(rawSkills) || rawSkills.some((s) => typeof s !== "string"))
    return { error: "Skills must be a list of words or short phrases." };
  // trim, drop blanks and case-insensitive duplicates
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const raw of rawSkills as string[]) {
    const s = raw.trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    skills.push(s);
  }
  if (skills.length > PROJECT_LIMITS.maxSkills)
    return { error: `List up to ${PROJECT_LIMITS.maxSkills} skills.` };
  if (skills.some((s) => s.length > PROJECT_LIMITS.skill))
    return { error: `Keep each skill under ${PROJECT_LIMITS.skill} characters.` };

  return { input: { title, description, skills } };
}

export async function listProjects(studentId: number): Promise<StudentProject[]> {
  const { data, error } = await supabase
    .from("student_projects")
    .select(COLUMNS)
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toProject);
}

// Only the given student's projects, in the order asked for.
export async function getProjectsByIds(
  studentId: number,
  ids: number[],
): Promise<StudentProject[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("student_projects")
    .select(COLUMNS)
    .eq("student_id", studentId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map((data ?? []).map((r: any) => [r.id as number, toProject(r)]));
  return ids.map((id) => byId.get(id)).filter((p): p is StudentProject => !!p);
}

export async function countProjects(studentId: number): Promise<number> {
  const { count, error } = await supabase
    .from("student_projects")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function createProject(
  studentId: number,
  input: ProjectInput,
): Promise<StudentProject> {
  const { data, error } = await supabase
    .from("student_projects")
    .insert({ student_id: studentId, ...input })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toProject(data);
}

// null when the project doesn't exist or isn't this student's.
export async function updateProject(
  studentId: number,
  id: number,
  input: ProjectInput,
): Promise<StudentProject | null> {
  const { data, error } = await supabase
    .from("student_projects")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", studentId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toProject(data) : null;
}

export async function deleteProject(studentId: number, id: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("student_projects")
    .delete()
    .eq("id", id)
    .eq("student_id", studentId)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
