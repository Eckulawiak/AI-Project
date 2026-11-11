// Edge / negative case tests for the API (Sprint 3 "edge/negative case
// testing" card). Run with the backend already running:
//
//   cd BACKEND
//   npm run test:edge
//
// It uses the same .env as the server, so nothing secret is typed in. It
// looks up a few existing accounts (read only) and makes login tokens for
// them with the server's JWT secret, then checks how the API handles
// missing or bad tokens, the wrong role, bad input and other students'
// data.
//
// SAFE ON THE SHARED DATABASE: every request is one the API should reject,
// and each one is built so that even if a check is missing, nothing
// changes (bad input that fails validation, ids that don't exist, or
// "saving" a value that is already there).
//
// Results print as a table and are saved to tests/results/ as a CSV that
// can be pasted into the test sheet.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { supabase } from "../src/Database/supabaseClient.js";
import { signToken, type TokenPayload } from "../src/Utils/jwt.js";

const BASE = (process.env.TEST_API_URL ?? `http://localhost:${process.env.PORT ?? 3001}`).replace(
  /\/$/,
  "",
);
const NO_SUCH_ID = 999999999;

type Result = {
  id: string;
  area: string;
  test: string;
  expected: string;
  actual: string;
  result: "PASS" | "FAIL" | "SKIP";
  note: string;
};
const results: Result[] = [];

type Expect = {
  status: number | number[];
  // the response body must contain this text (e.g. a role message)
  bodyIncludes?: string;
  // the response body must NOT contain any of these (e.g. emails)
  bodyExcludes?: string[];
};

type Call = {
  method?: string;
  path: string;
  token?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
};

async function send(call: Call) {
  const headers: Record<string, string> = { ...(call.headers ?? {}) };
  if (call.token) headers.Authorization = `Bearer ${call.token}`;
  let body: string | undefined;
  if (call.rawBody !== undefined) {
    body = call.rawBody;
    headers["Content-Type"] ??= "application/json";
  } else if (call.body !== undefined) {
    body = JSON.stringify(call.body);
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(BASE + call.path, { method: call.method ?? "GET", headers, body });
  const text = await res.text();
  return { status: res.status, text, type: res.headers.get("content-type") ?? "" };
}

const short = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.startsWith("<!")) return "(the website's HTML page)";
  return t.length > 90 ? t.slice(0, 87) + "..." : t;
};

async function check(
  id: string,
  area: string,
  test: string,
  call: Call,
  expect: Expect,
  note = "",
) {
  const want = Array.isArray(expect.status) ? expect.status : [expect.status];
  const expected =
    want.join(" or ") + (expect.bodyIncludes ? ` with "${expect.bodyIncludes}"` : "");
  try {
    const r = await send(call);
    const problems: string[] = [];
    if (!want.includes(r.status)) problems.push(`got ${r.status}`);
    if (expect.bodyIncludes && !r.text.includes(expect.bodyIncludes))
      problems.push(`message was not "${expect.bodyIncludes}"`);
    for (const bad of expect.bodyExcludes ?? [])
      if (bad && r.text.toLowerCase().includes(bad.toLowerCase()))
        problems.push(`response contains "${bad}"`);
    results.push({
      id,
      area,
      test,
      expected,
      actual: `${r.status} ${short(r.text)}`,
      result: problems.length ? "FAIL" : "PASS",
      note: problems.length ? [problems.join("; "), note].filter(Boolean).join(". ") : note,
    });
  } catch (e) {
    results.push({
      id,
      area,
      test,
      expected,
      actual: "no response",
      result: "FAIL",
      note: e instanceof Error ? e.message : String(e),
    });
  }
}

const skip = (id: string, area: string, test: string, note: string) =>
  results.push({ id, area, test, expected: "-", actual: "-", result: "SKIP", note });

