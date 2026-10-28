import { type Request, type Response } from "express";
import {
  MIN_GROUP_SIZE,
  getAllSchoolsProgress,
  getFacultyProgressReport,
} from "../Models/ProgressReportModel.js";
import { REPORT_PERIODS, getUsageReport } from "../Models/UsageReportModel.js";
import { getOpenFlags } from "../Models/UnmappedFlagsModel.js";
import { getOpenTemplateGaps } from "../Models/TemplateGapsModel.js";

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Unknown error";

// GET /api/faculty/progress
// De-identified progress for the majors this faculty member covers and their
// schools (REQ-PROG-7, REQ-ROAD-8). Groups under five students are hidden.
export const getAggregateProgress = async (req: Request, res: Response) => {
  try {
    const facultyId = Number(req.user?.userId);
    if (!Number.isInteger(facultyId) || facultyId <= 0) {
      return res.status(400).json({ error: "Missing or invalid faculty session" });
    }
    res.json(await getFacultyProgressReport(facultyId));
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};

// GET /api/admin/reports?days=30 -> usage and progress across schools (REQ-PROG-8)
export const getAdminReport = async (req: Request, res: Response) => {
  try {
    const requested = Number(req.query.days ?? 30);
    const days = (REPORT_PERIODS as readonly number[]).includes(requested) ? requested : 30;
    const [usage, progress] = await Promise.all([
      getUsageReport(days),
      getAllSchoolsProgress(),
    ]);
    res.json({ minGroupSize: MIN_GROUP_SIZE, usage, progress });
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};

// GET /api/admin/unmapped-flags -> open flags, most-selected first (REQ-SKM-7)
export const getUnmappedFlags = async (_req: Request, res: Response) => {
  try {
    res.json(await getOpenFlags());
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};

// GET /api/admin/template-gaps -> majors using a default roadmap (REQ-ROAD-9)
export const getTemplateGaps = async (_req: Request, res: Response) => {
  try {
    res.json(await getOpenTemplateGaps());
  } catch (e: unknown) {
    res.status(500).json({ error: errorMessage(e) });
  }
};
