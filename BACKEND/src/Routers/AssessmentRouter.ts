import { Router } from "express";
import {
  getAssessmentOptions,
  getMyAssessment,
  submitAssessment,
} from "../Controllers/AssessmentController.js";

export const assessmentRouter = Router();

assessmentRouter.get("/options", getAssessmentOptions);
assessmentRouter.get("/me", getMyAssessment);
assessmentRouter.post("/", submitAssessment);
