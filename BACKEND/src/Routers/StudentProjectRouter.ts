import { Router } from "express";
import {
  addProject,
  editProject,
  getMyProjects,
  removeProject,
} from "../Controllers/StudentProjectController.js";

// A student's saved resume projects (mounted behind RequireStudent).
export const studentProjectRouter = Router();

studentProjectRouter.get("/", getMyProjects);
studentProjectRouter.post("/", addProject);
studentProjectRouter.put("/:id", editProject);
studentProjectRouter.delete("/:id", removeProject);
