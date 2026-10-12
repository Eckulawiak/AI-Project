/**
 * QU Course Catalog Scraper
 * ─────────────────────────
 * Fills schools, majors, courses and major_courses in Supabase from
 * https://catalog.qu.edu. Safe to re-run: existing rows are updated by name
 * (schools, majors) or course code (courses), never duplicated.
 *
 *   schools        ← the school/college pages linked from the catalog home
 *   majors         ← the bachelor's programs listed on each school page
 *   courses        ← every course on every undergraduate subject page
 *   major_courses  ← the courses named in each major's requirements table
 *
 * The catalog does not list instructors, so new courses get professor "N/A"
 * (the column default); faculty still claim their courses in the app.
 *
 * Usage (from BACKEND/):
 *   npm run scrape              scrape and write to Supabase
 *   npm run scrape -- --dry-run scrape and write catalog.json only
 */

import * as cheerio from "cheerio";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const BASE_URL = "https://catalog.qu.edu";
const SUBJECT_INDEX = "/courses-undergraduate/";
const REQUEST_DELAY_MS = 500;
const USER_AGENT =
  "Mozilla/5.0 (compatible; QU-Career-Services-Scraper/1.0; +https://catalog.qu.edu)";

// ── Schools: display name → catalog page path ───────────────────────────────
// Taken from the catalog home page sidebar. Schools with no bachelor's
// programs (Law, Medicine, Education) are still created so they can be
// onboarded later; they just get no majors.
export const SCHOOLS: Record<string, string> = {
  "College of Arts & Sciences": "/arts-sciences/",
  "School of Business": "/business/",
  "School of Communications": "/communications/",
  "School of Computing & Engineering": "/engineering/",
  "School of Education": "/graduate-studies/education/",
  "School of Health Sciences": "/health-sciences/",
  "School of Law": "/school-of-law/",
  "Frank H. Netter MD School of Medicine": "/school-of-medicine/",
  "School of Nursing": "/nursing/",
};

export type ScrapedMajor = {
  name: string;
  school: string;
  urls: string[];
  courseCodes: string[];
};

export type ScrapedCourse = {
  course_code: string;
  course_name: string;
  subject: string;
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

const clean = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

// ── Subjects: "Software Engineering (SER)" → { name, path } ─────────────────
export function parseSubjectIndex(
  html: string,
): { name: string; path: string }[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, string>();
  $(`a[href^="${SUBJECT_INDEX}"]`).each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const match = clean($(el).text()).match(/^(.+?)\s*\(([A-Z]+)\)$/);
    if (!match || href === SUBJECT_INDEX || seen.has(href)) return;
    seen.set(href, match[1]!);
  });
  return [...seen].map(([path, name]) => ({ name, path }));
}

// ── Courses on one subject page ─────────────────────────────────────────────
export function parseSubjectPage(
  html: string,
  subject: string,
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
    courses.push({ course_code: courseCode, course_name: courseName, subject });
  });

  return courses;
}

// ── Bachelor's programs on one school page ──────────────────────────────────
// Pages differ: Engineering lists "Bachelor of Science in Computer Science"
// under a "Bachelor of Science" heading, Business lists "Accounting" under
// "Bachelor's Degrees", and some pages use bold text instead of headings.
// A link counts as a bachelor's program if it is inside the school's own
// path and either sits under a bachelor's heading, says "Bachelor of ...",
// or its URL ends in a bachelor's degree slug (-bs, -ba, bs-..., -bsn, ...).
const BACHELOR_HEADING = /^bachelor/i;
const SKIP_PROGRAM =
  /accelerated|dual|double|part-time|second degree|completion|minor|certificate|master|doctor|badge/i;
const BACHELOR_SLUG = /(^|-)(bs|ba|bfa|bsn|bba)(-|$)/;

export function majorNameFromLink(text: string): string {
  return clean(text)
    .replace(/^bachelor of [a-z ]+? in\s+/i, "")
    .replace(/^bachelor of /i, "")
    .replace(/\s*\((BA|BS|BFA|BBA|BSN)\)$/i, "")
    .trim();
}

