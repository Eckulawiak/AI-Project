import { supabase } from "../Database/supabaseClient.js";
import { getFacultyScope } from "./ProgressReportModel.js";

// Faculty/advisor review of a student's career skills. A faculty member
// picks a student and rates each competency 1..4 from what they've seen;
// the student sees the review on their Advisor Feedback page.

export type Reviewer = { id: number; name: string; email: string };

export type SkillReview = {
  id: number;
  ratings: Record<string, number>; // competency skill_id -> 1..4
  comment: string | null;
  reviewedAt: string;
};

export type ReviewStudent = {
  id: number;
  name: string;
  email: string;
  major: string | null;
  classYear: string | null;
};

const REVIEW_COLUMNS = "id, student_id, faculty_id, ratings, comment, completed_at";
export const STUDENT_COLUMNS =
  "student_id, firstname, lastname, student_qu_email, class_year, major, majors(name)";

const fullName = (row: any) =>
  [row?.firstname, row?.lastname].filter(Boolean).join(" ").trim();

function toReview(row: any): SkillReview {
  return {
    id: row.id,
    ratings: row.ratings ?? {},
    comment: row.comment ?? null,
    reviewedAt: row.completed_at,
  };
}

export function toStudent(row: any): ReviewStudent {
  return {
    id: row.student_id,
    name: fullName(row) || row.student_qu_email,
    email: row.student_qu_email ?? "",
    major: row.majors?.name ?? row.major ?? null,
    classYear: row.class_year ?? null,
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

export async function getReviewsForStudent(studentId: number) {
  const { data, error } = await supabase
    .from("skill_reviews")
    .select(
      `${REVIEW_COLUMNS}, faculty_admin(faculty_id, faculty_qu_email, firstname, lastname)`,
    )
    .eq("student_id", studentId)
    .eq("status", "COMPLETE")
    .order("completed_at", { ascending: false });
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

// ---------------------------------------------------------------------
// Faculty side
// ---------------------------------------------------------------------

// Students a faculty member can review. With a search, any student whose
// name or email matches; without one, the students in the majors they
// cover (assigned majors, or the majors of the courses they teach).
export async function findStudentsToReview(
  facultyId: number,
  query: string,
): Promise<{ students: ReviewStudent[]; majors: string[] }> {
  const q = query.trim().replace(/[%,()]/g, "");

  if (q.length >= 2) {
    const { data, error } = await supabase
      .from("student")
      .select(STUDENT_COLUMNS)
      .or(
        `firstname.ilike.%${q}%,lastname.ilike.%${q}%,student_qu_email.ilike.%${q}%`,
      )
      .order("lastname", { ascending: true })
      .limit(25);
    if (error) throw new Error(error.message);
    return { students: (data ?? []).map(toStudent), majors: [] };
  }

  const scope = await getFacultyScope(facultyId);
  if (scope.majors.length === 0) return { students: [], majors: [] };

  const { data, error } = await supabase
    .from("student")
    .select(STUDENT_COLUMNS)
    .in(
      "major_id",
      scope.majors.map((m) => m.id),
    )
    .order("lastname", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return {
    students: (data ?? []).map(toStudent),
    majors: scope.majors.map((m) => m.name),
  };
}

// Reviews this faculty member has written, newest first.
export async function getReviewsByFaculty(facultyId: number) {
  const { data, error } = await supabase
    .from("skill_reviews")
    .select(`${REVIEW_COLUMNS}, student(${STUDENT_COLUMNS})`)
    .eq("faculty_id", facultyId)
    .eq("status", "COMPLETE")
    .order("completed_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    ...toReview(r),
    student: toStudent(r.student ?? { student_id: r.student_id }),
  }));
}

// Create or update this faculty member's review of a student.
export async function saveReview(
  facultyId: number,
  studentId: number,
  ratings: Record<string, number>,
  comment: string | null,
) {
  const { data: student, error: studentError } = await supabase
    .from("student")
    .select("student_id")
    .eq("student_id", studentId)
    .maybeSingle();
  if (studentError) throw new Error(studentError.message);
  if (!student) throw new ReviewError("Student not found", 404);

  const { data, error } = await supabase
    .from("skill_reviews")
    .upsert(
      {
        student_id: studentId,
        faculty_id: facultyId,
        status: "COMPLETE",
        ratings,
        comment,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "student_id,faculty_id" },
    )
    .select(REVIEW_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save review");
  return toReview(data);
}
