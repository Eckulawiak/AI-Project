import { type Request, type Response } from "express";
import {
  NotFoundError,
  createTemplateMilestone,
  deleteTemplateMilestone,
  getTemplateMilestonesForAdmin,
  listTemplates,
  updateTemplateMilestone,
  type TemplateMilestoneInput,
} from "../Models/TemplateMilestonesModel.js";
import { getCompetencies } from "../Models/RoadmapModel.js";
import { CATEGORIES, isClassYear, type Category } from "../Utils/progress.js";

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Unknown error";

const sendError = (res: Response, e: unknown) =>
  res.status(e instanceof NotFoundError ? 404 : 500).json({ error: errorMessage(e) });

const parseId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const optionalText = (value: unknown, max: number) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
};

// Validates a milestone body; returns the input or an error message.
async function parseMilestone(body: any): Promise<TemplateMilestoneInput | string> {
  const category = body?.category as Category;
  if (!(CATEGORIES as readonly string[]).includes(category))
    return "Pick a category.";
  if (!isClassYear(body?.classYear)) return "Pick a class year.";

  const name = String(body?.name ?? "").trim();
  if (!name) return "Give the milestone a name.";
  if (name.length > 150) return "Keep the name under 150 characters.";

  const resources = (Array.isArray(body?.resources) ? body.resources : [])
    .map((r: unknown) => String(r ?? "").trim())
    .filter(Boolean);

  const position =
    body?.position === null || body?.position === undefined || body?.position === ""
      ? null
      : Number(body.position);
  if (position !== null && (!Number.isInteger(position) || position < 0 || position > 32767))
    return "Order must be a whole number.";

  const known = new Set((await getCompetencies()).map((c) => c.id));
  const competencyIds = (Array.isArray(body?.competencyIds) ? body.competencyIds : []).map(Number);
  if (competencyIds.some((id: number) => !known.has(id))) return "Unknown competency.";

  const gapCompetencyId =
    body?.gapCompetencyId === null || body?.gapCompetencyId === undefined || body?.gapCompetencyId === ""
      ? null
      : Number(body.gapCompetencyId);
  if (gapCompetencyId !== null && !known.has(gapCompetencyId)) return "Unknown competency.";

  return {
    category,
    classYear: body.classYear,
    name,
    description: optionalText(body?.description, 2000),
    component: optionalText(body?.component, 60),
    resources,
    position,
    competencyIds,
    gapCompetencyId,
  };
}

// GET /api/admin/roadmap-templates -> templates and the competency list
export const getRoadmapTemplates = async (_req: Request, res: Response) => {
  try {
    const [templates, competencies] = await Promise.all([
      listTemplates(),
      getCompetencies(),
    ]);
    res.json({ templates, competencies });
  } catch (e: unknown) {
    sendError(res, e);
  }
};

// GET /api/admin/roadmap-templates/:templateId/milestones
export const getRoadmapTemplateMilestones = async (req: Request, res: Response) => {
  try {
    const templateId = parseId(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: "Invalid template id" });
    res.json(await getTemplateMilestonesForAdmin(templateId));
  } catch (e: unknown) {
    sendError(res, e);
  }
};

// POST /api/admin/roadmap-templates/:templateId/milestones
export const addRoadmapTemplateMilestone = async (req: Request, res: Response) => {
  try {
    const templateId = parseId(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: "Invalid template id" });
    const input = await parseMilestone(req.body);
    if (typeof input === "string") return res.status(400).json({ error: input });
    const id = await createTemplateMilestone(templateId, input);
    res.status(201).json({ id });
  } catch (e: unknown) {
    sendError(res, e);
  }
};

// PUT /api/admin/template-milestones/:milestoneId
export const editRoadmapTemplateMilestone = async (req: Request, res: Response) => {
  try {
    const milestoneId = parseId(req.params.milestoneId);
    if (!milestoneId) return res.status(400).json({ error: "Invalid milestone id" });
    const input = await parseMilestone(req.body);
    if (typeof input === "string") return res.status(400).json({ error: input });
    await updateTemplateMilestone(milestoneId, input);
    res.json({ id: milestoneId });
  } catch (e: unknown) {
    sendError(res, e);
  }
};

// DELETE /api/admin/template-milestones/:milestoneId
export const removeRoadmapTemplateMilestone = async (req: Request, res: Response) => {
  try {
    const milestoneId = parseId(req.params.milestoneId);
    if (!milestoneId) return res.status(400).json({ error: "Invalid milestone id" });
    await deleteTemplateMilestone(milestoneId);
    res.status(204).end();
  } catch (e: unknown) {
    sendError(res, e);
  }
};
