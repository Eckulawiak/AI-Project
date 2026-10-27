import type { Request, Response, NextFunction } from "express";
import { RequireAuth } from "./RequireAuth.js";

// Roadmap, milestones and the assessment belong to the signed-in student.
export function RequireStudent(req: Request, res: Response, next: NextFunction) {
  RequireAuth(req, res, () => {
    if (req.user?.userType !== "Student") {
      return res.status(403).json({ error: "Student access required" });
    }
    next();
  });
}
