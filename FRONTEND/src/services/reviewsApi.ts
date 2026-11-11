// Faculty/advisor skill reviews: faculty rate students, students read them.
import { apiClient } from "./apiClient";
import type { ClassYear, Competency } from "../career/careerData";

export interface Reviewer {
  id: number;
  name: string;
  email: string;
}

export interface ReviewStudent {
  id: number;
  name: string;
  email: string;
  major: string | null;
  classYear: ClassYear | null;
}

export interface SkillReview {
  id: number;
  ratings: Record<string, number>; // competency id -> 1..4
  comment: string | null;
  reviewedAt: string;
}

export interface StudentReview extends SkillReview {
  reviewer: Reviewer;
}

export interface FacultyReview extends SkillReview {
  student: ReviewStudent;
}

// --- student ---
export const getMyReviews = () =>
  apiClient<{
    reviews: StudentReview[];
    competencies: Competency[];
    selfRatings: Record<string, number>;
  }>("/api/reviews");

// --- faculty ---
export const getFacultyReviews = () =>
  apiClient<{ reviews: FacultyReview[]; competencies: Competency[] }>(
    "/api/faculty/reviews",
  );

// No query: the students in your majors. With a query: a search of all students.
export const findStudents = (q = "") =>
  apiClient<{ students: ReviewStudent[]; majors: string[] }>(
    `/api/faculty/reviews/students${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );

export const saveFacultyReview = (
  studentId: number,
  ratings: Record<string, number>,
  comment: string,
) =>
  apiClient<SkillReview>(`/api/faculty/reviews/students/${studentId}`, {
    method: "PUT",
    body: JSON.stringify({ ratings, comment }),
  });

// --- faculty favorites ("My advisees") ---
export const getFavorites = () =>
  apiClient<{ students: ReviewStudent[] }>("/api/faculty/reviews/favorites");

export const starStudent = (studentId: number) =>
  apiClient<{ student: ReviewStudent }>(`/api/faculty/reviews/favorites/${studentId}`, {
    method: "PUT",
  });

export const unstarStudent = (studentId: number) =>
  apiClient<object>(`/api/faculty/reviews/favorites/${studentId}`, { method: "DELETE" });