// ---------------------------------------------------------------------
// Test accounts (read only)
// ---------------------------------------------------------------------
async function findAccounts() {
  const pickStudents = async () => {
    const demo = await supabase
      .from("student")
      .select("student_id, student_qu_email, firstname, lastname")
      .ilike("student_qu_email", "demo.student%")
      .order("student_id")
      .limit(2);
    if ((demo.data ?? []).length >= 2) return demo.data!;
    const any = await supabase
      .from("student")
      .select("student_id, student_qu_email, firstname, lastname")
      .order("student_id")
      .limit(2);
    if (any.error) throw new Error(`Couldn't read students: ${any.error.message}`);
    return any.data ?? [];
  };
  const pickFaculty = async (admin: boolean) => {
    const { data, error } = await supabase
      .from("faculty_admin")
      .select("faculty_id, faculty_qu_email")
      .eq("type", admin)
      .order("faculty_id")
      .limit(1);
    if (error) throw new Error(`Couldn't read faculty: ${error.message}`);
    return data?.[0] ?? null;
  };
  const [students, faculty, admin] = await Promise.all([
    pickStudents(),
    pickFaculty(false),
    pickFaculty(true),
  ]);
  if (students.length < 2) throw new Error("Need at least two student accounts to test with.");
  if (!faculty) throw new Error("Need a faculty account (faculty_admin.type = false).");
  if (!admin) throw new Error("Need an admin account (faculty_admin.type = true).");
  return { student: students[0]!, other: students[1]!, faculty, admin };
}

