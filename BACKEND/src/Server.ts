import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";

// --- Route Imports ---
import { adminCoursesRouter } from "./Routers/AdminCourseRouter.js";
import { authRouter } from "./Routers/AuthRouter.js";
import { autofillRouter } from "./Routers/AutofillRouter.js";
import { facultyCoursesRouter } from "./Routers/FacultyCourseRouter.js";
import AuditRouter from "./Routers/AuditRouter.js";
import { historyRouter } from "./Routers/HistoryRouter.js";
import resumeRouter from "./Routers/ResumeRouter.js";
import publicCourseRouter from "./Routers/PublicCourseRouter.js"; // <-- NEW
import { roadmapRouter, milestonesRouter } from "./Routers/RoadmapRouter.js";
import { assessmentRouter } from "./Routers/AssessmentRouter.js";
import { skillReviewRouter } from "./Routers/SkillReviewRouter.js";

// --- Middleware Imports ---
import { RequireAdmin, RequireAuth } from "./Middleware/RequireAuth.js";
import { RequireStudent } from "./Middleware/RequireStudent.js";

const app = express();
app.disable("x-powered-by");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_API_KEY) {
  throw new Error("Missing Supabase environment variables");
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- Public Routes ---
app.use("/api/auth", authRouter);
app.use("/api/history", historyRouter);
app.use("/courses", publicCourseRouter);

// --- Protected Routes ---
app.use("/api/faculty", RequireAuth, facultyCoursesRouter);
app.use("/api/admin", RequireAdmin, adminCoursesRouter);
app.use("/api/audit-logs", AuditRouter);
app.use("/api/autofill", autofillRouter);
app.use("/api/resume", resumeRouter);
app.use("/api/roadmap", RequireStudent, roadmapRouter);
app.use("/api/milestones", RequireStudent, milestonesRouter);
app.use("/api/assessment", RequireStudent, assessmentRouter);
app.use("/api/reviews", RequireStudent, skillReviewRouter);

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// --- Frontend Serving ---
const frontendDistPath = path.join(process.cwd(), "../FRONTEND/dist");
app.use(express.static(frontendDistPath));

app.get(/(.*)/, (req: Request, res: Response) => {
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

// --- Error Handler ---
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: msg });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Server listening on ${port}`);
});
