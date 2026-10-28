/**
 * QU Course Catalog Scraper
 * ─────────────────────────
 * Fills schools, majors, courses and major_courses in Supabase from
 * https://catalog.qu.edu. Safe to re-run: existing rows are updated by name
 * (schools, majors) or course code (courses), never duplicated.
 *
 *   schools        ← the school/college pages linked from the catalog home
 *   majors         ← the bachelor's, master's and doctoral programs listed on
 *                    each school's undergraduate and graduate pages
 *                    (minors, certificates and dual degrees are skipped)
 *   courses        ← every course on every undergraduate and graduate
 *                    subject page
 *   major_courses  ← the courses named in each major's requirements table,
 *                    REQUIRED or RECOMMENDED (electives and pick-one lists)
 *
 * The catalog does not list instructors, so new courses get professor "N/A"
 * (the column default); faculty still claim their courses in the app.
 *
 * Usage (from BACKEND/):
 *   npm run scrape              scrape and write to Supabase
 *   npm run scrape -- --dry-run scrape and write catalog.json only
 *   npm run scrape -- --clear   empty the scraped tables first, then write
 *
 * --clear runs only after the scrape succeeds, so a failed scrape never
 * leaves the tables empty.
 */

import * as cheerio from "cheerio";
import fetch from "node-fetch";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const BASE_URL = "https://catalog.qu.edu";
const SUBJECT_INDEXES: { path: string; level: "undergrad" | "grad" }[] = [
  { path: "/courses-undergraduate/", level: "undergrad" },
  { path: "/courses-graduate/", level: "grad" },
];
const REQUEST_DELAY_MS = 500;
const USER_AGENT =
  "Mozilla/5.0 (compatible; QU-Career-Services-Scraper/1.0; +https://catalog.qu.edu)";

// ── Schools: display name → catalog page paths ──────────────────────────────
// From the catalog home and Graduate Studies sidebars. Law and Medicine have
// one page that lists their graduate programs; Education is graduate-only.
export type Level = "undergrad" | "grad";

export const SCHOOLS: Record<string, { undergrad?: string; grad?: string }> = {
  "College of Arts & Sciences": {
    undergrad: "/arts-sciences/",
    grad: "/graduate-studies/arts-sciences/",
  },
  "School of Business": {
    undergrad: "/business/",
    grad: "/graduate-studies/business/",
  },
  "School of Communications": {
    undergrad: "/communications/",
    grad: "/graduate-studies/communications/",
  },
  "School of Computing & Engineering": {
    undergrad: "/engineering/",
    grad: "/graduate-studies/engineering/",
  },
  "School of Education": { grad: "/graduate-studies/education/" },
  "School of Health Sciences": {
    undergrad: "/health-sciences/",
    grad: "/graduate-studies/health-sciences/",
  },
  "School of Law": { grad: "/school-of-law/" },
  "Frank H. Netter MD School of Medicine": { grad: "/school-of-medicine/" },
  "School of Nursing": {
    undergrad: "/nursing/",
    grad: "/graduate-studies/nursing/",
  },
};

export type ScrapedMajor = {
  name: string;
  // The subject a course list is named after, e.g. "Computer Science" for
  // both "Computer Science" (BS) and "Master of Science in Computer Science".
  field: string;
  level: Level;
  school: string;
  urls: string[];
  // Courses every student in the major takes, and the ones they choose
  // between (electives, pick lists, "or" alternatives).
  requiredCodes: string[];
  electiveCodes: string[];
};

export type ScrapedCourse = {
  course_code: string;
  course_name: string;
  subject: string;
  level: Level;
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The catalog server drops some requests (ECONNRESET), so retry with
// backoff and skip the page instead of ending the whole run.
async function fetchPage(path: string, attempts = 4): Promise<string | null> {
  const url = new URL(path, BASE_URL).toString();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      });
      await sleep(REQUEST_DELAY_MS);
      if (res.ok) return await res.text();
      if (res.status < 500 && res.status !== 429) {
        console.error(`  ✗ Failed to fetch ${url} (${res.status})`);
        return null;
      }
      console.warn(`  ! ${url} returned ${res.status} (attempt ${attempt}/${attempts})`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`  ! ${url}: ${reason} (attempt ${attempt}/${attempts})`);
    }
    await sleep(1000 * 2 ** attempt);
  }
  console.error(`  ✗ Giving up on ${url}`);
  return null;
}

