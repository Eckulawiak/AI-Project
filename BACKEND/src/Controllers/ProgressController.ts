import { type Request, type Response } from "express";
import { supabase } from "../Database/supabaseClient.js";
import { getOpenFlags } from "../Models/UnmappedFlagsModel.js";
import { getOpenTemplateGaps } from "../Models/TemplateGapsModel.js";

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Unknown error";

// GET /api/faculty/progress
// De-identified progress per school and category, read from the
// school_progress_aggregate view, which hides groups under five students
// (REQ-SEC-6).
export const getAggregateProgress = async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("school_progress_aggregate")
      .select("school_id, category, student_count, avg_pct, median_pct");
    if (error) throw new Error(error.message);

    const { data: schools, error: schoolError } = await supabase
      .from("schools")
      .select("id, name");
    if (schoolError) throw new Error(schoolError.message);
    const names = new Map((schools ?? []).map((s: any) => [s.id, s.name]));

    res.json(
      (data ?? []).map((r: any) => ({
        schoolId: r.school_id,
        school: names.get(r.school_id) ?? null,
        category: r.category,
        studentCount: Number(r.student_count),
        avgPct: Number(r.avg_pct),
        medianPct: Number(r.median_pct),
      })),
    );
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
