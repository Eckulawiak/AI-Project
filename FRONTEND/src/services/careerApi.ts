// Calls for the roadmap, milestones and skill assessment (SDS Table 3).
import { apiClient } from "./apiClient";
import type {
  Assessment,
  AssessmentOptions,
  AssessmentSubmission,
  MilestoneStatus,
  MilestoneUpdateResponse,
  Progress,
  RoadmapResponse,
} from "../career/careerData";

export const getRoadmap = () => apiClient<RoadmapResponse>("/api/roadmap/me");

export const regenerateRoadmap = () =>
  apiClient<RoadmapResponse>("/api/roadmap/regenerate", { method: "POST" });

export const setMilestoneStatus = (id: number, status: MilestoneStatus) =>
  apiClient<MilestoneUpdateResponse>(`/api/milestones/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });

export const getProgress = () => apiClient<Progress>("/api/milestones/progress");

export const getAssessmentOptions = (majorId?: number | null) =>
  apiClient<AssessmentOptions>(
    `/api/assessment/options${majorId ? `?majorId=${majorId}` : ""}`,
  );

export const getMyAssessment = () =>
  apiClient<Assessment | null>("/api/assessment/me");

export const submitAssessment = (body: AssessmentSubmission) =>
  apiClient<RoadmapResponse & { assessment: Assessment }>("/api/assessment", {
    method: "POST",
    body: JSON.stringify(body),
  });
