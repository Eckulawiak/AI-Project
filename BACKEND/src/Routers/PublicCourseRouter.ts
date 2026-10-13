import express from "express";
import {
  getMajorCourses,
  getSchools,
} from "../Controllers/CourseController.js";

const router = express.Router();

// Route: GET /courses/schools
router.get("/schools", getSchools);
// Route: GET /courses/majors/:majorId
router.get("/majors/:majorId", getMajorCourses);

export default router;
