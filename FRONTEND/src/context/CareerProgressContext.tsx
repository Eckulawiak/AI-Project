// Shared state for the roadmap, the progress strip and the skill assessment.
// Uses the fake data in mock/careerData.ts and keeps it in sessionStorage so a
// demo survives a page refresh. Swap these actions for API calls later.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BASE_MILESTONES,
  GAP_MILESTONES,
  MOCK_PROFILE,
  type AssessmentResult,
  type Category,
  type Milestone,
  type StudentProfile,
} from "../mock/careerData";
import Celebration from "../components/Celebration";
import {
  CareerProgressContext,
  THRESHOLDS,
  computeProgress,
  type CareerProgressValue,
  type CelebrationEvent,
} from "./careerProgress";

const STORAGE_KEY = "qu_demo_career_progress";

interface StoredState {
  profile: StudentProfile;
  milestones: Milestone[];
  assessment: AssessmentResult | null;
}

const initialState = (): StoredState => ({
  profile: MOCK_PROFILE,
  milestones: BASE_MILESTONES.map((x) => ({ ...x })),
  assessment: null,
});

function loadState(): StoredState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredState;
  } catch {
    /* storage unavailable or corrupt — fall back to defaults */
  }
  return initialState();
}

const YEAR_ORDER = { FIRST: 0, SOPH: 1, JUNIOR: 2, SENIOR: 3 } as const;

export const CareerProgressProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<StoredState>(loadState);
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const progress = useMemo(() => computeProgress(state.milestones), [state.milestones]);

  const nextMilestones = useMemo(
    () =>
      state.milestones
        .filter((x) => x.status === "PENDING")
        .sort((a, b) => YEAR_ORDER[a.classYear] - YEAR_ORDER[b.classYear])
        .slice(0, 3),
    [state.milestones],
  );

  const toggleMilestone = useCallback(
    (id: string) => {
      const before = computeProgress(state.milestones).overall;
      const target = state.milestones.find((x) => x.id === id);
      if (!target) return;
      const nowComplete = target.status === "PENDING";
      const milestones: Milestone[] = state.milestones.map((x) =>
        x.id === id ? { ...x, status: nowComplete ? "COMPLETE" : "PENDING" } : x,
      );
      setState({ ...state, milestones });

      if (!nowComplete) return; // unchecking never celebrates
      const after = computeProgress(milestones).overall;
      const crossed = [...THRESHOLDS].reverse().find((t) => before < t && after >= t);
      setCelebration(
        crossed
          ? {
              kind: "threshold",
              title: crossed === 100 ? "Roadmap complete!" : `You're ${crossed}% career ready!`,
              message:
                crossed === 100
                  ? "You finished every milestone on your roadmap."
                  : `Nice work — you just passed ${crossed}% overall.`,
              key: Date.now(),
            }
          : {
              kind: "milestone",
              title: "Milestone complete",
              message: target.name,
              key: Date.now(),
            },
      );
    },
    [state],
  );

  const applyAssessment = useCallback(
    (result: AssessmentResult) => {
      const previous = new Map(state.milestones.map((x) => [x.id, x.status]));

      // Start from the base roadmap, keeping what was already checked off.
      let milestones: Milestone[] = BASE_MILESTONES.map((x) => ({
        ...x,
        status: previous.get(x.id) ?? x.status,
      }));

      // Courses the student marked as completed are ticked off.
      milestones = milestones.map((x) =>
        x.courseCode && result.completedCourses.includes(x.courseCode)
          ? { ...x, status: "COMPLETE" }
          : x,
      );

      // Weak competencies (rated 1 or 2) add a targeted milestone.
      for (const [id, rating] of Object.entries(result.ratings)) {
        const gap = GAP_MILESTONES[Number(id)];
        if (gap && rating <= 2) {
          milestones.push({ ...gap, status: previous.get(gap.id) ?? "PENDING" });
        }
      }

      // Experience the student already has becomes completed milestones.
      const kindToCategory: Record<string, Category> = {
        INTERNSHIP: "EXPERIENCE",
        JOB: "EXPERIENCE",
        CERT: "CERT",
        PROJECT: "SKILL",
      };
      for (const e of result.experience) {
        milestones.push({
          id: `x-${e.id}`,
          name: e.title,
          description: "Added from your skill assessment.",
          category: kindToCategory[e.kind],
          classYear: result.profile.classYear,
          competencyIds: [],
          status: "COMPLETE",
        });
        if (e.kind === "INTERNSHIP") {
          milestones = milestones.map((x) =>
            x.id === "e-intern" || x.id === "e-intern-apply"
              ? { ...x, status: "COMPLETE" }
              : x,
          );
        }
      }

      setState({ profile: result.profile, milestones, assessment: result });
    },
    [state.milestones],
  );

  const resetDemo = useCallback(() => {
    setState(initialState());
    setCelebration(null);
  }, []);

  const value: CareerProgressValue = {
    profile: state.profile,
    milestones: state.milestones,
    assessment: state.assessment,
    progress,
    nextMilestones,
    toggleMilestone,
    applyAssessment,
    resetDemo,
    celebration,
    dismissCelebration: () => setCelebration(null),
  };

  return (
    <CareerProgressContext.Provider value={value}>
      {children}
      {celebration && (
        <Celebration event={celebration} onDismiss={() => setCelebration(null)} />
      )}
    </CareerProgressContext.Provider>
  );
};
