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
// and optional settings. The prompt is scrubbed of grades and personal
// identifiers here, so no caller can send them by mistake (REQ-RES-8).
export function buildOpenRouterBody(
  model: string,
  prompt: string,
  {
    maxTokens,
    lightReasoning,
  }: { maxTokens?: number | undefined; lightReasoning?: boolean | undefined } = {},
) {
  return {
    model,
    messages: [{ role: "user", content: redactSensitive(prompt) }],
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    // Reasoning models think less and leave their thinking out of the
    // reply; OpenRouter ignores this for models that don't reason.
    ...(lightReasoning ? { reasoning: { effort: "low", exclude: true } } : {}),
  };
}

// Why a model didn't give a usable reply.
export type AiFailure = "busy" | "timeout" | "empty" | "unusable" | "error";

// The reply text, whether it comes back as a string or as content parts.
function replyText(result: any): string {
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content))
    return content
      .map((part: any) => (typeof part === "string" ? part : (part?.text ?? "")))
      .join("")
      .trim();
  return "";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class AiError extends Error {
  constructor(
    message: string,
    public kind: AiFailure,
  ) {
    super(message);
  }
}

export async function completeWithFallback(
  prompt: string,
  {
    feature,
    timeoutMs = 15000,
    totalTimeoutMs,
    maxTokens,
    lightReasoning,
    failures,
    validate,
  }: {
    feature: LogFeature;
    // per model
    timeoutMs?: number;
    // across the whole cascade, shared fairly between the models left
    totalTimeoutMs?: number;
    // cap on the reply length
    maxTokens?: number;
    // ask reasoning models to think briefly, for quick plain answers
    lightReasoning?: boolean;
    // filled with why each model failed, for a clearer message
    failures?: AiFailure[];
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
    failures?.push("error");
    return null;
  }

  const started = Date.now();
  const remaining = () =>
    totalTimeoutMs == null ? Infinity : totalTimeoutMs - (Date.now() - started);

  const attempt = async (model: string, budget: number) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "QU Career Services",
      },
      body: JSON.stringify(buildOpenRouterBody(model, prompt, { maxTokens, lightReasoning })),
      signal: AbortSignal.timeout(budget),
    }).catch((e: any) => {
      const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
      throw new AiError(e?.message ?? String(e), timedOut ? "timeout" : "error");
    });
    if (!response.ok) {
      throw new AiError(
        `HTTP ${response.status}: ${await response.text()}`,
        response.status === 429 || response.status === 503 ? "busy" : "error",
      );
    }
    const result: any = await response.json();
    const text = replyText(result);
    if (!text) {
      // say why, e.g. "length" when reasoning used up the room for an answer
      const choice = result?.choices?.[0];
      const why = [
        choice?.finish_reason && `finish_reason=${choice.finish_reason}`,
        result?.usage?.completion_tokens != null &&
          `completion_tokens=${result.usage.completion_tokens}`,
        choice?.message?.reasoning && "reply had reasoning but no answer",
        result?.error?.message && `error=${result.error.message}`,
      ].filter(Boolean);
      throw new AiError(`Empty response${why.length ? ` (${why.join(", ")})` : ""}`, "empty");
    }
    try {
      validate?.(text);
    } catch (e: any) {
      throw new AiError(e?.message ?? "Unusable response", "unusable");
    }
    return { text, result };
  };

  for (const [i, model] of models.entries()) {
    // each model left gets a fair share of the time left
    const share = Math.min(timeoutMs, remaining() / (models.length - i));
    if (share < 1000) break;
    const modelStarted = Date.now();
    try {
      let reply;
      try {
        reply = await attempt(model, share);
      } catch (e) {
        // a busy model often frees up within a second or two: try it once more
        const left = share - (Date.now() - modelStarted) - 1500;
        if (!(e instanceof AiError && e.kind === "busy" && left >= 3000)) throw e;
        console.warn(`Model ${model} is busy; retrying once.`);
        await sleep(1500);
        reply = await attempt(model, left);
      }

      logAiUsage({
        feature,
        model,
        latency_ms: Date.now() - started,
        success: true,
        fell_back: model !== models[0],
        prompt_tokens: reply.result.usage?.prompt_tokens ?? null,
        completion_tokens: reply.result.usage?.completion_tokens ?? null,
      });
      return reply.text;
    } catch (e: any) {
      failures?.push(e instanceof AiError ? e.kind : "error");
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
