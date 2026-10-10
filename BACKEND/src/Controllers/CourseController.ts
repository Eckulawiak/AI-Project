import type { Request, Response } from "express";
import { getAllCourses, getCoursesByMajor } from "../Models/CoursesModel.js";

export const getGroupedCourses = async (req: Request, res: Response) => {
  try {
    const courses = await getAllCourses();
    const majors = [...new Set(courses.map((c) => c.major))].sort();

    const grouped: Record<
      string,
      {
        courseCode: string;
        courseName: string;
        offerings: { id: string; altName: string | null }[];
      }[]
    > = {};

    for (const major of majors) {
      grouped[major] = await getCoursesByMajor(major);
    }

    res.json(grouped);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
};