// "SER 120" / "SER&nbsp;120" → "SER-120" (the format the app already uses)
export function normalizeCode(raw: string): string {
  return raw.replace(/ /g, " ").trim().replace(/\s+/, "-");
}

// The catalog puts zero-width spaces in some names ("Game Design &\u200b
// Development"), which breaks name matching, so strip them.
const clean = (s: string) =>
  s
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ── Subjects: "Software Engineering (SER)" → { name, path } ─────────────────
export function parseSubjectIndex(
  html: string,
  indexPath: string,
): { name: string; path: string }[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, string>();
  $(`a[href^="${indexPath}"]`).each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const match = clean($(el).text()).match(/^(.+?)\s*\(([A-Z]+)\)$/);
    // Subject pages end in "/"; this skips "Download Page (PDF)".
    if (!match || href === indexPath || !href.endsWith("/")) return;
    if (seen.has(href)) return;
    seen.set(href, match[1]!);
  });
  return [...seen].map(([path, name]) => ({ name, path }));
}

// ── Courses on one subject page ─────────────────────────────────────────────
export function parseSubjectPage(
  html: string,
  subject: string,
  level: Level = "undergrad",
): ScrapedCourse[] {
  const $ = cheerio.load(html);
  const courses: ScrapedCourse[] = [];

  $(".courseblock").each((_i, el) => {
    // Title text looks like: "SER 120. Object-Oriented Design and Programming.3 Credits."
    const titleText = clean($(el).find(".courseblocktitle").first().text());
    const dotIndex = titleText.indexOf(". ");
    if (dotIndex === -1) return; // malformed, skip

    const courseCode = normalizeCode(titleText.substring(0, dotIndex));
    const courseName = titleText
      .substring(dotIndex + 2)
      .replace(/\s*\d+(\.\d+)?(\s*-\s*\d+(\.\d+)?)?\s+Credits?\.?\s*$/i, "") // "3 Credits." / "1-3 Credits."
      .replace(/\.$/, "")
      .trim();

    if (!courseCode || !courseName) return;
    courses.push({ course_code: courseCode, course_name: courseName, subject, level });
  });

  return courses;
}

// ── Degree programs on one school page ──────────────────────────────────────
// Pages differ: Engineering lists "Bachelor of Science in Computer Science"
// under a "Bachelor of Science" heading, Business lists "Accounting" under
// "Bachelor's Degrees", Health Sciences lists "Physician Assistant" under
// "Master of Health Science", and some pages use bold text, not headings.
// A link counts as a program if it is inside the school page's own path and
// either sits under a degree heading, names the degree ("Bachelor of ...",
// "Master of ..."), or its URL ends in a degree slug (-bs, ms-..., -dpt...).
const SKIP_ANY =
  /accelerated|dual|double|part-time|second degree|completion|minor|certificate|badge|micro-credential|concentration/i;
// Combined degrees named like "JD/MBA" or "BA/MS" (link and heading text only)
const COMBINED_DEGREE = /\b[A-Z]{2,4}\/[A-Z]{2,4}\b/;

const LEVEL_RULES: Record<
  Level,
  { heading: RegExp; text: RegExp; slug: RegExp; skip: RegExp }
> = {
  undergrad: {
    heading: /^bachelor/i,
    text: /^bachelor of/i,
    slug: /(^|-)(bs|ba|bfa|bsn|bba)(-|$)/,
    skip: /master|doctor|juris/i,
  },
  grad: {
    heading: /^(master|doctor|doctoral|juris|post-baccalaureate|graduate degree)/i,
    text: /^(master|doctor|juris|post-baccalaureate|m[a-z]{1,3} in )/i,
    slug: /(^|-)(ms|ma|mba|mhs|msw|msn|mot|mat|med|otd|dpt|dnp|edd|jd|md)(-|$)/,
    skip: /bachelor/i,
  },
};