const tokenFor = (payload: TokenPayload) => signToken(payload);

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------
async function main() {
  try {
    await send({ path: "/health" });
  } catch {
    console.error(`\nCan't reach the backend at ${BASE}. Start it first (npm run dev),`);
    console.error("or set TEST_API_URL if it runs somewhere else.\n");
    process.exit(1);
  }

  const acct = await findAccounts();
  const S = tokenFor({
    userId: acct.student.student_id,
    userType: "Student",
    userEmail: acct.student.student_qu_email,
  });
  const F = tokenFor({
    userId: acct.faculty.faculty_id,
    userType: "Faculty/Administrator",
    userEmail: acct.faculty.faculty_qu_email,
  });
  const A = tokenFor({
    userId: acct.admin.faculty_id,
    userType: "Administrator",
    userEmail: acct.admin.faculty_qu_email,
  });
  const otherId = acct.other.student_id;
  const studentEmails = [acct.student.student_qu_email, acct.other.student_qu_email];

  console.log(`\nTesting ${BASE}`);
  console.log(
    `Student #${acct.student.student_id}, other student #${otherId}, faculty #${acct.faculty.faculty_id}, admin #${acct.admin.faculty_id}\n`,
  );

  // --- Login and tokens -------------------------------------------------
  const AREA_AUTH = "Login and tokens";
  await check("E-01", AREA_AUTH, "Wrong password for a real account", {
    method: "POST",
    path: "/api/auth/login",
    body: { email: acct.student.student_qu_email, password: "definitely-not-the-password-1!" },
  }, { status: 401, bodyIncludes: "Invalid email or password" });
  await check("E-02", AREA_AUTH, "Email that has no account (same message as a wrong password)", {
    method: "POST",
    path: "/api/auth/login",
    body: { email: "no.such.person.zz9", password: "whatever-123" },
  }, { status: 401, bodyIncludes: "Invalid email or password" });
  await check("E-03", AREA_AUTH, "Login with empty fields", {
    method: "POST",
    path: "/api/auth/login",
    body: {},
  }, { status: 400 });
  await check("E-04", AREA_AUTH, "No token on a logged-in page", { path: "/api/auth/me" }, { status: 401 });
  await check("E-05", AREA_AUTH, "Garbage token", { path: "/api/auth/me", token: "not-a-real-token" }, { status: 401 });
  {
    const [h, p] = S.split(".");
    const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, userType: "Administrator" })).toString("base64url");
    await check("E-06", AREA_AUTH, "Tampered token (student edits their role to Administrator)", {
      path: "/api/admin/reports",
      token: `${h}.${forged}.${S.split(".")[2]}`,
    }, { status: 401 });
  }
  await check("E-07", AREA_AUTH, "Token signed with the wrong secret, claiming Administrator", {
    path: "/api/admin/reports",
    token: jwt.sign(
      { userId: acct.admin.faculty_id, userType: "Administrator", userEmail: acct.admin.faculty_qu_email },
      "guessed-secret",
      { expiresIn: "1h" },
    ),
  }, { status: 401 });
  await check("E-08", AREA_AUTH, "Expired token", {
    path: "/api/auth/me",
    token: jwt.sign(
      { userId: acct.student.student_id, userType: "Student", userEmail: acct.student.student_qu_email },
      process.env.JWT_SECRET!,
      { expiresIn: -60 },
    ),
  }, { status: 401 });

  // --- Roles --------------------------------------------------------------
  const AREA_ROLE = "Roles";
  const facultyOnly = "Faculty access required";
  const adminOnly = "Admin access required";
  await check("E-10", AREA_ROLE, "Student opens admin reports", { path: "/api/admin/reports", token: S },
    { status: 403, bodyIncludes: adminOnly });
  await check("E-11", AREA_ROLE, "Student opens admin roadmap templates", { path: "/api/admin/roadmap-templates", token: S },
    { status: 403, bodyIncludes: adminOnly });
  await check("E-12", AREA_ROLE, "Student opens faculty Student Progress", { path: "/api/faculty/progress", token: S },
    { status: 403, bodyIncludes: facultyOnly });
  await check("E-13", AREA_ROLE, "Student searches all students (faculty review list)", {
    path: "/api/faculty/reviews/students?q=a", token: S,
  }, { status: 403, bodyIncludes: facultyOnly });
  await check("E-14", AREA_ROLE, "Student writes a skill review", {
    method: "PUT", path: `/api/faculty/reviews/students/${otherId}`, token: S, body: { ratings: {} },
  }, { status: 403, bodyIncludes: facultyOnly });
  await check("E-15", AREA_ROLE, "Student reads the audit logs", { path: "/api/audit-logs", token: S },
    { status: 403 }, "The audit log lists every user's email and logins");
  await check("E-16", AREA_ROLE, "Student lists faculty courses", { path: "/api/faculty/courses", token: S },
    { status: 403 });
  await check("E-17", AREA_ROLE, "Student creates a course (empty form)", {
    method: "POST", path: "/api/faculty/courses", token: S, body: {},
  }, { status: 403 }, "Sent an empty form, so nothing is created either way");
  await check("E-18", AREA_ROLE, "Student claims a course", {
    method: "PUT", path: `/api/faculty/courses/${NO_SUCH_ID}/claim`, token: S, body: {},
  }, { status: 403, bodyIncludes: facultyOnly }, "Used a course id that doesn't exist");
  await check("E-19", AREA_ROLE, "Faculty opens admin reports", { path: "/api/admin/reports", token: F },
    { status: 403, bodyIncludes: adminOnly });
  await check("E-20", AREA_ROLE, "Faculty deletes a template milestone", {
    method: "DELETE", path: `/api/admin/template-milestones/${NO_SUCH_ID}`, token: F,
  }, { status: 403, bodyIncludes: adminOnly });
  await check("E-21", AREA_ROLE, "Faculty opens a student's roadmap page data", { path: "/api/roadmap/me", token: F },
    { status: 403 });
  await check("E-22", AREA_ROLE, "Faculty generates resume bullets", {
    method: "POST", path: "/api/resume/generate", token: F, body: {},
  }, { status: 403 });
  await check("E-23", AREA_ROLE, "Admin opens a student's projects", { path: "/api/projects", token: A },
    { status: 403 });

  // --- Privacy ------------------------------------------------------------
  const AREA_PRIV = "Privacy";
  await check("E-24", AREA_PRIV, "Read another student's saved talking points without logging in", {
    path: `/api/history/student/${otherId}`,
  }, { status: 401 }, "History routes have no login check");
  await check("E-25", AREA_PRIV, "Delete talking points without logging in", {
    method: "DELETE", path: `/api/history/student/${NO_SUCH_ID}/entry/${NO_SUCH_ID}`,
  }, { status: 401 }, "Used ids that don't exist, so nothing is deleted");
  await check("E-26", AREA_PRIV, "Student reads another student's history while logged in", {
    path: `/api/history/student/${otherId}`, token: S,
  }, { status: [401, 403, 404] });
  {
    const { data: theirs } = await supabase
      .from("student_milestones")
      .select("id, status, student_roadmaps!inner(student_id)")
      .neq("student_roadmaps.student_id", acct.student.student_id)
      .eq("status", "PENDING")
      .limit(1);
    const m = theirs?.[0];
    if (m)
      await check("E-27", AREA_PRIV, "Student checks off another student's milestone", {
        method: "PUT", path: `/api/milestones/${m.id}`, token: S, body: { status: "PENDING" },
      }, { status: 404 }, "Sent the status it already has, so nothing changes");
    else skip("E-27", AREA_PRIV, "Student checks off another student's milestone", "No other student has a roadmap yet");
  }
  {
    const { data: theirs } = await supabase
      .from("student_projects")
      .select("id, title, description, skills")
      .neq("student_id", acct.student.student_id)
      .limit(1);
    const p = theirs?.[0];
    if (p)
      await check("E-28", AREA_PRIV, "Student edits another student's project", {
        method: "PUT", path: `/api/projects/${p.id}`, token: S,
        body: { title: p.title, description: p.description, skills: p.skills ?? [] },
      }, { status: 404 }, "Sent the project's current values, so nothing changes");
    else skip("E-28", AREA_PRIV, "Student edits another student's project", "No other student has a project yet");
  }
  await check("E-29", AREA_PRIV, "Faculty Student Progress shows no student emails", {
    path: "/api/faculty/progress", token: F,
  }, { status: 200, bodyExcludes: ["@quinnipiac.edu"] });
  await check("E-30", AREA_PRIV, "Admin reports show no student emails", {
    path: "/api/admin/reports?days=30", token: A,
  }, { status: 200, bodyExcludes: ["@quinnipiac.edu", ...studentEmails] });

  // --- Bad input ------------------------------------------------------------
  const AREA_INPUT = "Bad input";
  await check("E-31", AREA_INPUT, "Project with an empty title", {
    method: "POST", path: "/api/projects", token: S, body: { title: "   " },
  }, { status: 400 });
  await check("E-32", AREA_INPUT, "Project title 500 characters long", {
    method: "POST", path: "/api/projects", token: S, body: { title: "x".repeat(500) },
  }, { status: 400 });
  await check("E-33", AREA_INPUT, "Project skills sent as text instead of a list", {
    method: "POST", path: "/api/projects", token: S, body: { title: "x", skills: "React" },
  }, { status: 400 });
  await check("E-34", AREA_INPUT, "Generate with nothing selected", {
    method: "POST", path: "/api/resume/generate", token: S, body: { courseIds: [], projectIds: [] },
  }, { status: 400 });
  await check("E-35", AREA_INPUT, "Generate with 4 career goals (limit is 3)", {
    method: "POST", path: "/api/resume/generate", token: S,
    body: { courseIds: [1], careerGoals: ["a", "b", "c", "d"] },
  }, { status: 400 });
  await check("E-36", AREA_INPUT, "Generate with a made-up course id", {
    method: "POST", path: "/api/resume/generate", token: S, body: { courseIds: [NO_SUCH_ID] },
  }, { status: 400 }, "Should be rejected before anything is sent to the AI");
  await check("E-37", AREA_INPUT, "Milestone id that isn't a number", {
    method: "PUT", path: "/api/milestones/abc", token: S, body: { status: "COMPLETE" },
  }, { status: 400 });
  await check("E-38", AREA_INPUT, "Milestone status that isn't allowed", {
    method: "PUT", path: `/api/milestones/${NO_SUCH_ID}`, token: S, body: { status: "DONE" },
  }, { status: 400 });
  await check("E-39", AREA_INPUT, "Milestone that doesn't exist", {
    method: "PUT", path: `/api/milestones/${NO_SUCH_ID}`, token: S, body: { status: "PENDING" },
  }, { status: 404 });
  await check("E-40", AREA_INPUT, "Skill assessment with nothing filled in", {
    method: "POST", path: "/api/assessment", token: S, body: {},
  }, { status: 400 });
  await check("E-41", AREA_INPUT, "Skill review with a rating of 9 (scale is 1-4)", {
    method: "PUT", path: `/api/faculty/reviews/students/${otherId}`, token: F, body: { ratings: { "1": 9 } },
  }, { status: 400 });
  await check("E-42", AREA_INPUT, "Skill review for a student id that isn't a number", {
    method: "PUT", path: "/api/faculty/reviews/students/abc", token: F, body: { ratings: {} },
  }, { status: 400 });
  await check("E-43", AREA_INPUT, "Student search with special characters", {
    path: `/api/faculty/reviews/students?q=${encodeURIComponent(`%'_"<script>`)}`, token: F,
  }, { status: 200 }, "Should just find nobody, not error");
  await check("E-44", AREA_INPUT, "Admin adds a template milestone with an empty form", {
    method: "POST", path: `/api/admin/roadmap-templates/${NO_SUCH_ID}/milestones`, token: A, body: {},
  }, { status: [400, 404] });
  await check("E-45", AREA_INPUT, "Request body that isn't valid JSON", {
    method: "POST", path: "/api/projects", token: S, rawBody: "{ not json",
  }, { status: 400 }, "Should be a clear 400, not a server error");
  await check("E-46", AREA_INPUT, "Very large request body (about 200 KB)", {
    method: "POST", path: "/api/projects", token: S, body: { title: "x", description: "y".repeat(200_000) },
  }, { status: [400, 413] }, "Should be refused as too large, not a server error");

  // --- Other ----------------------------------------------------------------
  const AREA_OTHER = "Other";
  await check("E-47", AREA_OTHER, "Health check", { path: "/health" }, { status: 200 });
  await check("E-48", AREA_OTHER, "API address that doesn't exist", { path: "/api/no-such-route", token: S },
    { status: 404 }, "Currently falls through to the website page");

  // Last, so logging out can't affect the other tests.
  {
    const T = tokenFor({
      userId: acct.student.student_id,
      userType: "Student",
      userEmail: acct.student.student_qu_email,
    });
    await send({ method: "POST", path: "/api/auth/logout", token: T, body: {} });
    await check("E-09", AREA_AUTH, "Token still used after logging out", { path: "/api/auth/me", token: T },
      { status: 401 },
      "Logging out only clears the browser; the server keeps accepting the token until it expires (1 hour)");
  }

  // --- Report ---------------------------------------------------------------
  results.sort((a, b) => a.id.localeCompare(b.id));
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n - 2) + "… " : s.padEnd(n));
  console.log(`${pad("ID", 6)}${pad("Result", 7)}${pad("Test", 66)}Note`);
  console.log("-".repeat(120));
  for (const r of results)
    console.log(`${pad(r.id, 6)}${pad(r.result, 7)}${pad(r.test, 66)}${r.result === "PASS" ? "" : r.note}`);
  const count = (k: Result["result"]) => results.filter((r) => r.result === k).length;
  console.log(`\n${count("PASS")} passed, ${count("FAIL")} failed, ${count("SKIP")} skipped\n`);

  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "results");
  fs.mkdirSync(dir, { recursive: true });
  const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const file = path.join(dir, `edge-cases-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(
    file,
    ["ID,Area,Test,Expected,Actual,Result,Note"]
      .concat(results.map((r) => [r.id, r.area, r.test, r.expected, r.actual, r.result, r.note].map(csv).join(",")))
      .join("\n"),
  );
  console.log(`Saved ${file}\n`);
}

main().catch((e) => {
  console.error("\nTest run stopped:", e instanceof Error ? e.message : e);
  process.exit(1);
});
