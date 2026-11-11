import { type Request, type Response } from "express";
import { getLatestAssessment } from "../Models/AssessmentModel.js";
import { getCompetencies } from "../Models/RoadmapModel.js";
import {
  ReviewError,
  findStudentsToReview,
  getReviewsByFaculty,
  getReviewsForStudent,
  saveReview,
} from "../Models/SkillReviewModel.js";
import {
  addFavorite,
  listFavorites,
  removeFavorite,
} from "../Models/FacultyFavoritesModel.js";

const fail = (res: Response, e: unknown) => {
  if (e instanceof ReviewError)
    return res.status(e.status).json({ error: e.message });
  res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
};

// ---------------------------------------------------------------------
// Student: /api/reviews
// ---------------------------------------------------------------------

// GET /api/reviews -> reviews faculty have written about the student, the
// eight competencies, and the student's own latest self-ratings.
export const getMyReviews = async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.userId;
    const [reviews, competencies, assessment] = await Promise.all([
      getReviewsForStudent(studentId),
      getCompetencies(),
      getLatestAssessment(studentId),
    ]);
    res.json({ reviews, competencies, selfRatings: assessment?.ratings ?? {} });
  } catch (e) {
    fail(res, e);
  }
};

// ---------------------------------------------------------------------
// Faculty: /api/faculty/reviews
// ---------------------------------------------------------------------

// GET /api/faculty/reviews -> reviews this faculty member has written
export const getFacultyReviews = async (req: Request, res: Response) => {
  try {
    const [reviews, competencies] = await Promise.all([
      getReviewsByFaculty(req.user!.userId),
      getCompetencies(),
    ]);
    res.json({ reviews, competencies });
  } catch (e) {
    fail(res, e);
  }
};

// GET /api/faculty/reviews/students?q= -> students to review: search
// results, or the students in the faculty member's majors.
export const getStudentsToReview = async (req: Request, res: Response) => {
  try {
    res.json(
      await findStudentsToReview(req.user!.userId, String(req.query.q ?? "")),
    );
  } catch (e) {
    fail(res, e);
  }
};

// PUT /api/faculty/reviews/students/:studentId { ratings, comment }
// Every competency rated 1..4; the comment is optional.
export const saveFacultyReview = async (req: Request, res: Response) => {
  try {
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0)
      return res.status(400).json({ error: "Invalid student" });

    const ratings: Record<string, number> = {};
    for (const comp of await getCompetencies()) {
      const value = Number(req.body?.ratings?.[String(comp.id)]);
      if (!Number.isInteger(value) || value < 1 || value > 4)
        return res
          .status(400)
          .json({ error: `Please rate ${comp.name} from 1 to 4.` });
      ratings[String(comp.id)] = value;
    }

    const comment = String(req.body?.comment ?? "").trim();
    if (comment.length > 2000)
      return res
        .status(400)
        .json({ error: "Comment must be 2000 characters or fewer." });

    res.json(
      await saveReview(req.user!.userId, studentId, ratings, comment || null),
    );
  } catch (e) {
    fail(res, e);
  }
};

// ---------------------------------------------------------------------
// Faculty favorites ("My advisees"): /api/faculty/reviews/favorites
// The faculty id always comes from the login token.
// ---------------------------------------------------------------------

const studentIdParam = (req: Request) => {
  const id = Number(req.params.studentId);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// GET /api/faculty/reviews/favorites -> your starred students
export const getFavorites = async (req: Request, res: Response) => {
  try {
    res.json({ students: await listFavorites(req.user!.userId) });
  } catch (e) {
    fail(res, e);
  }
};

// PUT /api/faculty/reviews/favorites/:studentId -> star a student
export const starStudent = async (req: Request, res: Response) => {
  const studentId = studentIdParam(req);
  if (!studentId) return res.status(400).json({ error: "Invalid student" });
  try {
    res.json({ student: await addFavorite(req.user!.userId, studentId) });
  } catch (e) {
    fail(res, e);
  }
};

// DELETE /api/faculty/reviews/favorites/:studentId -> unstar
export const unstarStudent = async (req: Request, res: Response) => {
  const studentId = studentIdParam(req);
  if (!studentId) return res.status(400).json({ error: "Invalid student" });
  try {
    await removeFavorite(req.user!.userId, studentId);
    res.status(204).end();
  } catch (e) {
    fail(res, e);
  }
};
