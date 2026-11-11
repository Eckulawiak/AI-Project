import { supabase } from "../Database/supabaseClient.js";
import { redactSensitive } from "./aiSafety.js";

// Server-side OpenRouter gateway with the same model cascade as the resume
// generator (VITE_MODEL_ID_1 -> 2 -> 3). Returns null when every model
// fails, so callers can carry on without AI.

type LogFeature = "RESUME" | "SKILL_SUGGEST" | "INTERVIEW";

// One row per request for the admin report and AI budget (SDS C9). Never
// stores the prompt or who asked. A failed write is logged and ignored.
function logAiUsage(row: {
  feature: LogFeature;
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

// The exact request body sent to OpenRouter: the model, one user message
// and an optional reply cap. The prompt is scrubbed of grades and personal
// identifiers here, so no caller can send them by mistake (REQ-RES-8).
export function buildOpenRouterBody(model: string, prompt: string, maxTokens?: number) {
  return {
    model,
    messages: [{ role: "user", content: redactSensitive(prompt) }],
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
  };
}

export async function completeWithFallback(
  prompt: string,
  {
    feature,
    timeoutMs = 15000,
    totalTimeoutMs,
    maxTokens,
    validate,
  }: {
    feature: LogFeature;
    // per model
    timeoutMs?: number;
    // across the whole cascade; no new model is tried once it runs out
    totalTimeoutMs?: number;
    // cap on the reply length, which also keeps responses fast
    maxTokens?: number;
    // Throw to reject a response and move on to the next model.
    validate?: (text: string) => void;
  },
): Promise<string | null> {
  const apiKey = process.env.AIAPIKEY;
  const url = process.env.OPEN_ROUTER_URL;
  const models = [
    process.env.VITE_MODEL_ID_1,
    process.env.VITE_MODEL_ID_2,
    process.env.VITE_MODEL_ID_3,
  ].filter(Boolean) as string[];

  if (!apiKey || !url || models.length === 0) {
    console.warn("OpenRouter is not configured; skipping AI request.");
    return null;
  }

  const started = Date.now();
  for (const model of models) {
    const left =
      totalTimeoutMs == null ? timeoutMs : totalTimeoutMs - (Date.now() - started);
    if (left < 500) break;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "QU Career Services",
        },
        body: JSON.stringify(buildOpenRouterBody(model, prompt, maxTokens)),
        signal: AbortSignal.timeout(Math.min(timeoutMs, left)),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result: any = await response.json();
      const text = result.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty response");
      validate?.(text);

      logAiUsage({
        feature,
        model,
        latency_ms: Date.now() - started,
        success: true,
        fell_back: model !== models[0],
        prompt_tokens: result.usage?.prompt_tokens ?? null,
        completion_tokens: result.usage?.completion_tokens ?? null,
      });
      return text;
    } catch (e: any) {
      console.warn(`Model ${model} failed:`, e?.message ?? e);
    }
  }

  logAiUsage({
    feature,
    model: models[models.length - 1] ?? "unknown",
    latency_ms: Date.now() - started,
    success: false,
    fell_back: models.length > 1,
  });
  return null;
}
