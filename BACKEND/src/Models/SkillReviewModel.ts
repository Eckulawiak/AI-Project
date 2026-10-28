import { supabase } from "../Database/supabaseClient.js";
import { getCompetencies } from "./RoadmapModel.js";

// Faculty/advisor review of a student's career skills. The student invites
// a faculty member, who rates each competency 1..4 from what they've seen.
//
// TEMPORARY: reviews are kept in server memory (lost on restart) until the
// skill_reviews table from migrations/faculty_skill_reviews.sql is added to
// the database. Faculty and student names still come from the real tables.
// Each student starts with one sample review so the page has something to
// show.

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

type StoredReview = SkillReview & { studentId: number; facultyId: number };

const store: StoredReview[] = [];
let nextId = 1;

// A made-up reviewer for the sample review; not a real faculty_admin row.
const SAMPLE_REVIEWER: Reviewer = {
  id: -1,
  name: "Prof. Dana Smith (sample)",
  email: "sample.reviewer@quinnipiac.edu",
};
const seededStudents = new Set<number>();

async function seedSample(studentId: number) {
  if (seededStudents.has(studentId)) return;
  seededStudents.add(studentId);
  const sampleScores = [3, 3, 4, 4, 2, 4, 3, 2];
  const ratings = Object.fromEntries(
    (await getCompetencies()).map((c, i) => [String(c.id), sampleScores[i % 8] ?? 3]),
  );
  store.push({
    id: nextId++,
    studentId,
    facultyId: SAMPLE_REVIEWER.id,
    status: "COMPLETE",
    ratings,
    comment:
      "This is a sample review. Strong writer who asks sharp questions in class; I'd like to see more leadership in group projects.",
    requestedAt: new Date(Date.now() - 14 * 864e5).toISOString(),
    completedAt: new Date(Date.now() - 3 * 864e5).toISOString(),
  });
}

const toReview = ({ studentId: _s, facultyId: _f, ...r }: StoredReview): SkillReview => ({
  ...r,
});

const fullName = (row: any) =>
  [row?.firstname, row?.lastname].filter(Boolean).join(" ").trim();

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

async function getReviewers(ids: number[]): Promise<Map<number, Reviewer>> {
  const real = ids.filter((id) => id > 0);
  const map = new Map<number, Reviewer>([[SAMPLE_REVIEWER.id, SAMPLE_REVIEWER]]);
  if (real.length === 0) return map;

  const { data, error } = await supabase
    .from("faculty_admin")
    .select("faculty_id, faculty_qu_email, firstname, lastname")
    .in("faculty_id", real);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    map.set(r.faculty_id, {
      id: r.faculty_id,
      name: fullName(r) || r.faculty_qu_email,
      email: r.faculty_qu_email,
    });
  }
  return map;
}

export async function getReviewsForStudent(studentId: number) {
  await seedSample(studentId);
  const mine = store
    .filter((r) => r.studentId === studentId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const reviewers = await getReviewers(mine.map((r) => r.facultyId));

  return mine.map((r) => ({
    ...toReview(r),
    reviewer: reviewers.get(r.facultyId) ?? { id: r.facultyId, name: "Faculty member", email: "" },
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

  if (store.some((r) => r.studentId === studentId && r.facultyId === facultyId))
    throw new ReviewError("You've already invited this person.", 409);

  store.push({
    id: nextId++,
    studentId,
    facultyId,
    status: "PENDING",
    ratings: {},
    comment: null,
    requestedAt: new Date().toISOString(),
    completedAt: null,
  });
}

// A student can withdraw an invitation that hasn't been answered yet.
export async function cancelInvite(studentId: number, reviewId: number) {
  const i = store.findIndex(
    (r) => r.id === reviewId && r.studentId === studentId && r.status === "PENDING",
  );
  if (i === -1) throw new ReviewError("Invitation not found", 404);
  store.splice(i, 1);
}

// ---------------------------------------------------------------------
// Faculty side
// ---------------------------------------------------------------------

export async function getReviewsForFaculty(facultyId: number) {
  const mine = store
    .filter((r) => r.facultyId === facultyId)
    .sort(
      (a, b) =>
        Number(a.status === "COMPLETE") - Number(b.status === "COMPLETE") ||
        b.requestedAt.localeCompare(a.requestedAt),
    );
  if (mine.length === 0) return [];

  const { data, error } = await supabase
    .from("student")
    .select("student_id, firstname, lastname, student_qu_email, class_year, major, majors(name)")
    .in("student_id", [...new Set(mine.map((r) => r.studentId))]);
  if (error) throw new Error(error.message);
  const students = new Map((data ?? []).map((s: any) => [s.student_id, s]));

  return mine.map((r) => {
    const s: any = students.get(r.studentId);
    return {
      ...toReview(r),
      student: {
        name: fullName(s) || s?.student_qu_email || "",
        email: s?.student_qu_email ?? "",
        major: s?.majors?.name ?? s?.major ?? null,
        classYear: s?.class_year ?? null,
      },
    };
  });
}

export async function submitReview(
  facultyId: number,
  reviewId: number,
  ratings: Record<string, number>,
  comment: string | null,
) {
  const r = store.find((x) => x.id === reviewId && x.facultyId === facultyId);
  if (!r) throw new ReviewError("Review not found", 404);
  Object.assign(r, {
    ratings,
    comment,
    status: "COMPLETE",
    completedAt: new Date().toISOString(),
  });
  return toReview(r);
}
