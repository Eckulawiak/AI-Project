import { type Request, type Response } from "express";
import {
  NotFoundError,
  buildRoadmap,
  getProgressForStudent,
  getRoadmapPayload,
  setMilestoneStatus,
  getStudentProfile,
} from "../Models/RoadmapModel.js";
import { getInternshipListings } from "../Models/InternshipListingsModel.js";

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Unknown error";

// GET /api/roadmap/me -> builds the roadmap the first time it is opened
export const getMyRoadmap = async (req: Request, res: Response) => {
  try {
    res.json(await getRoadmapPayload(req.user!.userId));
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};

// POST /api/roadmap/regenerate -> rebuild pending milestones, keep completed
export const regenerateRoadmap = async (req: Request, res: Response) => {
  try {
    res.json(await buildRoadmap(req.user!.userId));
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};

// PUT /api/milestones/:id  { status: "COMPLETE" | "PENDING" }
export const updateMilestone = async (
  req: Request<{ id: string }, unknown, { status?: string }>,
  res: Response,
) => {
  try {
    const milestoneId = Number(req.params.id);
    if (!Number.isInteger(milestoneId) || milestoneId <= 0) {
      return res.status(400).json({ error: "Invalid milestone id" });
    }
    const status = req.body?.status;
    if (status !== "COMPLETE" && status !== "PENDING") {
      return res
        .status(400)
        .json({ error: "status must be COMPLETE or PENDING" });
    }

    res.json(await setMilestoneStatus(req.user!.userId, milestoneId, status));
  } catch (e: unknown) {
    if (e instanceof NotFoundError) {
      return res.status(404).json({ error: e.message });
    }
    res.status(500).json({ error: errorMessage(e) });
  }
};

// GET /api/milestones/progress -> { overall, byCategory }
export const getMilestoneProgress = async (req: Request, res: Response) => {
  try {
    res.json(await getProgressForStudent(req.user!.userId));
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};

// GET /api/roadmap/internships -> current openings for the career goal
export const getInternships = async (req: Request, res: Response) => {
  try {
    const profile = await getStudentProfile(req.user!.userId);
    if (!profile.careerGoal?.trim()) {
      return res.json({ goal: "", listings: [], sources: [], fetchedAt: new Date().toISOString() });
    }
    res.json(await getInternshipListings(profile.careerGoal));
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};
