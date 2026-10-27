// Shared state for the roadmap, the progress strip and the skill assessment.
// Loads the signed-in student's roadmap from the API, ticks milestones off
// optimistically and rolls back if the server refuses (SDS Figure 7).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type {
  AssessmentSubmission,
  Milestone,
  RoadmapResponse,
} from "../career/careerData";
import Celebration from "../components/Celebration";
import { loadSession } from "../Session";
import * as careerApi from "../services/careerApi";
import {
  CareerProgressContext,
  computeProgress,
  crossedThreshold,
  type CareerProgressValue,
  type CelebrationEvent,
} from "./careerProgress";

const YEAR_ORDER = { FIRST: 0, SOPH: 1, JUNIOR: 2, SENIOR: 3 } as const;

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

export const CareerProgressProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const location = useLocation();
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);
  // The session token the current data belongs to.
  const loadedFor = useRef<string | null>(null);

  const milestones = useMemo(() => data?.milestones ?? [], [data]);

  const load = useCallback(async (request: () => Promise<RoadmapResponse>) => {
    setLoading(true);
    setError("");
    try {
      setData(await request());
    } catch (e) {
      setError(errorText(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load once per student session; clear when someone else signs in.
  useEffect(() => {
    const session = loadSession();
    const token = session?.userType === "Student" ? session.token : null;
    if (token === loadedFor.current) return;
    loadedFor.current = token;
    setData(null);
    if (token) load(careerApi.getRoadmap).catch(() => {});
  }, [location.pathname, load]);

  const progress = useMemo(() => computeProgress(milestones), [milestones]);

  const nextMilestones = useMemo(
    () =>
      milestones
        .filter((x) => x.status === "PENDING")
        .sort((a, b) => YEAR_ORDER[a.classYear] - YEAR_ORDER[b.classYear])
        .slice(0, 3),
    [milestones],
  );

  const replaceMilestone = useCallback(
    (id: number, update: (m: Milestone) => Milestone) =>
      setData((d) =>
        d ? { ...d, milestones: d.milestones.map((x) => (x.id === id ? update(x) : x)) } : d,
      ),
    [],
  );

  const toggleMilestone = useCallback(
    (id: number) => {
      const target = milestones.find((x) => x.id === id);
      if (!target) return;
      const previous = target.status;
      const nowComplete = previous === "PENDING";
      const status = nowComplete ? "COMPLETE" : "PENDING";

      // Optimistic update
      const before = computeProgress(milestones).overall;
      const after = computeProgress(
        milestones.map((x) => (x.id === id ? { ...x, status } : x)),
      ).overall;
      replaceMilestone(id, (m) => ({ ...m, status }));
      setError("");

      if (nowComplete) {
        const crossed = crossedThreshold(before, after);
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
      }

      careerApi
        .setMilestoneStatus(id, status)
        .then((res) => replaceMilestone(id, () => res.milestone))
        .catch((e) => {
          replaceMilestone(id, (m) => ({ ...m, status: previous }));
          setCelebration(null);
          setError(`Couldn't save "${target.name}". ${errorText(e)}`);
        });
    },
    [milestones, replaceMilestone],
  );

  const submitAssessment = useCallback(
    (body: AssessmentSubmission) => load(() => careerApi.submitAssessment(body)),
    [load],
  );

  const regenerate = useCallback(() => load(careerApi.regenerateRoadmap), [load]);
  const refresh = useCallback(() => load(careerApi.getRoadmap), [load]);

  const value: CareerProgressValue = {
    loading,
    error,
    profile: data?.profile ?? null,
    roadmap: data?.roadmap ?? null,
    lastAssessmentAt: data?.lastAssessmentAt ?? null,
    milestones,
    progress,
    nextMilestones,
    toggleMilestone,
    submitAssessment,
    regenerate,
    refresh,
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
