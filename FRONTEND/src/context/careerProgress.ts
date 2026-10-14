// Types, helpers and the hook for the shared career-progress state.
// The provider component lives in CareerProgressContext.tsx.
import { createContext, useContext } from "react";
import {
  CATEGORIES,
  type AssessmentResult,
  type Category,
  type Milestone,
  type StudentProfile,
} from "../mock/careerData";

export const THRESHOLDS = [25, 50, 75, 100];

export interface Progress {
  overall: number;
  byCategory: Record<Category, { done: number; total: number; pct: number }>;
}

export interface CelebrationEvent {
  kind: "milestone" | "threshold";
  title: string;
  message: string;
  key: number;
}

export interface CareerProgressValue {
  profile: StudentProfile;
  milestones: Milestone[];
  assessment: AssessmentResult | null;
  progress: Progress;
  nextMilestones: Milestone[];
  toggleMilestone: (id: string) => void;
  applyAssessment: (result: AssessmentResult) => void;
  resetDemo: () => void;
  celebration: CelebrationEvent | null;
  dismissCelebration: () => void;
}

export function computeProgress(milestones: Milestone[]): Progress {
  const byCategory = {} as Progress["byCategory"];
  const pcts: number[] = [];
  for (const c of CATEGORIES) {
    const items = milestones.filter((x) => x.category === c.id);
    const done = items.filter((x) => x.status === "COMPLETE").length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    byCategory[c.id] = { done, total: items.length, pct };
    if (items.length) pcts.push((done / items.length) * 100);
  }
  // Each category counts equally (SDS 3.1.1, ProgressService).
  const overall = pcts.length
    ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
    : 0;
  return { overall, byCategory };
}

export const CareerProgressContext = createContext<CareerProgressValue | null>(null);

export function useCareerProgress(): CareerProgressValue {
  const ctx = useContext(CareerProgressContext);
  if (!ctx) {
    throw new Error("useCareerProgress must be used inside CareerProgressProvider");
  }
  return ctx;
}
