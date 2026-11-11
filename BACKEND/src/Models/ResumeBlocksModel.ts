// Resume bullet points as one block per course or project (REQ-RES-2,
// REQ-RES-5). Each block is its own small AI request, so the blocks are
// generated in parallel and "Regenerate" on one block re-sends only that
// course or project.
import { completeWithFallback } from "../Utils/openRouter.js";
import {
  loadResumeInput,
  type ResumeInput,
  type ResumeRequest,
  type ResumeSection,
} from "./ResumeInputModel.js";

export type ResumeBlock = {
  key: string; // "course:12" or "project:3"
  kind: "course" | "project";
  refId: number;
  heading: string;
  bullets: string[];
  error?: string; // set when this block could not be generated
};

// REQ-PERF-6: each model gets 15 s before the next one is tried; the whole
// cascade gives up after 30 s. No reply length cap: some free models spend
// a cap on reasoning and return nothing.
const MODEL_TIMEOUT_MS = 15000;
const TOTAL_TIMEOUT_MS = 30000;
const PARALLEL = 4;

export const blockKey = (kind: "course" | "project", id: number) => `${kind}:${id}`;

function headingFor(section: ResumeSection) {
  return section.kind === "course"
    ? section.courseName && section.courseName !== section.courseCode
      ? `${section.courseCode}: ${section.courseName}`
      : section.courseCode
    : section.title;
}

// The prompt for one course or project. Only server-side data goes in: the
// skills mapped to the course, or the student's own project, plus career
// goals; never names, grades or ids.
export function buildBlockPrompt(input: ResumeInput, section: ResumeSection) {
  let source: string;
  if (section.kind === "course") {
    const c = input.courses.find((x) => x.label === section.label)!;
    source = `A university course the student completed, ${c.label}, taught these skills:\n${c.skills
      .map((s) => `- ${s}`)
      .join("\n")}`;
  } else {
    const p = input.projects.find((x) => x.label === section.label)!;
    const lines = [`A project the student worked on: ${p.label}`];
    if (p.description) lines.push(`Description: ${p.description}`);
    if (p.skills.length > 0) lines.push(`Tools and skills used: ${p.skills.join(", ")}`);
    source = lines.join("\n");
  }

  const goals = input.careerGoals;
  const goalText =
    goals.length === 0
      ? ""
      : `\nThe student's career goal${goals.length > 1 ? "s are" : " is"}: ${goals.join(
          "; ",
        )}. Where it is accurate, choose wording relevant to ${
          goals.length > 1 ? "these goals" : "this goal"
        }.\n`;

  return `Act as a professional resume writer.

${source}
${goalText}
Write ${section.kind === "course" ? "2 to 4" : "2 to 3"} resume bullet points for this ${
    section.kind
  }.

Rules:
- Start each bullet on its own line with "- " and a strong action verb.
- Use only what is given above. Never invent employers, numbers, results or experience.
- Keep each bullet to one sentence.
- Return only the bullet lines: no heading, no introduction, no markdown.
`;
}

// "- ", "* ", "• ", "– ", "1. ", "2) " and similar bullet markers
const MARKER = /^(?:[-*•‣▪●·–—]|\d+[.)])\s*/;

const tidy = (line: string) =>
  line
    .replace(MARKER, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^["']|["']$/g, "")
    .trim();

// Lines that are chatter or headings rather than bullet points.
const isChatter = (line: string) =>
  line.endsWith(":") ||
  /^(here (are|is)|sure|certainly|these bullet|bullet points?\b|note:|i hope|let me know)/i.test(
    line,
  );

// The bullet lines of an AI reply, without markers or headings. Models
// don't always use "- ", so any common marker works, and a reply with no
// markers at all falls back to its sentence lines.
export function parseBullets(text: string): string[] {
  const lines = text
    .replace(/```[a-z]*/gi, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // a line starting with a year ("2024 ...") is not a numbered bullet
  const marked = lines.filter((line) => MARKER.test(line) && !/^\d{4}\b/.test(line));
  const picked = (marked.length > 0 ? marked : lines).map(tidy);

  return picked.filter((line) => line.length >= 12 && !isChatter(line)).slice(0, 5);
}

async function generateOne(input: ResumeInput, section: ResumeSection): Promise<ResumeBlock> {
  const block = {
    key: blockKey(section.kind, section.kind === "course" ? section.courseId : section.projectId),
    kind: section.kind,
    refId: section.kind === "course" ? section.courseId : section.projectId,
    heading: headingFor(section),
  };

  let bullets: string[] = [];
  const text = await completeWithFallback(buildBlockPrompt(input, section), {
    feature: "RESUME",
    timeoutMs: MODEL_TIMEOUT_MS,
    totalTimeoutMs: TOTAL_TIMEOUT_MS,
    validate: (reply) => {
      bullets = parseBullets(reply);
      if (bullets.length === 0) throw new Error("No bullet points in the reply");
    },
  });

  if (text == null) {
    // why each model failed is logged by completeWithFallback
    console.warn(`No resume bullets for ${block.key} (${block.heading}).`);
    return { ...block, bullets: [], error: "Couldn't generate bullet points. Try again." };
  }
  return { ...block, bullets };
}

// Run fn over items, at most `limit` at a time, keeping the order.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// One block per course and project picked, in the order picked. A course
// with no mapped skills comes back with an error instead of bullets.
export async function generateBlocks(
  studentId: number,
  request: ResumeRequest,
): Promise<ResumeBlock[]> {
  const input = await loadResumeInput(studentId, request);
  const blocks = await mapLimit(input.sections, PARALLEL, (s) => generateOne(input, s));

  const generated = new Set(blocks.map((b) => b.key));
  const unmapped: ResumeBlock[] = request.courseIds
    .filter((id) => !generated.has(blockKey("course", id)))
    .map((id) => ({
      key: blockKey("course", id),
      kind: "course",
      refId: id,
      heading: "",
      bullets: [],
      error: "No skills are mapped to this class yet, so there's nothing to write about.",
    }));

  return [...blocks, ...unmapped];
}
