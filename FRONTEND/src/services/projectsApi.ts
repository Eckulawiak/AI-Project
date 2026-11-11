// A student's saved projects and the resume generation request (REQ-RES-1).
import { apiClient } from "./apiClient";

export interface StudentProject {
  id: number;
  title: string;
  description: string | null;
  skills: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  title: string;
  description: string | null;
  skills: string[];
}

// Same limits the server checks.
export const PROJECT_LIMITS = { title: 120, description: 1000, maxSkills: 15, skill: 40 };
export const GOAL_LIMITS = { maxGoals: 3, goal: 150 };

export const getProjects = () => apiClient<StudentProject[]>("/api/projects");

export const createProject = (body: ProjectInput) =>
  apiClient<StudentProject>("/api/projects", { method: "POST", body: JSON.stringify(body) });

export const updateProject = (id: number, body: ProjectInput) =>
  apiClient<StudentProject>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const deleteProject = (id: number) =>
  apiClient<void>(`/api/projects/${id}`, { method: "DELETE" });

// --- generation ---

export type GenerationMode = "skills" | "talkingPoints";

export type ResumeSection =
  | { kind: "course"; label: string; courseId: number; courseCode: string; courseName: string }
  | { kind: "project"; label: string; projectId: number; title: string };

export interface ResumeRequest {
  mode: GenerationMode;
  courseIds: number[];
  projectIds: number[];
  careerGoals: string[];
}

export const generateResumeContent = (body: ResumeRequest) =>
  apiClient<{ text: string; sections: ResumeSection[] }>("/api/resume/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
