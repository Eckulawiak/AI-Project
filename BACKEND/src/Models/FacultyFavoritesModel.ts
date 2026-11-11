// Faculty favorite advisees: students a faculty member has starred on the
// Student Reviews page. Every query is scoped to the signed-in faculty
// member, so nobody can see or change another faculty member's list.
import { supabase } from "../Database/supabaseClient.js";
import {
  ReviewError,
  STUDENT_COLUMNS,
  toStudent,
  type ReviewStudent,
} from "./SkillReviewModel.js";

export const MAX_FAVORITES = 200;

// Favorites, sorted by last name like the other student lists.
export async function listFavorites(facultyId: number): Promise<ReviewStudent[]> {
  const { data, error } = await supabase
    .from("faculty_favorites")
    .select(`student_id, created_at, student(${STUDENT_COLUMNS})`)
    .eq("faculty_id", facultyId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((r: any) => r.student)
    .map((r: any) => ({ student: toStudent(r.student), last: r.student.lastname ?? "" }))
    .sort(
      (a, b) =>
        a.last.localeCompare(b.last, undefined, { sensitivity: "base" }) ||
        a.student.name.localeCompare(b.student.name),
    )
    .map((r) => r.student);
}

// Star a student. Starring someone already starred is fine (no duplicate).
export async function addFavorite(facultyId: number, studentId: number) {
  const { data: student, error: studentError } = await supabase
    .from("student")
    .select(STUDENT_COLUMNS)
    .eq("student_id", studentId)
    .maybeSingle();
  if (studentError) throw new Error(studentError.message);
  if (!student) throw new ReviewError("Student not found", 404);

  const { count, error: countError } = await supabase
    .from("faculty_favorites")
    .select("student_id", { count: "exact", head: true })
    .eq("faculty_id", facultyId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= MAX_FAVORITES) {
    // allow re-starring someone already on the list
    const { data: existing } = await supabase
      .from("faculty_favorites")
      .select("student_id")
      .eq("faculty_id", facultyId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (!existing)
      throw new ReviewError(
        `You can star up to ${MAX_FAVORITES} students. Unstar one to add another.`,
      );
  }

  const { error } = await supabase
    .from("faculty_favorites")
    .upsert(
      { faculty_id: facultyId, student_id: studentId },
      { onConflict: "faculty_id,student_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
  return toStudent(student);
}

// Unstar. Unstarring someone who isn't starred is fine too.
export async function removeFavorite(facultyId: number, studentId: number) {
  const { error } = await supabase
    .from("faculty_favorites")
    .delete()
    .eq("faculty_id", facultyId)
    .eq("student_id", studentId);
  if (error) throw new Error(error.message);
}
