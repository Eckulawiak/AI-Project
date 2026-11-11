// The OpenRouter model cascade: busy models, reasoning models, failures.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

// Test setup: the helper imports the Supabase client, which needs these to
// load, and reads the OpenRouter settings on each call. Every request below
// is faked; nothing is sent.
process.env.SUPABASE_URL ??= "http://supabase.test";
process.env.SUPABASE_API_KEY ??= "test-key";
process.env.AIAPIKEY = "test-key";
process.env.OPEN_ROUTER_URL = "https://openrouter.test/api/v1/chat/completions";
process.env.VITE_MODEL_ID_1 = "model/one";
process.env.VITE_MODEL_ID_2 = "model/two";
delete process.env.VITE_MODEL_ID_3;

const { completeWithFallback, buildOpenRouterBody } = await import("./openRouter.js");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const reply = (content: unknown) => json(200, { choices: [{ message: { content } }] });

// Fake OpenRouter: each call to it takes the next response from the list.
// Other requests (the Supabase usage log) succeed.
function fakeOpenRouter(responses: Array<() => Response>) {
  const calls: Array<{ model: string; body: any }> = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) !== process.env.OPEN_ROUTER_URL) return json(201, []);
    const body = JSON.parse(String(init?.body));
    calls.push({ model: body.model, body });
    const next = responses.shift();
    return next ? next() : json(500, { error: "no more fake responses" });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

test("a busy model is retried once before moving on", async () => {
  const fake = fakeOpenRouter([
    () => json(429, { error: { message: "rate-limited upstream" } }),
    () => reply("- Built a REST API"),
  ]);
  try {
    const text = await completeWithFallback("prompt", { feature: "RESUME", totalTimeoutMs: 45000 });
    assert.equal(text, "- Built a REST API");
    assert.deepEqual(
      fake.calls.map((c) => c.model),
      ["model/one", "model/one"],
    );
  } finally {
    fake.restore();
  }
});

test("why each model failed is reported", async () => {
  const fake = fakeOpenRouter([
    () => json(429, {}),
    () => json(429, {}),
    () => reply(""),
  ]);
  try {
    const failures: string[] = [];
    const text = await completeWithFallback("prompt", {
      feature: "RESUME",
      totalTimeoutMs: 45000,
      failures: failures as never,
    });
    assert.equal(text, null);
    assert.deepEqual(failures, ["busy", "empty"]);
  } finally {
    fake.restore();
  }
});

test("replies sent as content parts are read", async () => {
  const fake = fakeOpenRouter([() => reply([{ type: "text", text: "- Led a team of four" }])]);
  try {
    assert.equal(
      await completeWithFallback("prompt", { feature: "RESUME" }),
      "- Led a team of four",
    );
  } finally {
    fake.restore();
  }
});

test("resume requests ask reasoning models to think briefly", () => {
  const body = buildOpenRouterBody("model/one", "prompt", { lightReasoning: true });
  assert.deepEqual(body.reasoning, { effort: "low", exclude: true });
  assert.equal("reasoning" in buildOpenRouterBody("model/one", "prompt"), false);
});