const DEGREE_WORDS = /\b(bachelor|master|doctor|doctorate|juris)\b/i;

export function majorNameFromLink(text: string): string {
  return clean(text)
    .replace(/^bachelor of [a-z ]+? in\s+/i, "")
    .replace(/^bachelor of /i, "")
    .replace(/\s*\((BA|BS|BFA|BBA|BSN)\)$/i, "")
    .trim();
}

// "Computer Science" under "Master of Science" → "Master of Science in
// Computer Science"; "Full-Time Juris Doctor Program" → "Juris Doctor".
export function gradNameFromLink(text: string, heading: string): string {
  const name = clean(text)
    .replace(/^full-time\s+/i, "")
    .replace(/\s+program$/i, "")
    .trim();
  if (DEGREE_WORDS.test(name) || /^m[a-z]{1,3} in /i.test(name)) return name;
  // Only a heading that is itself a degree title ("Master of Science") is
  // prefixed; "Master's Degree" or "Doctoral Degrees" just label a list.
  const degree = clean(heading.replace(/\(.*?\)/g, ""));
  if (!/^(master|doctor) of |^juris doctor/i.test(degree)) return name;
  return / in /i.test(degree) ? `${degree}: ${name}` : `${degree} in ${name}`;
}

// "Master of Science in Computer Science" → "Computer Science"
export function fieldOf(name: string): string {
  const match = name.match(/ in (.+)$/i);
  return match ? match[1]!.trim() : name;
}

export function parseSchoolPrograms(
  html: string,
  schoolPath: string,
  level: Level = "undergrad",
): { name: string; path: string }[] {
  const rules = LEVEL_RULES[level];
  const $ = cheerio.load(html);
  const programs = new Map<string, string>(); // path → name
  const schoolDepth = schoolPath.split("/").filter(Boolean).length;
  // What the most recent heading was about: a degree list for this level,
  // a list to skip (minors, dual degrees, the other level...), or other.
  let section: "degrees" | "skip" | "other" = "other";
  let heading = "";

  // find() returns elements in document order, so each link is seen after
  // the heading it sits under. Short bold paragraphs count as headings.
  $("body")
    .find("h1, h2, h3, h4, h5, p > strong, p > b, a")
    .each((_i, el) => {
      if (el.tagName !== "a") {
        const text = clean($(el).text());
        if (text.length > 80) return;
        heading = text;
        section =
          SKIP_ANY.test(text) || COMBINED_DEGREE.test(text) || rules.skip.test(text)
            ? "skip"
            : rules.heading.test(text)
              ? "degrees"
              : "other";
        return;
      }

      const href = $(el).attr("href") ?? "";
      let path: string;
      try {
        const url = new URL(href, BASE_URL);
        if (url.origin !== BASE_URL) return;
        path = url.pathname;
      } catch {
        return;
      }
      if (!path.endsWith("/")) path += "/";
      if (!path.startsWith(schoolPath) || path === schoolPath) return;

      const text = clean($(el).text());
      if (!text || SKIP_ANY.test(text) || SKIP_ANY.test(path)) return;
      if (COMBINED_DEGREE.test(text)) return;
      if (rules.skip.test(text) || programs.has(path)) return;

      // Undergrad department pages (/school/dept/) show up in the sidebar
      // while a bachelor's heading is still "open", so for undergrad a
      // heading alone needs a program-depth path (/school/dept/program/).
      const segments = path.split("/").filter(Boolean);
      const slug = segments[segments.length - 1] ?? "";
      const minDepth = level === "undergrad" ? 3 : schoolDepth + 1;
      const isProgram =
        section !== "skip" &&
        (rules.text.test(text) ||
          rules.slug.test(slug) ||
          (section === "degrees" && segments.length >= minDepth));
      if (!isProgram) return;

      const name =
        level === "undergrad"
          ? majorNameFromLink(text)
          : gradNameFromLink(text, section === "degrees" ? heading : "");
      if (name) programs.set(path, name);
    });

  return [...programs].map(([path, name]) => ({ name, path }));
}

