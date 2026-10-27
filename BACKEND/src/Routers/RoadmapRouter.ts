import { Router } from "express";
import {
  getMyRoadmap,
  regenerateRoadmap,
  updateMilestone,
  getMilestoneProgress,
} from "../Controllers/RoadmapController.js";

export const roadmapRouter = Router();

roadmapRouter.get("/me", getMyRoadmap);
roadmapRouter.post("/regenerate", regenerateRoadmap);

export const milestonesRouter = Router();

// Before /:id so "progress" is not read as an id
milestonesRouter.get("/progress", getMilestoneProgress);
milestonesRouter.put("/:id", updateMilestone);
