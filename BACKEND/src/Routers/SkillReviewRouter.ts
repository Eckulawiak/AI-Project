import { Router } from "express";
import {
  createInvite,
  deleteInvite,
  findReviewers,
  getMyReviews,
} from "../Controllers/SkillReviewController.js";

// Student side of faculty/advisor skill reviews (mounted behind RequireStudent).
export const skillReviewRouter = Router();

// Before /:id so "reviewers" is not read as an id
skillReviewRouter.get("/reviewers", findReviewers);
skillReviewRouter.get("/", getMyReviews);
skillReviewRouter.post("/", createInvite);
skillReviewRouter.delete("/:id", deleteInvite);
