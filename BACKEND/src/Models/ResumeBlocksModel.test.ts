// Resume block prompts and parsing (REQ-RES-2, REQ-RES-5, REQ-RES-8).
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { findSensitive } from "../Utils/aiSafety.js";

// Test setup: the models import the Supabase client, which needs these to
// load. No test here talks to Supabase or OpenRouter.
process.env.SUPABASE_URL ??= "http://supabase.test";
process.env.SUPABASE_API_KEY ??= "test-key";

const { buildBlockPrompt, parseBullets } = await import("./ResumeBlocksModel.js");
const { buildOpenRouterBody } = await import("../Utils/openRouter.js");

const input = {
  courses: [{ label: "SER 491", skills: ["Agile development", "REST APIs"] }],
  projects: [
    {
      label: "Budget App",
      description: "A budgeting app for students built with React and Supabase",
      skills: ["React", "Supabase"],
    },
  ],
  careerGoals: ["Software Engineer"],
  sections: [
    { kind: "course" as const, label: "SER 491", courseId: 12, courseCode: "SER 491", courseName: "Capstone" },
    { kind: "project" as const, label: "Budget App", projectId: 3, title: "Budget App" },
  ],
};

test("a course block prompt uses that course's mapped skills only", () => {
  const prompt = buildBlockPrompt(input, input.sections[0]!);
  assert.ok(prompt.includes("SER 491"));
  assert.ok(prompt.includes("- Agile development"));
  assert.ok(prompt.includes("- REST APIs"));
  assert.ok(prompt.includes("Software Engineer"));
  // regenerating one block sends only that block
  assert.ok(!prompt.includes("Budget App"));
});

test("a project block prompt sends only that project", () => {
  const prompt = buildBlockPrompt(input, input.sections[1]!);
  assert.ok(prompt.includes("Budget App"));
  assert.ok(prompt.includes("React, Supabase"));
  assert.ok(!prompt.includes("SER 491"));
});

test("block prompts sent to OpenRouter carry no grades or identifiers", () => {
  for (const section of input.sections) {
    const body = buildOpenRouterBody("test/model", buildBlockPrompt(input, section));
    assert.deepEqual(findSensitive(JSON.stringify(body)), []);
  }
});

test("bullet lines are pulled out of an AI reply", () => {
  const reply = `Here are your bullet points:
SER 491:
- Developed REST APIs in an Agile team of five
* **Delivered** sprint demos to faculty stakeholders
1. Wrote integration tests for every endpoint
Hope this helps!`;
  assert.deepEqual(parseBullets(reply), [
    "Developed REST APIs in an Agile team of five",
    "Delivered sprint demos to faculty stakeholders",
    "Wrote integration tests for every endpoint",
  ]);
});
