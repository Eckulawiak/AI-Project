// Faculty/advisor skill reviews: students invite, faculty rate.
import { apiClient } from "./apiClient";
import type { ClassYear, Competency } from "../career/careerData";

export type ReviewStatus = "PENDING" | "COMPLETE";

export interface Reviewer {
  id: number;
  name: string;
  email: string;
}

export interface SkillReview {
  id: number;
  status: ReviewStatus;
  ratings: Record<string, number>; // competency id -> 1..4
  comment: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface StudentReview extends SkillReview {
  reviewer: Reviewer;
}

export interface FacultyReview extends SkillReview {
  student: {
    name: string;
    email: string;
    major: string | null;
    classYear: ClassYear | null;
  };
}

// --- student ---
export const getMyReviews = () =>
  apiClient<{
    reviews: StudentReview[];
    competencies: Competency[];
    selfRatings: Record<string, number>;
  }>("/api/reviews");

export const searchReviewers = (q: string) =>
  apiClient<Reviewer[]>(`/api/reviews/reviewers?q=${encodeURIComponent(q)}`);

export const inviteReviewer = (facultyId: number) =>
  apiClient<StudentReview[]>("/api/reviews", {
    method: "POST",
    body: JSON.stringify({ facultyId }),
  });

export const cancelInvite = (id: number) =>
  apiClient<void>(`/api/reviews/${id}`, { method: "DELETE" });

// --- faculty ---
export const getFacultyReviews = () =>
  apiClient<{ reviews: FacultyReview[]; competencies: Competency[] }>(
    "/api/faculty/reviews",
  );

export const saveFacultyReview = (
  id: number,
  ratings: Record<string, number>,
  comment: string,
) =>
  apiClient<SkillReview>(`/api/faculty/reviews/${id}`, {
    method: "PUT",
    body: JSON.stringify({ ratings, comment }),
  });
