// Resume bullet points as one block per course or project (REQ-RES-2,
// REQ-RES-5). New blocks are written in one AI request and split by their
// headers; "Regenerate" on one block re-sends only that course or project.
// One request at a time keeps free models under their rate limits.
import { completeWithFallback, type AiFailure } from "../Utils/openRouter.js";
import {
  buildResumePrompt,
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

// REQ-PERF-6: each model gets up to 20 s, and the models share 45 s in
// total, so a slow first model can't leave the last one no time. No reply
// length cap: some free models spend a cap on reasoning and return nothing.
const MODEL_TIMEOUT_MS = 20000;
const TOTAL_TIMEOUT_MS = 45000;
const FAILED = "Couldn't generate bullet points. Try again.";
const BUSY =
  "The free AI models are busy right now. Wait a minute, then click Retry.";

// The message for a block no model could write.
const failedMessage = (failures: AiFailure[]) =>
  failures.length > 0 && failures.every((f) => f === "busy" || f === "timeout" || f === "empty")
    ? BUSY
    : FAILED;

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
  /^(here (are|is)|sure|certainly|these bullet|bullet points?\b|note:|i hope|hope this|let me know)/i.test(
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

const header = (line: string) =>
  line
    .replace(/^#+\s*/, "")
    .replace(/\*\*|__/g, "")
    .replace(/^(course|project)\s*:\s*/i, "")
    .replace(/:\s*$/, "")
    .trim()
    .toLowerCase();

// Split a reply for several sections by their header lines ("SER 491:")
// into bullets per section label. Labels the reply skipped are missing.
export function splitSections(text: string, labels: string[]): Map<string, string[]> {
  const wanted = new Map(labels.map((l) => [l.toLowerCase(), l]));
  const chunks = new Map<string, string[]>();
  let current: string | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const match = wanted.get(header(line));
    if (match && (line.endsWith(":") || line.length <= match.length + 6)) {
      current = match;
      if (!chunks.has(current)) chunks.set(current, []);
      continue;
    }
    if (current) chunks.get(current)!.push(line);
  }

  const out = new Map<string, string[]>();
  for (const [label, lines] of chunks) {
    const bullets = parseBullets(lines.join("\n"));
    if (bullets.length > 0) out.set(label, bullets);
  }
  return out;
}

const blockFor = (section: ResumeSection) => ({
  key: blockKey(section.kind, section.kind === "course" ? section.courseId : section.projectId),
  kind: section.kind,
  refId: section.kind === "course" ? section.courseId : section.projectId,
  heading: headingFor(section),
});

const ai = (prompt: string, failures: AiFailure[], validate: (reply: string) => void) =>
  completeWithFallback(prompt, {
    feature: "RESUME",
    timeoutMs: MODEL_TIMEOUT_MS,
    totalTimeoutMs: TOTAL_TIMEOUT_MS,
    lightReasoning: true,
    failures,
    validate,
  });

// One section: its own small prompt (REQ-RES-5 regenerate).
async function generateOne(input: ResumeInput, section: ResumeSection): Promise<ResumeBlock> {
  const block = blockFor(section);
  let bullets: string[] = [];
  const failures: AiFailure[] = [];
  const text = await ai(buildBlockPrompt(input, section), failures, (reply) => {
    bullets = parseBullets(reply);
    if (bullets.length === 0) throw new Error("No bullet points in the reply");
  });
  if (text == null) {
    // why each model failed is logged by completeWithFallback
    console.warn(`No resume bullets for ${block.key} (${block.heading}).`);
    return { ...block, bullets: [], error: failedMessage(failures) };
  }
  return { ...block, bullets };
}

// Several sections: one prompt with a header per section, split afterwards.
// A section the reply skipped comes back with an error and a Retry.
async function generateMany(input: ResumeInput): Promise<ResumeBlock[]> {
  const labels = input.sections.map((s) => s.label);
  let found = new Map<string, string[]>();
  const failures: AiFailure[] = [];
  const text = await ai(buildResumePrompt(input), failures, (reply) => {
    found = splitSections(reply, labels);
    if (found.size === 0) throw new Error("No sections found in the reply");
  });
  if (text == null) console.warn(`No resume bullets for ${labels.join(", ")}.`);

  return input.sections.map((section) => {
    const bullets = found.get(section.label);
    if (bullets) return { ...blockFor(section), bullets };
    // the reply skipped this section, or no model replied at all
    return { ...blockFor(section), bullets: [], error: text == null ? failedMessage(failures) : FAILED };
  });
}

// One block per course and project picked, in the order picked. A course
// with no mapped skills comes back with an error instead of bullets.
export async function generateBlocks(
  studentId: number,
  request: ResumeRequest,
): Promise<ResumeBlock[]> {
  const input = await loadResumeInput(studentId, request);
  const blocks =
    input.sections.length === 0
      ? []
      : input.sections.length === 1
        ? [await generateOne(input, input.sections[0]!)]
        : await generateMany(input);

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
