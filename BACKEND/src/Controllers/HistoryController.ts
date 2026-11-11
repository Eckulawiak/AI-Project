// Saved talking points ("History"). Mounted behind RequireStudent: the
// student always comes from the login token, so students can only save,
// read and delete their own history.
import { type Request, type Response } from "express";
import {
  saveTalkingPointsForStudent,
  getHistoryForStudent,
  deleteHistoryEntryForStudent,
  deleteAllHistoryForStudent,
} from "../Models/HistoryModel.js";

// The :studentId in the URL must be the signed-in student. Returns their
// id, or sends the error and returns null.
function ownStudentId(req: Request, res: Response): number | null {
  const studentId = Number(req.params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    res.status(400).json({ error: "Invalid studentId" });
    return null;
  }
  if (studentId !== req.user!.userId) {
    res.status(403).json({ error: "You can only access your own history" });
    return null;
  }
  return studentId;
}

export const saveHistory = async (req: Request, res: Response) => {
  try {
    // always the signed-in student; any studentId in the body is ignored
    const studentId = req.user!.userId;
    const courseName = String(req.body.courseName ?? "").trim();
    const courseCode = String(req.body.courseCode ?? "").trim();
    const talkingPoints = Array.isArray(req.body.talkingPoints)
      ? req.body.talkingPoints
      : [];

    if (!courseName) {
      return res.status(400).json({ error: "courseName is required" });
    }
    if (talkingPoints.length === 0) {
      return res
        .status(400)
        .json({ error: "talkingPoints array cannot be empty" });
    }

    const saved = await saveTalkingPointsForStudent(
      studentId,
      courseCode,
      courseName,
      talkingPoints,
    );
    res.status(201).json(saved);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
};

export const getStudentHistory = async (req: Request, res: Response) => {
  try {
    const studentId = ownStudentId(req, res);
    if (studentId === null) return;

    const history = await getHistoryForStudent(studentId);
    res.json(history);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
};

export const deleteHistory = async (req: Request, res: Response) => {
  try {
    const studentId = ownStudentId(req, res);
    if (studentId === null) return;
    const historyId = Number(req.params.historyId);

    if (!Number.isInteger(historyId) || historyId <= 0) {
      return res.status(400).json({ error: "Invalid historyId" });
    }

    const result = await deleteHistoryEntryForStudent(studentId, historyId);
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "History entry not found for this student") {
      return res.status(404).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
};

export const clearAllHistory = async (req: Request, res: Response) => {
  try {
    const studentId = ownStudentId(req, res);
    if (studentId === null) return;

    const result = await deleteAllHistoryForStudent(studentId);
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
};
