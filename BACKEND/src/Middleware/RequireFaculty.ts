import type { Request, Response, NextFunction } from "express";
import { RequireAuth } from "./RequireAuth.js";

// Faculty reports are for faculty and admins, never students.
export function RequireFaculty(req: Request, res: Response, next: NextFunction) {
  RequireAuth(req, res, () => {
    const type = req.user?.userType;
    if (type !== "Faculty/Administrator" && type !== "Administrator") {
      return res.status(403).json({ error: "Faculty access required" });
    }
    next();
  });
}