// ── Course codes in a program's requirements table ──────────────────────────
// CourseLeaf requirement tables mix courses every student takes with ones
// they pick from. A course counts as an elective when it sits:
//   - under an area header that says "elective",
//   - in a pick list: the rows after a comment such as "Select one of the
//     following" or "Math electives ... must come from this list" (indented
//     rows when the table indents, otherwise every row up to the next
//     comment or header), or
//   - on either side of an "or" row (Calculus I or MA 151).
// Everything else is required. A code that is required anywhere on the
// page stays required.
export type ProgramCourses = { required: string[]; electives: string[] };

const ELECTIVE_HEADER = /elective/i;
const PICK_LIST =
  /(select|choose|pick)\b|one of the|following|from (this|the) list|from among|list below/i;

export function parseProgramCourses(html: string): ProgramCourses {
  const $ = cheerio.load(html);
  // One entry per row that names courses; an "or" row flips the row before.
  const listed: { codes: string[]; elective: boolean }[] = [];

  $("table.sc_courselist").each((_t, table) => {
    const rows = $(table).find("tr").toArray();
    const isIndented = (row: (typeof rows)[number]) =>
      $(row).find("td.codecol div.blockindent, td.codecol div[style*='margin-left']")
        .length > 0;
    const tableIndents = rows.some(isIndented);

    let electiveArea = false;
    let pickList = false;
    let previous: { codes: string[]; elective: boolean } | undefined;

    for (const row of rows) {
      const $row = $(row);
      // "CSC 110 & 110L": a bare number takes the subject before it.
      let subject = "";
      const codes = $row
        .find("a.code, td.codecol a")
        .toArray()
        .map((a) => {
          const code = normalizeCode(clean($(a).text()));
          if (/^\d+[A-Z]?$/.test(code) && subject) return `${subject}-${code}`;
          subject = code.split("-")[0] ?? "";
          return code;
        })
        .filter((code) => /^[A-Z]+-\d+[A-Z]?$/.test(code));
      const text = clean($row.text());

      if ($row.hasClass("listsum") || /^total credits/i.test(text)) {
        pickList = false;
        previous = undefined;
        continue;
      }
      if ($row.hasClass("areaheader") || $row.find(".areaheader").length) {
        electiveArea = ELECTIVE_HEADER.test(text);
        pickList = false;
        previous = undefined;
        continue;
      }

      const isComment =
        $row.find("td.codecol").length === 0 &&
        $row.find(".courselistcomment").length > 0;
      if (isComment) {
        pickList = PICK_LIST.test(text);
        // A comment can name a single course, e.g. "Discrete Math (CSC 205)".
        if (codes.length)
          listed.push({ codes, elective: electiveArea || pickList });
        previous = undefined;
        continue;
      }
      if (codes.length === 0) continue;

      // "or MA 151": this row and the one before it are alternatives.
      if ($row.hasClass("orclass") || /^or\b/i.test(text)) {
        if (previous) previous.elective = true;
        listed.push({ codes, elective: true });
        continue;
      }

      if (pickList && tableIndents && !isIndented(row)) pickList = false;
      previous = { codes, elective: electiveArea || pickList };
      listed.push(previous);
    }
  });

  const required = new Set(
    listed.filter((r) => !r.elective).flatMap((r) => r.codes),
  );
  const electives = new Set(
    listed
      .filter((r) => r.elective)
      .flatMap((r) => r.codes)
      .filter((code) => !required.has(code)),
  );
  return { required: [...required], electives: [...electives] };
}

