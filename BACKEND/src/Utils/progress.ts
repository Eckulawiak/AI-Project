// Progress math for the career roadmap (SDS 3.1.2, ProgressService).

export const CATEGORIES = ["COURSE", "SKILL", "CERT", "EXPERIENCE"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CLASS_YEARS = ["FIRST", "SOPH", "JUNIOR", "SENIOR"] as const;
export type ClassYear = (typeof CLASS_YEARS)[number];

export const THRESHOLDS = [25, 50, 75, 100];

// TEMPORARY: which milestones are optional, hard-coded until the
// required column from migrations/required_optional_milestones.sql is
// added to the database. Then read template_milestones.required instead.
const OPTIONAL_NAMES = new Set([
  // university default templates
  "Build a portfolio of your work",
  "Give a presentation on a project",
  "Lead a team project",
  "Finish an online course in your field",
  "Earn an industry certification",
  "Join a student club",
]);
const OPTIONAL_COMPONENTS = new Set([
  // School of Communications framework
  "Pre-Enrollment",
  "Engagement and Involvement",
  "Experiential Learning",
  "Graduate School",
  "Engage Outside World",
  "Mentorship",
]);

// Assessment suggestions (GAP) and experience the student added are
// always optional.
export function isRequiredMilestone(m: {
  source?: string | null;
  name?: string | null;
  component?: string | null;
}) {
  if (m.source === "GAP" || m.source === "EXPERIENCE") return false;
  if (m.name && OPTIONAL_NAMES.has(m.name)) return false;
  if (m.component && OPTIONAL_COMPONENTS.has(m.component)) return false;
  return true;
}

export type Progress = {
  overall: number;
  byCategory: Record<Category, { done: number; total: number; pct: number }>;
  optional: { done: number; total: number };
};

// P(c) = completed(c) / total(c) * 100. The overall figure is the average of
// the category percentages, so each track counts equally; empty categories
// are left out. Only required milestones count; optional ones are tallied
// separately so they never hold a student back.
export function computeProgress(
  milestones: Array<{
    category: string;
    status: string;
    required?: boolean | null;
    source?: string | null;
    name?: string | null;
    component?: string | null;
  }>,
): Progress {
  const byCategory = {} as Progress["byCategory"];
  const pcts: number[] = [];
  const isRequired = (m: (typeof milestones)[number]) =>
    m.required ?? isRequiredMilestone(m);
  const required = milestones.filter(isRequired);
  const optional = milestones.filter((m) => !isRequired(m));

  for (const c of CATEGORIES) {
    const items = required.filter((m) => m.category === c);
    const done = items.filter((m) => m.status === "COMPLETE").length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    byCategory[c] = { done, total: items.length, pct };
    if (items.length) pcts.push((done / items.length) * 100);
  }

  const overall = pcts.length
    ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
    : 0;
  return {
    overall,
    byCategory,
    optional: {
      done: optional.filter((m) => m.status === "COMPLETE").length,
      total: optional.length,
    },
  };
}

// Highest threshold t with before < t <= after, or null. Going down never
// crosses a threshold, so unchecking never celebrates.
export function crossedThreshold(before: number, after: number) {
  const hit = [...THRESHOLDS].reverse().find((t) => before < t && after >= t);
  return hit ?? null;
}

// Suggested year for a course from its number: 100s first year, 200s
// sophomore, 300s junior, 400 and up senior.
export function classYearForCourse(courseCode: string): ClassYear {
  const match = courseCode.match(/(\d)\d{2}/);
  const level = match ? Number(match[1]) : 1;
  if (level <= 1) return "FIRST";
  if (level === 2) return "SOPH";
  if (level === 3) return "JUNIOR";
  return "SENIOR";
}

export function isClassYear(value: unknown): value is ClassYear {
  return (CLASS_YEARS as readonly unknown[]).includes(value);
}
