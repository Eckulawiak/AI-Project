// BACKEND/src/Routers/ResumeRouter.ts
import express from "express";
import {
  buildResumePrompt,
  buildTalkingPointsPrompt,
  loadResumeInput,
  parseResumeRequest,
} from "../Models/ResumeInputModel.js";
import { generateBlocks } from "../Models/ResumeBlocksModel.js";
import { getDraft, parseDraft, saveDraft } from "../Models/ResumeDraftModel.js";
import { getCourseHistory, getStudentProfile } from "../Models/RoadmapModel.js";
import { completeWithFallback } from "../Utils/openRouter.js";

const router = express.Router();

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Unknown error");

// Mounted behind RequireStudent. The body holds only what the student
// picked (REQ-RES-1): { mode, courseIds, projectIds, careerGoals }. Skills
// and project details are looked up on the server.
router.post("/generate", async (req, res) => {
  try {
    const parsed = parseResumeRequest(req.body);
    if ("error" in parsed) {
      return res.status(400).json({ error: parsed.error });
    }
    const { mode } = parsed.request;

    const input = await loadResumeInput(req.user!.userId, parsed.request);
    if (input.sections.length === 0) {
      return res.status(400).json({
        error:
          "No skills are listed for the selected classes yet. Pick other classes or add a project.",
      });
    }

    const prompt =
      mode === "skills"
        ? buildResumePrompt(input)
        : buildTalkingPointsPrompt(input);

    // ai_usage_log.feature only allows RESUME, SKILL_SUGGEST and INTERVIEW;
    // talking points are interview prep.
    const text = await completeWithFallback(prompt, {
      feature: mode === "skills" ? "RESUME" : "INTERVIEW",
      validate: (reply) => {
        if (reply.length < 10) throw new Error("Response was empty or invalid.");
      },
    });
    if (text == null) {
      return res.status(500).json({
        error: "Failed to generate AI content. Please try again later.",
      });
    }
    return res.status(200).json({ text, sections: input.sections });
  } catch (error: any) {
    console.error("Backend AI Generation Error:", error);
    return res
      .status(500)
      .json({ error: "An unexpected error occurred. Please try again." });
  }
});

// GET /resume/options -> who the resume is for: the student's profile
// and the course ids they've completed, to pre-select on the resume page.
router.get("/options", async (req, res) => {
  try {
    const studentId = req.user!.userId;
    const [profile, history] = await Promise.all([
      getStudentProfile(studentId),
      getCourseHistory(studentId),
    ]);
    const completedCourseIds = [...history]
      .filter(([, status]) => status === "COMPLETED")
      .map(([id]) => id);
    res.json({ profile, completedCourseIds });
  } catch (e) {
    res.status(500).json({ error: errorMessage(e) });
  }
});

// POST /resume/blocks { courseIds, projectIds, careerGoals }
// One block of bullet points per course and project (REQ-RES-2). To
// regenerate a single block, send just that course or project (REQ-RES-5).
router.post("/blocks", async (req, res) => {
  try {
    const parsed = parseResumeRequest({ ...req.body, mode: "skills" });
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const blocks = await generateBlocks(req.user!.userId, parsed.request);
    res.json({ blocks });
  } catch (e) {
    console.error("Resume block generation failed:", e);
    res.status(500).json({ error: "Couldn't generate bullet points. Try again." });
  }
});

// GET /resume/draft -> the student's saved resume, or no blocks
router.get("/draft", async (req, res) => {
  try {
    res.json(await getDraft(req.user!.userId));
  } catch (e) {
    res.status(500).json({ error: errorMessage(e) });
  }
});

// PUT /resume/draft { blocks } -> save the resume, edits included (REQ-RES-4)
router.put("/draft", async (req, res) => {
  try {
    const parsed = parseDraft(req.body);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    res.json(await saveDraft(req.user!.userId, parsed.blocks));
  } catch (e) {
    res.status(500).json({ error: errorMessage(e) });
  }
});

export default router;
