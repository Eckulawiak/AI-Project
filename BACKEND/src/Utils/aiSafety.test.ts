// REQ-RES-8: grades and personal identifiers never reach OpenRouter.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { findSensitive, redactSensitive } from "./aiSafety.js";

// Test setup: the OpenRouter helper imports the Supabase client, which
// needs these to load. Every request is faked below; nothing is sent.
process.env.SUPABASE_URL ??= "http://supabase.test";
process.env.SUPABASE_API_KEY ??= "test-key";

const SENSITIVE = [
  ["email", "Contact me at sam.rivera@quinnipiac.edu for details"],
  ["ssn", "SSN 123-45-6789 on file"],
  ["phone", "Call (203) 582-8200 anytime"],
  ["gpa", "Graduated with a GPA of 3.85"],
  ["gpa", "Overall GPA: 3.9/4.0"],
  ["gpa", "Held a 3.7/4.0 average"],
  ["grade", "Final grade: A- in the course"],
  ["grade", "I earned an A in data structures"],
  ["grade", "Scored 97% on the final exam"],
  ["id", "Student ID 1234567"],
  ["id", "Banner number 00981234"],
] as const;

test("each kind of sensitive data is found and removed", () => {
  for (const [kind, text] of SENSITIVE) {
    assert.ok(findSensitive(text).includes(kind), `should find ${kind} in "${text}"`);
    const clean = redactSensitive(text);
    assert.deepEqual(findSensitive(clean), [], `"${clean}" should be clean`);
  }
});

test("ordinary resume text is left alone", () => {
  const ordinary = [
    "Built a REST API in Node.js for SER 491",
    "Led a team of 4 students during the 2025-2026 school year",
    "Learned to grade a project rubric and give feedback",
    "Used Python 3.12 and React 18 to build a dashboard",
    "Improved page load time by 40%",
  ];
  for (const text of ordinary) {
    assert.deepEqual(findSensitive(text), [], `"${text}" should not be flagged`);
    assert.equal(redactSensitive(text), text);
  }
});

test("the OpenRouter request body has only the model and a clean prompt", async () => {
  const { buildOpenRouterBody } = await import("./openRouter.js");
  const body = buildOpenRouterBody(
    "test/model",
    "Project: Budget app. Description: built with my GPA 3.9 roommate, email jo@qu.edu, ID 7654321",
    { maxTokens: 300 },
  );
  assert.deepEqual(Object.keys(body).sort(), ["max_tokens", "messages", "model"]);
  assert.equal(body.messages.length, 1);
  const content = body.messages[0]!.content;
  assert.deepEqual(findSensitive(content), []);
  assert.ok(content.includes("Budget app"));
});

test("the request actually sent to OpenRouter contains no grades or identifiers", async () => {
  process.env.AIAPIKEY = "test-key";
  process.env.OPEN_ROUTER_URL = "https://openrouter.test/api/v1/chat/completions";
  process.env.VITE_MODEL_ID_1 = "test/model";

  const sent: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === process.env.OPEN_ROUTER_URL) {
      sent.push(String(init?.body ?? ""));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "- Built a budgeting app" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // the usage log write to Supabase
    return new Response("[]", { status: 201, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const { completeWithFallback } = await import("./openRouter.js");
    const reply = await completeWithFallback(
      "Write bullets. Student sam@qu.edu, ID 1234567, SSN 123-45-6789, GPA 3.8/4.0, grade: B+, phone 203-555-0142.",
      { feature: "RESUME" },
    );
    assert.equal(reply, "- Built a budgeting app");
    assert.equal(sent.length, 1);

    const body = JSON.parse(sent[0]!);
    assert.deepEqual(Object.keys(body).sort(), ["messages", "model"]);
    const outbound = JSON.stringify(body);
    assert.deepEqual(findSensitive(outbound), [], `outbound payload: ${outbound}`);
    for (const leaked of ["sam@qu.edu", "1234567", "123-45-6789", "3.8", "B+", "555-0142"]) {
      assert.ok(!outbound.includes(leaked), `"${leaked}" was sent to OpenRouter`);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});
