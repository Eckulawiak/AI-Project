// Types, helpers and the hook for the shared career-progress state.
// The provider component lives in CareerProgressContext.tsx.
import { createContext, useContext } from "react";
import {
  CATEGORIES,
  type AssessmentSubmission,
  type Milestone,
  type Progress,
  type RoadmapResponse,
  type StudentProfile,
} from "../career/careerData";

export const THRESHOLDS = [25, 50, 75, 100];

export type { Progress };

export interface CelebrationEvent {
  kind: "milestone" | "threshold";
  title: string;
  message: string;
  key: number;
}

export interface CareerProgressValue {
  loading: boolean;
  error: string;
  profile: StudentProfile | null;
  roadmap: RoadmapResponse["roadmap"] | null;
  lastAssessmentAt: string | null;
  milestones: Milestone[];
  progress: Progress;
  nextMilestones: Milestone[];
  toggleMilestone: (id: number) => void;
  submitAssessment: (body: AssessmentSubmission) => Promise<void>;
  regenerate: () => Promise<void>;
  refresh: () => Promise<void>;
  celebration: CelebrationEvent | null;
  dismissCelebration: () => void;
}

// Same formula as the server (SDS 3.1.2, ProgressService), so the bar can
// move as soon as a box is ticked. Only required milestones count.
export function computeProgress(milestones: Milestone[]): Progress {
  const byCategory = {} as Progress["byCategory"];
  const pcts: number[] = [];
  const required = milestones.filter((x) => x.required);
  const optional = milestones.filter((x) => !x.required);
  for (const c of CATEGORIES) {
    const items = required.filter((x) => x.category === c.id);
    const done = items.filter((x) => x.status === "COMPLETE").length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    byCategory[c.id] = { done, total: items.length, pct };
    if (items.length) pcts.push((done / items.length) * 100);
  }
  // Each category counts equally.
  const overall = pcts.length
    ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
    : 0;
  return {
    overall,
    byCategory,
    optional: {
      done: optional.filter((x) => x.status === "COMPLETE").length,
      total: optional.length,
    },
  };
}

export function crossedThreshold(before: number, after: number): number | null {
  return [...THRESHOLDS].reverse().find((t) => before < t && after >= t) ?? null;
}

export const CareerProgressContext = createContext<CareerProgressValue | null>(null);

export function useCareerProgress(): CareerProgressValue {
  const ctx = useContext(CareerProgressContext);
  if (!ctx) {
    throw new Error("useCareerProgress must be used inside CareerProgressProvider");
  }
  return ctx;
}
