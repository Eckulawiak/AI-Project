import { completeWithFallback } from "../Utils/openRouter.js";
import { CLASS_YEARS, isClassYear, type ClassYear } from "../Utils/progress.js";

// AI-suggested Skill, Certification and Internship milestones for a
// student's roadmap. The only thing about the student sent to the model is
// their career goal (and whether it is industry or grad school). Major and
// school skills already come from the curricular skill mapping, so the
// model is told which skills the courses cover and must not repeat them.
// No names, ids, grades or other personal details leave the server
// (REQ-RES-8 / REQ-SEC-3).

export type AiCategory = "SKILL" | "CERT" | "EXPERIENCE";

export type AiSuggestion = {
  category: AiCategory;
  name: string;
  description: string;
  classYear: ClassYear;
  resources: string[]; // "ways to complete", "Label: https://..." for links
};

const MAX = { SKILL: 5, CERT: 3, EXPERIENCE: 3 } as const;

export const normalizeSkill = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();

// Same skill, or one name contains the other ("Python" / "Python
// programming"). Very short names only match exactly.
export function overlapsCourseSkill(name: string, courseSkills: string[]) {
  const n = normalizeSkill(name);
  if (!n) return true;
  return courseSkills.some((s) => {
    const c = normalizeSkill(s);
    if (!c) return false;
    if (c === n) return true;
    const [short, long] = c.length < n.length ? [c, n] : [n, c];
    // word boundaries that also treat + and # as part of a word (C++, C#)
    return (
      short.length >= 3 &&
      new RegExp(`(?<![a-z0-9+#])${escape(short)}(?![a-z0-9+#])`).test(long)
    );
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const q = (s: string) => encodeURIComponent(s.trim());

// Only well-formed https links are shown to students.
function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

// ---------------------------------------------------------------------
// Ways to complete (shared with milestones that come from elsewhere)
// ---------------------------------------------------------------------

export const courseCatalogUrl = (courseCode: string) =>
  `https://catalog.qu.edu/search/?P=${q(courseCode)}`;

export function courseWays(courseCode: string, courseName?: string | null) {
  return [
    `Register for ${courseCode}${courseName ? ` (${courseName})` : ""} during your registration window`,
    `Course description in the QU catalog: ${courseCatalogUrl(courseCode)}`,
    "Check with your academic advisor about when it fits in your plan",
  ];
}

export function skillWays(skill: string) {
  return [
    `Free and low-cost courses on LinkedIn Learning: https://www.linkedin.com/learning/search?keywords=${q(skill)}`,
    "Practice it in a class project, club or personal project, then add it to your resume",
  ];
}

export function certWays(cert: string, officialUrl?: string | null) {
  return [
    // The link comes from the AI, so it is labelled as a suggestion.
    ...(officialUrl
      ? [`Certification site suggested by AI (check it's the official one): ${officialUrl}`]
      : []),
    `Find the official exam and study guide: https://www.google.com/search?q=${q(`${cert} certification official`)}`,
    "Ask Career Development whether QU offers vouchers or prep sessions",
  ];
}

// QU partners with Handshake; until there is a full integration, internship
// cards link students to its sign-in page.
export const HANDSHAKE_SIGN_IN_URL = "https://app.joinhandshake.com/login";
export const HANDSHAKE_SIGN_IN = `Sign in to Handshake with your QU account: ${HANDSHAKE_SIGN_IN_URL}`;

export function internshipWays(search: string) {
  const terms = /intern/i.test(search) ? search : `${search} intern`;
  return [
    HANDSHAKE_SIGN_IN,
    `Search internships on LinkedIn: https://www.linkedin.com/jobs/search/?keywords=${q(terms)}&f_E=1`,
    `Search internships on Handshake: https://app.joinhandshake.com/stu/postings?query=${q(terms)}`,
    `Search internships on Indeed: https://www.indeed.com/jobs?q=${q(terms)}`,
    "Have Career Development review your resume before you apply",
  ];
}

// ---------------------------------------------------------------------
// Prompt and parsing
// ---------------------------------------------------------------------

function buildPrompt(
  careerGoal: string,
  goalType: "INDUSTRY" | "GRAD" | null,
  courseSkills: string[],
) {
  const path =
    goalType === "GRAD" ? "going to graduate school for" : "working in industry as/in";
  return `You are a university career advisor. A student's career goal is ${path}: "${careerGoal}".

Their courses already teach these skills, so do NOT suggest any of them or close variations of them:
${courseSkills.length ? courseSkills.map((s) => `- ${s}`).join("\n") : "- (none listed)"}

Suggest what the student should do outside of class to reach this goal:
- "skills": up to ${MAX.SKILL} specific, job-relevant skills for this career that are NOT in the list above.
- "certifications": up to ${MAX.CERT} real, widely recognized certifications for this career. Only include a certification if it actually exists. "url" must be the official certification page of the organization that awards it.
- "internships": up to ${MAX.EXPERIENCE} kinds of internships or experiences that build toward this career. "search" is a short job-board search phrase for finding them.

For each item, "year" is when an undergraduate should do it: FIRST, SOPH, JUNIOR or SENIOR.
Keep names under 80 characters and descriptions to one plain sentence. Do not promise jobs, admission or any outcome.

Return ONLY JSON in exactly this shape, with no markdown and no other text:
{"skills":[{"name":"","description":"","year":"JUNIOR"}],"certifications":[{"name":"","description":"","year":"SENIOR","url":"https://"}],"internships":[{"name":"","description":"","year":"JUNIOR","search":""}]}`;
}

function extractJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in response");
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object") throw new Error("Not an object");
  return parsed;
}

// Exported for testing: turns a model response into suggestions.
export function parseSuggestions(
  text: string,
  {
    courseSkills,
    earliestYear,
  }: { courseSkills: string[]; earliestYear: ClassYear },
): AiSuggestion[] {
  const json = extractJson(text);
  const minYear = CLASS_YEARS.indexOf(earliestYear);
  const year = (v: unknown): ClassYear => {
    const y = typeof v === "string" ? v.toUpperCase().trim() : "";
    const picked = isClassYear(y) ? y : "JUNIOR";
    return CLASS_YEARS[Math.max(CLASS_YEARS.indexOf(picked), minYear)]!;
  };
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const seen = new Set<string>();
  const out: AiSuggestion[] = [];
  const push = (s: AiSuggestion) => {
    const key = `${s.category}:${normalizeSkill(s.name)}`;
    if (!s.name || seen.has(key)) return;
    seen.add(key);
    count[s.category]++;
    out.push(s);
  };

  const count = { SKILL: 0, CERT: 0, EXPERIENCE: 0 };
  const full = (c: AiCategory) => count[c] >= MAX[c];
  for (const s of list(json.skills)) {
    if (full("SKILL")) break;
    const name = clean(s?.name, 120);
    if (!name || overlapsCourseSkill(name, courseSkills)) continue;
    push({
      category: "SKILL",
      name,
      description: clean(s?.description, 400),
      classYear: year(s?.year),
      resources: skillWays(name),
    });
  }

  for (const c of list(json.certifications)) {
    if (full("CERT")) break;
    const name = clean(c?.name, 120);
    if (!name) continue;
    push({
      category: "CERT",
      name,
      description: clean(c?.description, 400),
      classYear: year(c?.year),
      resources: certWays(name, safeUrl(c?.url)),
    });
  }

  for (const i of list(json.internships)) {
    if (full("EXPERIENCE")) break;
    const name = clean(i?.name, 120);
    if (!name) continue;
    push({
      category: "EXPERIENCE",
      name,
      description: clean(i?.description, 400),
      classYear: year(i?.year),
      resources: internshipWays(clean(i?.search, 80) || name),
    });
  }

  return out;
}

// null when AI is unavailable or every model returned something unusable,
// so the caller can keep what the roadmap already has (REQ-PERF-6).
export async function suggestForCareerGoal(input: {
  careerGoal: string;
  goalType: "INDUSTRY" | "GRAD" | null;
  courseSkills: string[];
  earliestYear: ClassYear;
}): Promise<AiSuggestion[] | null> {
  const goal = input.careerGoal.trim().slice(0, 200);
  if (!goal) return [];

  let parsed: AiSuggestion[] = [];
  const text = await completeWithFallback(
    buildPrompt(goal, input.goalType, input.courseSkills),
    {
      feature: "SKILL_SUGGEST",
      validate: (t) => {
        parsed = parseSuggestions(t, input);
        if (parsed.length === 0) throw new Error("No usable suggestions");
      },
    },
  );
  return text ? parsed : null;
}