// ── Course subject → major ──────────────────────────────────────────────────
// Courses are listed by subject, not major, so a course gets the major whose
// name matches its subject. Names are compared loosely ("&" = "and", case
// and punctuation ignored), and a subject that starts exactly one major's
// name also matches ("Hispanic" → "Hispanic and Latin American Studies").
// Subjects that aren't majors at QU (Art, Physics, QU Seminars...) get none.
const nameKey = (s: string) =>
  clean(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/^bachelor of /, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function matchSubjectToMajor(
  subject: string,
  level: Level,
  majors: Pick<ScrapedMajor, "name" | "field" | "level">[],
): string | undefined {
  const key = nameKey(subject);
  const match = (pool: typeof majors) => {
    const exact = pool.find((m) => nameKey(m.field) === key);
    if (exact) return exact.name;
    const prefixed = pool.filter((m) => nameKey(m.field).startsWith(key + " "));
    const fields = new Set(prefixed.map((m) => nameKey(m.field)));
    return fields.size === 1 ? prefixed[0]!.name : undefined;
  };
  // Undergraduate courses go to undergraduate majors first and graduate
  // courses to graduate ones (CSC 110 → Computer Science, CSC 510 → MS in CS).
  return (
    match(majors.filter((m) => m.level === level)) ??
    match(majors.filter((m) => m.level !== level))
  );
}

// ── Scrape everything ───────────────────────────────────────────────────────
async function scrapeMajors(): Promise<ScrapedMajor[]> {
  // Same field offered as BA and BS (e.g. Computer Science) → one major.
  const majors = new Map<string, ScrapedMajor>();

  const pages = Object.entries(SCHOOLS).flatMap(([school, paths]) =>
    (["undergrad", "grad"] as const)
      .filter((level) => paths[level])
      .map((level) => ({ school, level, path: paths[level]! })),
  );

  for (const { school, level, path } of pages) {
    console.log(`Fetching ${level} programs for ${school}...`);
    const html = await fetchPage(path);
    if (!html) continue;

    const programs = parseSchoolPrograms(html, path, level);
    console.log(`  ✓ Found ${programs.length} ${level} programs`);

    for (const program of programs) {
      const programHtml = await fetchPage(program.path);
      const codes = programHtml
        ? parseProgramCourses(programHtml)
        : { required: [], electives: [] };

      const existing = majors.get(program.name);
      if (existing && existing.school !== school) {
        console.warn(
          `  ! "${program.name}" is listed by ${existing.school} and ${school}; keeping ${existing.school}`,
        );
      }
      const major = existing ?? {
        name: program.name,
        field: level === "undergrad" ? program.name : fieldOf(program.name),
        level,
        school,
        urls: [],
        requiredCodes: [],
        electiveCodes: [],
      };
      major.urls.push(program.path);
      // BA and BS of one field share a major: a course either one requires
      // is required.
      major.requiredCodes = [...new Set([...major.requiredCodes, ...codes.required])];
      major.electiveCodes = [
        ...new Set([...major.electiveCodes, ...codes.electives]),
      ].filter((code) => !major.requiredCodes.includes(code));
      majors.set(program.name, major);
    }
  }

  return [...majors.values()];
}

async function scrapeCourses(): Promise<ScrapedCourse[]> {
  const subjects: { name: string; path: string; level: Level }[] = [];
  for (const index of SUBJECT_INDEXES) {
    const indexHtml = await fetchPage(index.path);
    if (!indexHtml) throw new Error(`Could not load the subject index ${index.path}`);
    const found = parseSubjectIndex(indexHtml, index.path);
    console.log(`Found ${found.length} subjects in ${index.path}`);
    subjects.push(...found.map((f) => ({ ...f, level: index.level })));
  }

  const courses = new Map<string, ScrapedCourse>();
  for (const subject of subjects) {
    const html = await fetchPage(subject.path);
    if (!html) continue;
    const found = parseSubjectPage(html, subject.name, subject.level);
    console.log(`  ✓ ${subject.name}: ${found.length} courses`);
    for (const c of found) courses.set(c.course_code, c);
  }

  return [...courses.values()];
}

// ── Clear the scraped tables ────────────────────────────────────────────────
// Children before parents so foreign keys don't block the deletes. Rows in
// other tables that point at a course or major (skill mappings, faculty
// course claims, course history...) are not touched; if any exist the delete
// fails with the name of the blocking table instead of removing them.
const CLEAR_ORDER: { table: string; key: string }[] = [
  { table: "major_courses", key: "major_id" },
  { table: "courses", key: "course_id" },
  { table: "majors", key: "id" },
  { table: "schools", key: "id" },
];

async function clearTables(supabase: SupabaseClient) {
  console.log("Clearing scraped tables...");
  for (const { table, key } of CLEAR_ORDER) {
    // Supabase refuses an unfiltered delete, so match every row by key.
    const { error, count } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .not(key, "is", null);
    if (error) {
      throw new Error(
        `Could not clear ${table}: ${error.message}` +
          (error.code === "23503"
            ? " (other rows still reference it; clear those first)"
            : ""),
      );
    }
    console.log(`  ✓ ${table}: ${count ?? 0} rows deleted`);
  }
}

// ── Write to Supabase ───────────────────────────────────────────────────────
// Retry Supabase requests that die on the network ("fetch failed").
// A plain insert is not retried: it may have landed before the connection
// dropped, and courses have no unique key to stop a duplicate. Updates and
// upserts are safe to repeat.
const retryingFetch: typeof globalThis.fetch = async (input, init) => {
  const method = (init?.method ?? "GET").toUpperCase();
  const prefer = new Headers(init?.headers).get("Prefer") ?? "";
  const attempts = method === "POST" && !prefer.includes("resolution=") ? 1 : 4;
  for (let attempt = 1; ; attempt++) {
    try {
      return await globalThis.fetch(input, init);
    } catch (err) {
      if (attempt >= attempts) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`  ! Supabase: ${reason} (attempt ${attempt}/${attempts})`);
      await sleep(1000 * 2 ** attempt);
    }
  }
};