export function parseSchoolPrograms(
  html: string,
  schoolPath: string,
): { name: string; path: string }[] {
  const $ = cheerio.load(html);
  const programs = new Map<string, string>(); // path → name
  // What the most recent heading was about: a bachelor's list, a list to
  // skip (minors, dual degrees, completion programs...), or anything else.
  let section: "bachelors" | "skip" | "other" = "other";

  // find() returns elements in document order, so each link is seen after
  // the heading it sits under. Short bold paragraphs count as headings.
  $("body")
    .find("h1, h2, h3, h4, h5, p > strong, p > b, a")
    .each((_i, el) => {
      if (el.tagName !== "a") {
        const heading = clean($(el).text());
        if (heading.length > 60) return;
        section = SKIP_PROGRAM.test(heading)
          ? "skip"
          : BACHELOR_HEADING.test(heading)
            ? "bachelors"
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
      if (!path.startsWith(schoolPath) || path === schoolPath) return;

      const text = clean($(el).text());
      if (!text || SKIP_PROGRAM.test(text) || SKIP_PROGRAM.test(path)) return;
      if (programs.has(path)) return;

      // Department pages (/school/dept/) can show up in the sidebar while a
      // bachelor's heading is still "open", so a heading alone needs a
      // program-depth path (/school/dept/program/).
      const segments = path.split("/").filter(Boolean);
      const slug = segments[segments.length - 1] ?? "";
      const isBachelors =
        section !== "skip" &&
        (/^bachelor of/i.test(text) ||
          BACHELOR_SLUG.test(slug) ||
          (section === "bachelors" && segments.length >= 3));
      if (!isBachelors) return;

      const name = majorNameFromLink(text);
      if (name) programs.set(path, name);
    });

  return [...programs].map(([path, name]) => ({ name, path }));
}

// ── Course codes in a program's requirements table ──────────────────────────
export function parseProgramCourseCodes(html: string): string[] {
  const $ = cheerio.load(html);
  const codes = new Set<string>();
  $("table.sc_courselist a.code, table.sc_courselist td.codecol a").each(
    (_i, el) => {
      const code = normalizeCode(clean($(el).text()));
      if (/^[A-Z]+-\d+[A-Z]?$/.test(code)) codes.add(code);
    },
  );
  return [...codes];
}

// ── Scrape everything ───────────────────────────────────────────────────────
async function scrapeMajors(): Promise<ScrapedMajor[]> {
  // Same field offered as BA and BS (e.g. Computer Science) → one major.
  const majors = new Map<string, ScrapedMajor>();

  for (const [school, path] of Object.entries(SCHOOLS)) {
    console.log(`Fetching programs for ${school}...`);
    const html = await fetchPage(path);
    if (!html) continue;

    const programs = parseSchoolPrograms(html, path);
    console.log(`  ✓ Found ${programs.length} bachelor's programs`);

    for (const program of programs) {
      const programHtml = await fetchPage(program.path);
      const codes = programHtml ? parseProgramCourseCodes(programHtml) : [];

      const existing = majors.get(program.name);
      if (existing && existing.school !== school) {
        console.warn(
          `  ! "${program.name}" is listed by ${existing.school} and ${school}; keeping ${existing.school}`,
        );
      }
      const major = existing ?? {
        name: program.name,
        school,
        urls: [],
        courseCodes: [],
      };
      major.urls.push(program.path);
      major.courseCodes = [...new Set([...major.courseCodes, ...codes])];
      majors.set(program.name, major);
    }
  }

  return [...majors.values()];
}

async function scrapeCourses(): Promise<ScrapedCourse[]> {
  const indexHtml = await fetchPage(SUBJECT_INDEX);
  if (!indexHtml) throw new Error("Could not load the subject index");

  const subjects = parseSubjectIndex(indexHtml);
  console.log(`Found ${subjects.length} subjects`);

  const courses = new Map<string, ScrapedCourse>();
  for (const subject of subjects) {
    const html = await fetchPage(subject.path);
    if (!html) continue;
    const found = parseSubjectPage(html, subject.name);
    console.log(`  ✓ ${subject.name}: ${found.length} courses`);
    for (const c of found) courses.set(c.course_code, c);
  }

  return [...courses.values()];
}

// ── Write to Supabase ───────────────────────────────────────────────────────
async function writeToSupabase(majors: ScrapedMajor[], courses: ScrapedCourse[]) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_API_KEY!,
  );
  const CHUNK = 200;

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

  const toRow = (c: ScrapedCourse) => ({
    course_code: c.course_code,
    course_name: c.course_name,
    major: c.subject, // legacy text column (NOT NULL); the app still reads it
    major_id: majorId.get(c.subject) ?? null,
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

  const links: { major_id: number; course_id: number; requirement_type: string }[] = [];
  for (const m of majors) {
    const mId = majorId.get(m.name);
    if (mId === undefined) continue;
    for (const code of m.courseCodes) {
      for (const cId of courseIds.get(code) ?? []) {
        links.push({ major_id: mId, course_id: cId, requirement_type: "REQUIRED" });
      }
    }
  }
  for (let i = 0; i < links.length; i += CHUNK) {
    const { error } = await supabase
      .from("major_courses")
      .upsert(links.slice(i, i + CHUNK), {
        onConflict: "major_id,course_id",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`major_courses: ${error.message}`);
  }
  console.log(`✓ Major courses: ${links.length} links`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const dryRun = process.argv.includes("--dry-run");
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

  await writeToSupabase(majors, courses);
  console.log("\n✅ Done!");
}

// Only run when executed directly, so the parsers can be imported for testing.
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
