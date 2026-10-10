// BACKEND/src/Routers/ResumeRouter.ts
import express from "express";
// Optional: If you have an auth middleware, import it here to protect this route
// import { requireAuth } from '../Middleware/RequireAuth';

const router = express.Router();

const buildResumePrompt = (
  classBlocks: string,
) => `Act as a professional resume writer.
I will provide skills and tasks learned, grouped by university course.
Transform these into strong, action-oriented resume bullet points, grouped by course.

${classBlocks}

Requirements:
1. Output each course as a labeled section header using only alphabetical and numeric characters and a colon (e.g., "SER-491:").
2. Under each course, list 2-4 bullet points using strong action verbs (e.g., Engineered, Orchestrated, Developed).
3. Consolidate related skills within the same course where appropriate.
4. Do not include any markdown formatting.
5. Return plain text only, with course headers followed by bullet points on new lines.
`;

const buildTalkingPointsPrompt = (
  classBlocks: string,
) => `Act as a technical interview coach.

I will provide skills and tasks learned, grouped by university course.
Transform them into interview-ready talking points that a student can say out loud.

${classBlocks}

Requirements:
1. Output each course as a labeled section header using only alphabetical and numeric characters and a colon (e.g., "SER-491:").
2. For each skill provided, generate EXACTLY ONE talking point.
3. Do NOT combine skills together.
4. Do NOT create multiple talking points for a single skill.
5. Each talking point must be on its own new line and begin with a dash (-).
6. Write each talking point in first-person language (e.g., "I built...", "I implemented...", "I worked with...").
7. Each talking point should:
   - Clearly explain what was done
   - Reference tools, technologies, or concepts when possible
   - Sound natural for an interview response
8. Keep each talking point concise (1-2 sentences max).
9. Do not include markdown formatting.
10. Return plain text only.

Strict Rule:
- If a course has N skills listed, you must return exactly N talking points for that course.
- Maintain a one-to-one mapping between input skills and output talking points.
`;

// Add your requireAuth middleware here if you want to restrict this to logged-in users
router.post("/generate", async (req, res) => {
  try {
    const { skillsByClass, mode } = req.body;

    if (!skillsByClass || Object.keys(skillsByClass).length === 0) {
      return res
        .status(400)
        .json({ error: "No skills provided for generation." });
    }

    const classBlocks = Object.entries(skillsByClass)
      .map(
        ([courseCode, skills]) =>
          `Course: ${courseCode}\n${(skills as string[]).map((s: string) => `- ${s}`).join("\n")}`,
      )
      .join("\n\n");

    const prompt =
      mode === "skills"
        ? buildResumePrompt(classBlocks)
        : buildTalkingPointsPrompt(classBlocks);

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
            "X-Title": "Student Resume Dashboard",
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
        return res.status(200).json({ text });
      } catch (err: any) {
        // Log the failure, save the error, and let the loop continue to the next model
        console.warn(`Model ${currentModel} failed:`, err.message);
        lastError = err;
      }
    }

    // 4. If the loop finishes without returning, it means ALL models failed.
    console.error("All fallback models exhausted. Last error:", lastError);
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
