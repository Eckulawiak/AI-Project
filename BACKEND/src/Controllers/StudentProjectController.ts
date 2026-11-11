// /api/projects: a student's saved projects for the resume builder
// (REQ-RES-1). Mounted behind RequireStudent; the student id always comes
// from the login token, never from the request.
import type { Request, Response } from "express";
import {
  PROJECT_LIMITS,
  countProjects,
  createProject,
  deleteProject,
  listProjects,
  parseProjectInput,
  updateProject,
} from "../Models/StudentProjectsModel.js";

const parseId = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function getMyProjects(req: Request, res: Response) {
  try {
    res.json(await listProjects(req.user!.userId));
  } catch (e) {
    console.error("Failed to load projects:", e);
    res.status(500).json({ error: "Couldn't load your projects." });
  }
}

export async function addProject(req: Request, res: Response) {
  const parsed = parseProjectInput(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  try {
    const studentId = req.user!.userId;
    if ((await countProjects(studentId)) >= PROJECT_LIMITS.maxProjects) {
      return res.status(400).json({
        error: `You can save up to ${PROJECT_LIMITS.maxProjects} projects. Delete one to add another.`,
      });
    }
    res.status(201).json(await createProject(studentId, parsed.input));
  } catch (e) {
    console.error("Failed to add project:", e);
    res.status(500).json({ error: "Couldn't save your project." });
  }
}

export async function editProject(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid project id." });
  const parsed = parseProjectInput(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  try {
    const project = await updateProject(req.user!.userId, id, parsed.input);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(project);
  } catch (e) {
    console.error("Failed to update project:", e);
    res.status(500).json({ error: "Couldn't save your project." });
  }
}

export async function removeProject(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid project id." });
  try {
    if (!(await deleteProject(req.user!.userId, id)))
      return res.status(404).json({ error: "Project not found." });
    res.status(204).end();
  } catch (e) {
    console.error("Failed to delete project:", e);
    res.status(500).json({ error: "Couldn't delete your project." });
  }
}
