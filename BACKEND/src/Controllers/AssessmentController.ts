import { type Request, type Response } from "express";
import {
  getLatestAssessment,
  saveAssessment,
  type ExperienceEntry,
} from "../Models/AssessmentModel.js";
import {
  addExperienceMilestones,
  buildRoadmap,
  getCompetencies,
  getCourseHistory,
  getRoadmapCoursesForMajor,
  getRoadmapPayload,
  getStudentProfile,
  saveCourseHistory,
  updateStudentProfile,
} from "../Models/RoadmapModel.js";
import { flagUnmappedCourses } from "../Models/UnmappedFlagsModel.js";
import { isClassYear } from "../Utils/progress.js";

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Unknown error";

const COURSE_STATUSES = ["COMPLETED", "IN_PROGRESS", "NONE"] as const;
const EXPERIENCE_KINDS = ["INTERNSHIP", "JOB", "CERT", "PROJECT"] as const;

// GET /api/assessment/options?majorId=
// Everything the assessment form needs: the saved profile, the eight NACE
// competencies, and the major's courses with their mapped skills and the
// student's saved status (REQ-SKM-5).
export const getAssessmentOptions = async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.userId;
    const [profile, competencies, history] = await Promise.all([
      getStudentProfile(studentId),
      getCompetencies(),
      getCourseHistory(studentId),
    ]);

    const requested = Number(req.query.majorId);
    const majorId =
      Number.isInteger(requested) && requested > 0 ? requested : profile.majorId;

    const courses =
      majorId == null
        ? []
        : (await getRoadmapCoursesForMajor(majorId, competencies)).map((c) => ({
            ...c,
            status: history.get(c.courseId) ?? "NONE",
          }));

    res.json({ profile, competencies, majorId, courses });
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};

// GET /api/assessment/me -> latest assessment or null
export const getMyAssessment = async (req: Request, res: Response) => {
  try {
    res.json(await getLatestAssessment(req.user!.userId));
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};

type SubmitBody = {
  profile?: {
    majorId?: unknown;
    classYear?: unknown;
    careerGoal?: unknown;
    goalType?: unknown;
  };
  courses?: Array<{ courseId?: unknown; status?: unknown }>;
  ratings?: Record<string, unknown>;
  experience?: Array<{ kind?: unknown; title?: unknown }>;
};

// POST /api/assessment
// Saves the profile, coursework, ratings and experience, flags unmapped
// courses the student picked, then rebuilds the roadmap and returns it.
export const submitAssessment = async (
  req: Request<Record<string, never>, unknown, SubmitBody>,
  res: Response,
) => {
  try {
    const studentId = req.user!.userId;
    const body = req.body ?? {};

    // --- profile ---
    const majorId = Number(body.profile?.majorId);
    const classYear = body.profile?.classYear;
    const careerGoal = String(body.profile?.careerGoal ?? "").trim();
    const goalType = body.profile?.goalType;

    if (!Number.isInteger(majorId) || majorId <= 0)
      return res.status(400).json({ error: "Please choose your major." });
    if (!isClassYear(classYear))
      return res.status(400).json({ error: "Please choose your class year." });
    if (!careerGoal)
      return res.status(400).json({ error: "Please enter a career goal." });
    if (careerGoal.length > 150)
      return res
        .status(400)
        .json({ error: "Career goal must be 150 characters or fewer." });
    if (goalType !== "INDUSTRY" && goalType !== "GRAD")
      return res
        .status(400)
        .json({ error: "goalType must be INDUSTRY or GRAD." });

    // --- coursework ---
    const courses: Array<{
      courseId: number;
      status: (typeof COURSE_STATUSES)[number];
    }> = [];
    for (const c of Array.isArray(body.courses) ? body.courses : []) {
      const courseId = Number(c?.courseId);
      const status = c?.status as (typeof COURSE_STATUSES)[number];
      if (!Number.isInteger(courseId) || courseId <= 0)
        return res.status(400).json({ error: "Invalid courseId" });
      if (!COURSE_STATUSES.includes(status))
        return res.status(400).json({ error: "Invalid course status" });
      courses.push({ courseId, status });
    }

    // --- ratings: every competency rated 1..4 ---
    const competencies = await getCompetencies();
    const ratings: Record<string, number> = {};
    for (const comp of competencies) {
      const value = Number(body.ratings?.[String(comp.id)]);
      if (!Number.isInteger(value) || value < 1 || value > 4) {
        return res
          .status(400)
          .json({ error: `Please rate ${comp.name} from 1 to 4.` });
      }
      ratings[String(comp.id)] = value;
    }

    // --- experience (optional) ---
    const experience: ExperienceEntry[] = [];
    for (const e of Array.isArray(body.experience) ? body.experience : []) {
      const kind = e?.kind as ExperienceEntry["kind"];
      const title = String(e?.title ?? "").trim();
      if (!EXPERIENCE_KINDS.includes(kind) || !title)
        return res.status(400).json({ error: "Invalid experience entry" });
      experience.push({ kind, title: title.slice(0, 150) });
    }

    await updateStudentProfile(studentId, {
      majorId,
      classYear,
      careerGoal,
      goalType,
    });
    await saveCourseHistory(studentId, courses);
    const assessment = await saveAssessment(studentId, ratings, experience);

    // REQ-SKM-7: never fail the assessment over a flag
    try {
      await flagUnmappedCourses(
        courses.filter((c) => c.status !== "NONE").map((c) => c.courseId),
      );
    } catch (flagError) {
      console.error("Failed to flag unmapped courses:", flagError);
    }

    // A new assessment starts the roadmap over (completed courses come back
    // checked off from the course history).
    await buildRoadmap(studentId, { fresh: true });
    await addExperienceMilestones(studentId, experience);

    res.status(201).json({
      assessment,
      ...(await getRoadmapPayload(studentId)),
    });
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};
