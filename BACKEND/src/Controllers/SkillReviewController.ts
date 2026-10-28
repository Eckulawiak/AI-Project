import { type Request, type Response } from "express";
import { getLatestAssessment } from "../Models/AssessmentModel.js";
import { getCompetencies } from "../Models/RoadmapModel.js";
import {
  ReviewError,
  cancelInvite,
  getReviewsForFaculty,
  getReviewsForStudent,
  inviteReviewer,
  searchReviewers,
  submitReview,
} from "../Models/SkillReviewModel.js";

const fail = (res: Response, e: unknown) => {
  if (e instanceof ReviewError)
    return res.status(e.status).json({ error: e.message });
  res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
};

const idParam = (req: Request) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// ---------------------------------------------------------------------
// Student: /api/reviews
// ---------------------------------------------------------------------

// GET /api/reviews -> the student's invitations, the eight competencies
// and their own latest self-ratings to compare against.
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

// GET /api/reviews/reviewers?q= -> faculty the student can invite
export const findReviewers = async (req: Request, res: Response) => {
  try {
    res.json(await searchReviewers(String(req.query.q ?? "")));
  } catch (e) {
    fail(res, e);
  }
};

// POST /api/reviews { facultyId }
export const createInvite = async (req: Request, res: Response) => {
  try {
    const facultyId = Number(req.body?.facultyId);
    if (!Number.isInteger(facultyId) || facultyId <= 0)
      return res.status(400).json({ error: "Please choose who to invite." });
    await inviteReviewer(req.user!.userId, facultyId);
    res.status(201).json(await getReviewsForStudent(req.user!.userId));
  } catch (e) {
    fail(res, e);
  }
};

// DELETE /api/reviews/:id -> withdraw a pending invitation
export const deleteInvite = async (req: Request, res: Response) => {
  try {
    const id = idParam(req);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    await cancelInvite(req.user!.userId, id);
    res.status(204).end();
  } catch (e) {
    fail(res, e);
  }
};

// ---------------------------------------------------------------------
// Faculty: /api/faculty/reviews
// ---------------------------------------------------------------------

// GET /api/faculty/reviews -> invitations sent to this faculty member
export const getFacultyReviews = async (req: Request, res: Response) => {
  try {
    const [reviews, competencies] = await Promise.all([
      getReviewsForFaculty(req.user!.userId),
      getCompetencies(),
    ]);
    res.json({ reviews, competencies });
  } catch (e) {
    fail(res, e);
  }
};

// PUT /api/faculty/reviews/:id { ratings, comment }
// Every competency rated 1..4; the comment is optional.
export const saveFacultyReview = async (req: Request, res: Response) => {
  try {
    const id = idParam(req);
    if (!id) return res.status(400).json({ error: "Invalid id" });

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
      await submitReview(req.user!.userId, id, ratings, comment || null),
    );
  } catch (e) {
    fail(res, e);
  }
};
