// Keeps grades and personal identifiers out of anything sent to the AI
// gateway (REQ-RES-8, REQ-SEC-3). Resume input is built from course skill
// mappings and the student's own projects and goals, so this mostly guards
// free text a student typed: a project description that mentions "GPA 3.8"
// or an email address never leaves the server.

type Rule = { name: string; pattern: RegExp };

// Order matters: specific patterns run before the general long-number rule.
const RULES: Rule[] = [
  { name: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { name: "ssn", pattern: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g },
  {
    name: "phone",
    pattern: /(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g,
  },
  // "GPA 3.8", "GPA: 3.75/4.0", "cumulative GPA of 3.9"
  {
    name: "gpa",
    pattern: /\b(?:cumulative\s+|overall\s+|major\s+)?GPA\b\s*(?:of|is|was|:|=|-)?\s*\d(?:\.\d{1,2})?(?:\s*\/\s*\d(?:\.\d{1,2})?)?/gi,
  },
  // a bare "3.8/4.0"
  { name: "gpa", pattern: /\b[0-4]\.\d{1,2}\s*\/\s*4(?:\.0{1,2})?\b/g },
  // "grade: A-", "final grade of B+", "grades were A"
  {
    name: "grade",
    // letter grades are capitals, so "grade a project" is left alone
    pattern: /\b(?:[Ff]inal\s+|[Ll]etter\s+)?[Gg]rades?\s*(?:of|was|were|is|:|=|-)?\s*[A-F][+-]?(?![A-Za-z])/g,
  },
  // "earned an A", "got a B+ in"
  {
    name: "grade",
    pattern: /\b(?:earned|got|received|made)\s+an?\s+["']?[A-F][+-]?["']?(?![A-Za-z])/g,
  },
  // "scored 95%", "score of 88 %"
  { name: "grade", pattern: /\bscored?\s*(?:of\s*)?\d{1,3}(?:\.\d+)?\s*%/gi },
  // "student ID 1234567", "ID #A00123"
  {
    name: "id",
    pattern: /\b(?:student\s+|qu\s+)?id(?:\s*(?:#|no\.?|number))?\s*[:#]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,}\b/gi,
  },
  // any other run of 6+ digits (student, banner or account numbers)
  { name: "id", pattern: /\b\d{6,}\b/g },
];

// Names of the kinds of data found, e.g. ["gpa", "email"]. Empty when clean.
export function findSensitive(text: string): string[] {
  const found = new Set<string>();
  for (const { name, pattern } of RULES) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) found.add(name);
    pattern.lastIndex = 0;
  }
  return [...found];
}

// The text with grades and identifiers removed, and the spacing tidied.
export function redactSensitive(text: string): string {
  let out = text;
  for (const { pattern } of RULES) out = out.replace(pattern, "");
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}
