// Admin editing of roadmap template milestones (see AdminMilestonesPage).
import { apiClient } from "./apiClient";
import type { Category, ClassYear } from "../career/careerData";

export interface RoadmapTemplate {
  id: number;
  name: string;
  schoolId: number | null;
  school: string | null;
  majorId: number | null;
  major: string | null;
  goalType: "INDUSTRY" | "GRAD" | "ANY";
  milestoneCount: number;
}

export interface Competency {
  id: number;
  name: string;
}

export interface TemplateMilestoneInput {
  category: Category;
  classYear: ClassYear;
  name: string;
  description: string | null;
  component: string | null;
  resources: string[];
  position: number | null;
  competencyIds: number[];
  gapCompetencyId: number | null;
}

export interface TemplateMilestone extends TemplateMilestoneInput {
  id: number;
  templateId: number;
  courseId: number | null;
}

export const getRoadmapTemplates = () =>
  apiClient<{ templates: RoadmapTemplate[]; competencies: Competency[] }>(
    "/api/admin/roadmap-templates",
  );

export const getTemplateMilestones = (templateId: number) =>
  apiClient<TemplateMilestone[]>(`/api/admin/roadmap-templates/${templateId}/milestones`);

export const createTemplateMilestone = (templateId: number, body: TemplateMilestoneInput) =>
  apiClient<{ id: number }>(`/api/admin/roadmap-templates/${templateId}/milestones`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateTemplateMilestone = (id: number, body: TemplateMilestoneInput) =>
  apiClient<{ id: number }>(`/api/admin/template-milestones/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const deleteTemplateMilestone = (id: number) =>
  apiClient<object>(`/api/admin/template-milestones/${id}`, { method: "DELETE" });
