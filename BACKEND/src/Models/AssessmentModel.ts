import { supabase } from "../Database/supabaseClient.js";

export type ExperienceKind = "INTERNSHIP" | "JOB" | "CERT" | "PROJECT";
export type ExperienceEntry = { kind: ExperienceKind; title: string };

export type Assessment = {
  id: number;
  ratings: Record<string, number>; // competency skill_id -> 1..4
  experience: ExperienceEntry[];
  completedAt: string;
};

function toAssessment(row: any): Assessment {
  return {
    id: row.id,
    ratings: row.ratings ?? {},
    experience: Array.isArray(row.experience) ? row.experience : [],
    completedAt: row.completed_at,
  };
}

export async function getLatestAssessment(
  studentId: number,
): Promise<Assessment | null> {
  const { data, error } = await supabase
    .from("student_assessments")
    .select("id, ratings, experience, completed_at")
    .eq("student_id", studentId)
    .order("completed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ? toAssessment(data[0]) : null;
}

export async function saveAssessment(
  studentId: number,
  ratings: Record<string, number>,
  experience: ExperienceEntry[],
): Promise<Assessment> {
  const { data, error } = await supabase
    .from("student_assessments")
    .insert({ student_id: studentId, ratings, experience })
    .select("id, ratings, experience, completed_at")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Could not save assessment");
  return toAssessment(data);
}