async function writeToSupabase(
  majors: ScrapedMajor[],
  courses: ScrapedCourse[],
  clearFirst: boolean,
) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_API_KEY!,
    { global: { fetch: retryingFetch } },
  );
  const CHUNK = 200;

  if (clearFirst) await clearTables(supabase);

  // Fetch every row of a table (Supabase caps a select at 1000 rows).
  async function selectAll<T>(table: string, columns: string): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) return rows;
    }
  }

  // Schools (name is unique; status is left as-is on re-runs)
  const { data: schoolRows, error: schoolError } = await supabase
    .from("schools")
    .upsert(
      Object.keys(SCHOOLS).map((name) => ({ name })),
      { onConflict: "name", ignoreDuplicates: true },
    )
    .select("id, name");
  if (schoolError) throw new Error(`schools: ${schoolError.message}`);
  const allSchools = await selectAll<{ id: number; name: string }>(
    "schools",
    "id, name",
  );
  const schoolId = new Map(allSchools.map((s) => [s.name, s.id]));
  console.log(`✓ Schools: ${schoolRows?.length ?? 0} new, ${allSchools.length} total`);

  // Majors (name is unique)
  const { error: majorError } = await supabase.from("majors").upsert(
    majors.map((m) => ({ name: m.name, school_id: schoolId.get(m.school) })),
    { onConflict: "name" },
  );
  if (majorError) throw new Error(`majors: ${majorError.message}`);
  const allMajors = await selectAll<{ id: number; name: string }>(
    "majors",
    "id, name",
  );
  const majorId = new Map(allMajors.map((m) => [m.name, m.id]));
  console.log(`✓ Majors: ${majors.length} scraped, ${allMajors.length} total`);

  // Courses: course_code has no unique constraint, so match existing rows
  // by code and update them; insert the rest.
  const existing = await selectAll<{ course_id: number; course_code: string }>(
    "courses",
    "course_id, course_code",
  );
  const existingCodes = new Set(existing.map((c) => c.course_code));

  const subjectMajor = new Map<string, number | null>();
  const majorFor = (c: ScrapedCourse) => {
    const key = `${c.level}:${c.subject}`;
    if (!subjectMajor.has(key)) {
      const name = matchSubjectToMajor(c.subject, c.level, majors);
      subjectMajor.set(key, name ? (majorId.get(name) ?? null) : null);
    }
    return subjectMajor.get(key) ?? null;
  };

  const toRow = (c: ScrapedCourse) => ({
    course_code: c.course_code,
    course_name: c.course_name,
    major: c.subject, // legacy text column (NOT NULL); the app still reads it
    major_id: majorFor(c),
  });

  const newCourses = courses.filter((c) => !existingCodes.has(c.course_code));
  for (let i = 0; i < newCourses.length; i += CHUNK) {
    const { error } = await supabase
      .from("courses")
      .insert(newCourses.slice(i, i + CHUNK).map(toRow));
    if (error) throw new Error(`courses insert: ${error.message}`);
  }

  let updated = 0;
  for (const c of courses.filter((c) => existingCodes.has(c.course_code))) {
    const { course_name, major_id } = toRow(c);
    const { error } = await supabase
      .from("courses")
      .update({ course_name, major_id })
      .eq("course_code", c.course_code);
    if (error) console.error(`  ✗ ${c.course_code}: ${error.message}`);
    else updated++;
  }
  console.log(`✓ Courses: ${newCourses.length} inserted, ${updated} updated`);

  // major_courses from each major's requirements
  const allCourses = await selectAll<{ course_id: number; course_code: string }>(
    "courses",
    "course_id, course_code",
  );
  const courseIds = new Map<string, number[]>();
  for (const c of allCourses) {
    courseIds.set(c.course_code, [...(courseIds.get(c.course_code) ?? []), c.course_id]);
  }

  // Electives stay linked (faculty still map them for the major) but as
  // RECOMMENDED, so the roadmap and assessment use only REQUIRED rows.
  const links: { major_id: number; course_id: number; requirement_type: string }[] = [];
  for (const m of majors) {
    const mId = majorId.get(m.name);
    if (mId === undefined) continue;
    const typed = [
      ...m.requiredCodes.map((code) => [code, "REQUIRED"] as const),
      ...m.electiveCodes.map((code) => [code, "RECOMMENDED"] as const),
    ];
    for (const [code, requirement_type] of typed) {
      for (const cId of courseIds.get(code) ?? []) {
        links.push({ major_id: mId, course_id: cId, requirement_type });
      }
    }
  }
  // Not ignoreDuplicates: rows from earlier scrapes (all REQUIRED) get
  // their type corrected.
  for (let i = 0; i < links.length; i += CHUNK) {
    const { error } = await supabase
      .from("major_courses")
      .upsert(links.slice(i, i + CHUNK), { onConflict: "major_id,course_id" });
    if (error) throw new Error(`major_courses: ${error.message}`);
  }
  const requiredCount = links.filter((l) => l.requirement_type === "REQUIRED").length;
  console.log(
    `✓ Major courses: ${links.length} links (${requiredCount} required, ${links.length - requiredCount} electives)`,
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const clearFirst = process.argv.includes("--clear");
  console.log(`=== QU Course Catalog Scraper${dryRun ? " (dry run)" : ""} ===\n`);

  const majors = await scrapeMajors();
  const courses = await scrapeCourses();
  console.log(`\nScraped ${majors.length} majors and ${courses.length} courses.`);

  if (dryRun) {
    const out = resolve(process.cwd(), "catalog.json");
    writeFileSync(
      out,
      JSON.stringify({ schools: Object.keys(SCHOOLS), majors, courses }, null, 2),
    );
    console.log(`Wrote ${out}`);
    return;
  }

  await writeToSupabase(majors, courses, clearFirst);
  console.log("\n✅ Done!");
}

// Only run when executed directly, so the parsers can be imported for testing.
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
