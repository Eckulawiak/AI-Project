import { RequireFaculty } from "../Middleware/RequireFaculty.js";
import { Router } from "express";
import {
  getCourses,
  getCourseMapping,
  updateCourseMapping,
  claimCourse,
  fetchUnassignedCourses,
  getSkillsOptions,
  checkCourseCode,
  createNewCourse,
  resolveOrCreateSkill,
} from "../Controllers/FacultyCourseController.js";
import { getAggregateProgress } from "../Controllers/ProgressController.js";

export const facultyCoursesRouter = Router();

// --- Data Fetching Routes ---
facultyCoursesRouter.get("/courses", getCourses);
facultyCoursesRouter.get("/unassigned-courses", fetchUnassignedCourses);
facultyCoursesRouter.get("/skills-options", getSkillsOptions);
facultyCoursesRouter.get("/courses/:courseId/mapping", getCourseMapping);
facultyCoursesRouter.get("/progress", RequireFaculty, getAggregateProgress);

// --- Validation Routes (Must go before generic /:courseId routes) ---
facultyCoursesRouter.get("/courses/check-code", checkCourseCode);

// --- Mutation Routes ---
facultyCoursesRouter.post("/courses", createNewCourse);
facultyCoursesRouter.put("/courses/:courseId/mapping", updateCourseMapping);
facultyCoursesRouter.put("/courses/:courseId/claim", claimCourse);
facultyCoursesRouter.post("/skills/resolve", resolveOrCreateSkill);
