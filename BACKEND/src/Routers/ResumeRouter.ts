// BACKEND/src/Routers/ResumeRouter.ts
import express from "express";
import { supabase } from "../Database/supabaseClient.js";
import {
  buildResumePrompt,
  buildTalkingPointsPrompt,
  loadResumeInput,
  parseResumeRequest,
} from "../Models/ResumeInputModel.js";

const router = express.Router();

// One row per generation request for the admin report and AI budget
// (SDS C9, ai_usage_log). Never stores the prompt or who asked. A failed
// write is logged and ignored so it can't break generation.
function logAiUsage(row: {
  feature: string;
  model: string;
  latency_ms: number;
  success: boolean;
  fell_back: boolean;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
}) {
  supabase
    .from("ai_usage_log")
    .insert(row)
    .then(({ error }) => {
      if (error) console.error("Failed to log AI usage:", error.message);
    });
}

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

    const API_KEY = process.env.AIAPIKEY;
    const OPENROUTER_URL = process.env.OPEN_ROUTER_URL;

    if (!API_KEY || !OPENROUTER_URL) {
      throw new Error("Missing OpenRouter credentials in backend environment.");
    }

    // 1. Define our cascade of models from the .env file
    const fallbackModels = [
      process.env.VITE_MODEL_ID_1,
      process.env.VITE_MODEL_ID_2,
      process.env.VITE_MODEL_ID_3,
    ].filter(Boolean) as string[]; // filter(Boolean) removes any undefined ones

    if (fallbackModels.length === 0) {
      throw new Error("No models defined in environment variables.");
    }

    let lastError: any = null;
    const feature = mode === "skills" ? "resume_bullets" : "talking_points";
    const started = Date.now();

    // 2. Loop through the models. If one fails, try the next.
    for (const currentModel of fallbackModels) {
      try {
        console.log(`Attempting generation with model: ${currentModel}`);

        const payload = {
          model: currentModel,
          messages: [{ role: "user", content: prompt }],
        };

        const response = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "QU Career Services",
          },
          body: JSON.stringify(payload),
        });

        // If the API call itself fails (e.g., 502 Bad Gateway, 429 Rate Limit)
        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errBody}`);
        }

        const result = await response.json();
        const text = result.choices?.[0]?.message?.content?.trim();

        // Heuristic for a "bad response" - if it's empty or suspiciously short
        if (!text || text.length < 10) {
          throw new Error("Response was empty or invalid.");
        }

        // 3. SUCCESS! Send the response to the frontend and exit the function.
        console.log(`Success with ${currentModel}`);
        logAiUsage({
          feature,
          model: currentModel,
          latency_ms: Date.now() - started,
          success: true,
          fell_back: currentModel !== fallbackModels[0],
          prompt_tokens: result.usage?.prompt_tokens ?? null,
          completion_tokens: result.usage?.completion_tokens ?? null,
        });
        return res.status(200).json({ text, sections: input.sections });
      } catch (err: any) {
        // Log the failure, save the error, and let the loop continue to the next model
        console.warn(`Model ${currentModel} failed:`, err.message);
        lastError = err;
      }
    }

    // 4. If the loop finishes without returning, it means ALL models failed.
    console.error("All fallback models exhausted. Last error:", lastError);
    logAiUsage({
      feature,
      model: fallbackModels[fallbackModels.length - 1] ?? "unknown",
      latency_ms: Date.now() - started,
      success: false,
      fell_back: fallbackModels.length > 1,
    });
    return res.status(500).json({
      error: "Failed to generate AI content. Please try again later.",
    });
  } catch (error: any) {
    console.error("Backend AI Generation Error:", error);
    return res
      .status(500)
      .json({ error: "An unexpected error occurred. Please try again." });
  }
});

export default router;
