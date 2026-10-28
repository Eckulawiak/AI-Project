import { Router } from "express";
import {
  getAdminCourses,
  getAdminCourseMapping,
  updateAdminCourseMapping,
  updateAdminCourseDetails,
  resolveOrCreateSkill,
} from "../Controllers/AdminCourseController.js";
import {
  getAdminReport,
  getTemplateGaps,
  getUnmappedFlags,
} from "../Controllers/ProgressController.js";

export const adminCoursesRouter = Router();

adminCoursesRouter.get("/courses", getAdminCourses);
adminCoursesRouter.get("/courses/:courseId/mapping", getAdminCourseMapping);
adminCoursesRouter.put("/courses/:courseId/mapping", updateAdminCourseMapping);
adminCoursesRouter.put("/courses/:courseId", updateAdminCourseDetails);
adminCoursesRouter.post("/skills/resolve", resolveOrCreateSkill);
adminCoursesRouter.get("/unmapped-flags", getUnmappedFlags);
adminCoursesRouter.get("/template-gaps", getTemplateGaps);
adminCoursesRouter.get("/reports", getAdminReport);
