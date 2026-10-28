import { supabase } from "../Database/supabaseClient.js";

// Faculty/advisor review of a student's career skills. The student invites
// a faculty member, who rates each competency 1..4 from what they've seen.

export type ReviewStatus = "PENDING" | "COMPLETE";

export type Reviewer = { id: number; name: string; email: string };

export type SkillReview = {
  id: number;
  status: ReviewStatus;
  ratings: Record<string, number>; // competency skill_id -> 1..4
  comment: string | null;
  requestedAt: string;
  completedAt: string | null;
};

const REVIEW_COLUMNS =
  "id, student_id, faculty_id, status, ratings, comment, requested_at, completed_at";

const fullName = (row: any) =>
  [row?.firstname, row?.lastname].filter(Boolean).join(" ").trim();

function toReview(row: any): SkillReview {
  return {
    id: row.id,
    status: row.status === "COMPLETE" ? "COMPLETE" : "PENDING",
    ratings: row.ratings ?? {},
    comment: row.comment ?? null,
    requestedAt: row.requested_at,
    completedAt: row.completed_at ?? null,
  };
}

export class ReviewError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------
// Student side
// ---------------------------------------------------------------------

// Faculty a student can invite, matched on name or email.
export async function searchReviewers(query: string): Promise<Reviewer[]> {
  const q = query.trim().replace(/[%,()]/g, "");
  if (q.length < 2) return [];

  const { data, error } = await supabase
    .from("faculty_admin")
    .select("faculty_id, faculty_qu_email, firstname, lastname")
    .or(
      `firstname.ilike.%${q}%,lastname.ilike.%${q}%,faculty_qu_email.ilike.%${q}%`,
    )
    .order("lastname", { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    id: r.faculty_id,
    name: fullName(r) || r.faculty_qu_email,
    email: r.faculty_qu_email,
  }));
}

export async function getReviewsForStudent(studentId: number) {
  const { data, error } = await supabase
    .from("skill_reviews")
    .select(
      `${REVIEW_COLUMNS}, faculty_admin(faculty_id, faculty_qu_email, firstname, lastname)`,
    )
    .eq("student_id", studentId)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    ...toReview(r),
    reviewer: {
      id: r.faculty_id,
      name: fullName(r.faculty_admin) || r.faculty_admin?.faculty_qu_email || "",
      email: r.faculty_admin?.faculty_qu_email ?? "",
    } as Reviewer,
  }));
}

export async function inviteReviewer(studentId: number, facultyId: number) {
  const { data: faculty, error: facultyError } = await supabase
    .from("faculty_admin")
    .select("faculty_id")
    .eq("faculty_id", facultyId)
    .maybeSingle();
  if (facultyError) throw new Error(facultyError.message);
  if (!faculty) throw new ReviewError("Faculty member not found", 404);

  const { data: existing, error: existingError } = await supabase
    .from("skill_reviews")
    .select("id")
    .eq("student_id", studentId)
    .eq("faculty_id", facultyId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing)
    throw new ReviewError("You've already invited this person.", 409);

  const { error } = await supabase
    .from("skill_reviews")
    .insert({ student_id: studentId, faculty_id: facultyId });
  if (error) throw new Error(error.message);
}

// A student can withdraw an invitation that hasn't been answered yet.
export async function cancelInvite(studentId: number, reviewId: number) {
  const { data, error } = await supabase
    .from("skill_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("student_id", studentId)
    .eq("status", "PENDING")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0)
    throw new ReviewError("Invitation not found", 404);
}

// ---------------------------------------------------------------------
// Faculty side
// ---------------------------------------------------------------------

export async function getReviewsForFaculty(facultyId: number) {
  const { data, error } = await supabase
    .from("skill_reviews")
    .select(
      `${REVIEW_COLUMNS}, student(student_id, firstname, lastname, student_qu_email, class_year, major, majors(name))`,
    )
    .eq("faculty_id", facultyId)
    .order("status", { ascending: false }) // PENDING before COMPLETE
    .order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    ...toReview(r),
    student: {
      name: fullName(r.student) || r.student?.student_qu_email || "",
      email: r.student?.student_qu_email ?? "",
      major: r.student?.majors?.name ?? r.student?.major ?? null,
      classYear: r.student?.class_year ?? null,
    },
  }));
}

export async function submitReview(
  facultyId: number,
  reviewId: number,
  ratings: Record<string, number>,
  comment: string | null,
) {
  const { data, error } = await supabase
    .from("skill_reviews")
    .update({
      ratings,
      comment,
      status: "COMPLETE",
      completed_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .eq("faculty_id", facultyId)
    .select(REVIEW_COLUMNS);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new ReviewError("Review not found", 404);
  return toReview(data[0]);
}
