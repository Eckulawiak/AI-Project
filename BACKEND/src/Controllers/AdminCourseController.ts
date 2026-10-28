import { type Request, type Response } from "express";
import {
  getAllCourses,
  getCoursesByIds,
  getCourseIdsForMajors,
  getCourseById,
  updateCourse,
  findPairedCoursesByCodeAndProfessor,
  updateCrossMajorMatchingCoursesByCodeAndProfessor,
} from "../Models/CoursesModel.js";
import {
  getCourseMappings,
  replaceMappingsForCourseIds,
} from "../Models/CourseSkillMappingModel.js";
import { resolveFlagsForMappedCourses } from "../Models/UnmappedFlagsModel.js";
import {
  getAllSkillsAndCompetencies,
  findOrCreateSkillByName,
} from "../Models/SkillsModel.js";
import { findMajorByName } from "../Models/MajorModel.js";
import { linkSkillToMajor } from "../Models/SkillMajorMappingModel.js";
import { getMajorIdsForSchool } from "../Models/SchoolsModel.js";
import { buildCourseRows } from "./courseRows.js";

// GET /api/admin/courses?schoolId=&majorId=&status=
export const getAdminCourses = async (req: Request, res: Response) => {
  try {
    const majorId = Number(req.query.majorId);
    const schoolId = Number(req.query.schoolId);
    const status = (req.query.status as string | undefined)?.trim();

    let majorIds: number[] | null = null;
    if (Number.isInteger(majorId) && majorId > 0) majorIds = [majorId];
    else if (Number.isInteger(schoolId) && schoolId > 0)
      majorIds = await getMajorIdsForSchool(schoolId);

    const courses = majorIds
      ? await getCoursesByIds([...(await getCourseIdsForMajors(majorIds))])
      : await getAllCourses();

    res.json(await buildCourseRows(courses, status));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
};

// GET /api/admin/courses/:courseId/mapping
export const getAdminCourseMapping = async (req: Request, res: Response) => {
  try {
    const courseId = Number(req.params.courseId);
    if (!Number.isFinite(courseId)) {
      return res.status(400).json({ error: "Invalid courseId" });
    }
    const mapping = await getCourseMappings(courseId);
    res.json(mapping);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
};

type UpdateMappingBody = { skillIds?: number[]; competencyIds?: number[] };

// PUT /api/admin/courses/:courseId/mapping
export const updateAdminCourseMapping = async (
  req: Request<{ courseId: string }, unknown, UpdateMappingBody>,
  res: Response,
) => {
  try {
    const courseId = Number(req.params.courseId);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ error: "Invalid courseId" });
    }

    const existingCourse = await getCourseById(courseId);
    const skillIds = Array.isArray(req.body.skillIds) ? req.body.skillIds : [];
    const competencyIds = Array.isArray(req.body.competencyIds)
      ? req.body.competencyIds
      : [];

    const allIds = [...skillIds, ...competencyIds]
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    const uniqueIds = Array.from(new Set(allIds));

    const pairedCourses = await findPairedCoursesByCodeAndProfessor(
      courseId,
      existingCourse.course_code,
      existingCourse.major,
      existingCourse.professor ?? "",
    );

    const allCourseIdsToReplace = [
      courseId,
      ...pairedCourses.map((c) => c.course_id),
    ];

    await replaceMappingsForCourseIds(allCourseIdsToReplace, uniqueIds);
    await resolveFlagsForMappedCourses(allCourseIdsToReplace);
    const updated = await getCourseMappings(courseId);

    res.json({
      updated,
      syncedCourseIds: pairedCourses.map((c) => c.course_id),
      syncedCount: pairedCourses.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
};

type UpdateCourseBody = {
  professor?: string;
  courseCode?: string;
  courseName?: string;
  major?: string;
};

// PUT /api/admin/courses/:courseId
export const updateAdminCourseDetails = async (
  req: Request<{ courseId: string }, unknown, UpdateCourseBody>,
  res: Response,
) => {
  try {
    const courseId = Number(req.params.courseId);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ error: "Invalid courseId" });
    }

    const existingCourse = await getCourseById(courseId);
    const updates: UpdateCourseBody = {};

    if (typeof req.body.professor === "string")
      updates.professor = req.body.professor.trim();
    if (typeof req.body.courseCode === "string")
      updates.courseCode = req.body.courseCode.trim();
    if (typeof req.body.courseName === "string")
      updates.courseName = req.body.courseName.trim();
    if (typeof req.body.major === "string")
      updates.major = req.body.major.trim();

    const updated = await updateCourse(courseId, updates);
    const syncedCourses =
      await updateCrossMajorMatchingCoursesByCodeAndProfessor(
        courseId,
        existingCourse.course_code,
        existingCourse.major,
        existingCourse.professor ?? "",
        updates,
      );

    res.json({ updated, syncedCount: syncedCourses.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
};

type ResolveSkillBody = { name: string };

// POST /api/admin/skills/resolve
export const resolveOrCreateSkill = async (
  req: Request<Record<string, never>, unknown, ResolveSkillBody>,
  res: Response,
) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ error: "Skill name is required" });
    }

    const skill = await findOrCreateSkillByName(name);
    res.json(skill); // returns { Skill_Id, Skill_name, Type }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
};
