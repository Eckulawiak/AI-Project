import type { Request, Response } from "express";
import { getCoursesForMajor } from "../Models/CoursesModel.js";
import { getSchoolsWithMajors } from "../Models/SchoolsModel.js";

// GET /courses/schools -> [{ id, name, majors: [{ id, name }] }]
export const getSchools = async (_req: Request, res: Response) => {
  try {
    res.json(await getSchoolsWithMajors());
  } catch (error) {
    console.error("Error fetching schools:", error);
    res.status(500).json({ error: "Failed to fetch schools" });
  }
};

// GET /courses/majors/:majorId -> courses grouped by course_code
export const getMajorCourses = async (req: Request, res: Response) => {
  try {
    const majorId = Number(req.params.majorId);
    if (!Number.isInteger(majorId) || majorId <= 0) {
      return res.status(400).json({ error: "Invalid majorId" });
    }

    res.json(await getCoursesForMajor(majorId));
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
};
