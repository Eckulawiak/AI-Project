import { Router } from "express";
import { getMyReviews } from "../Controllers/SkillReviewController.js";

// Student side of faculty/advisor skill reviews (mounted behind RequireStudent).
export const skillReviewRouter = Router();

skillReviewRouter.get("/", getMyReviews);
