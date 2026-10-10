/**
 * QU Course Catalog Scraper
 * ─────────────────────────
 * Run once to populate the Courses table in Supabase.
 *
 * Setup:
 *   npm install cheerio node-fetch dotenv
 *
 * Usage:
 *   npx ts-node scrapeCoures.ts
 *   -- or if using plain JS, rename to .js and run:
 *   node scrapeCoures.js
 */

import * as cheerio from "cheerio";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_API_KEY!,
);

// ── Map: Major name (matches your Majors table) → catalog URL slug ───────────
const MAJORS: Record<string, string> = {
  "Engineering": "enr",
  "Software Engineering": "ser",
  "Computer Science": "csc",
  "Mechanical Engineering": "mer",
  "Industrial Engineering": "ier",
  "Civil Engineering": "cer",
};

// ── Fetch and parse one subject page ─────────────────────────────────────────
async function scrapeSubject(
  major: string,
  slug: string,
): Promise<
  {
    course_code: string;
    course_name: string;
    professor: string;
    major: string;
  }[]
> {
  const url = `https://catalog.qu.edu/courses-undergraduate/${slug}/`;
  console.log(`Fetching ${major} from ${url}...`);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  ✗ Failed to fetch ${url} (${res.status})`);
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const courses: {
    course_code: string;
    course_name: string;
    professor: string;
    major: string;
  }[] = [];

  $(".courseblock").each((_i, el) => {
    // Title text looks like: "SER 120. Object-Oriented Design and Programming."
    const titleText = $(el).find(".courseblocktitle strong").text().trim();

    // Strip the credits portion — everything after the last period before credits
    // e.g. "SER 120. Object-Oriented Design and Programming.3 Credits."
    // The <span class="cr-credits"> gets pulled into the text, so we split on the first ". "
    const dotIndex = titleText.indexOf(". ");
    if (dotIndex === -1) return; // malformed, skip

    const rawCode = titleText.substring(0, dotIndex).trim(); // "SER 120"
    const afterCode = titleText.substring(dotIndex + 2).trim(); // "Object-Oriented Design and Programming.3 Credits."

    // Course name is everything before the credits text
    // Credits text always ends with " Credits." or "1 Credit."
    const courseName = afterCode
      .replace(/\s*\d+\.?\d*\s+Credits?\.\s*$/, "") // remove "3 Credits." at end
      .replace(/\.$/, "") // remove trailing period
      .trim();

    // Normalize code from "SER 120" → "SER-120"
    const courseCode = rawCode.replace(/\s+/, "-");

    if (!courseCode || !courseName) return;

    courses.push({
      course_code: courseCode,
      course_name: courseName,
      professor: "N/A",
      major: major,
    });
  });

  console.log(`  ✓ Found ${courses.length} courses`);
  return courses;
}

// ── Insert courses into Supabase in batches ───────────────────────────────────
async function insertCourses(
  courses: {
    course_code: string;
    course_name: string;
    professor: string;
    major: string;
  }[],
) {
  if (courses.length === 0) return;

  // Insert in chunks of 50 to avoid payload limits
  const CHUNK = 50;
  for (let i = 0; i < courses.length; i += CHUNK) {
    const chunk = courses.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("courses")
      .upsert(chunk, { onConflict: "course_code" });
    if (error) {
      console.error(`  ✗ Insert error:`, error.message);
    } else {
      console.log(
        `  ✓ Inserted rows ${i + 1}–${Math.min(i + CHUNK, courses.length)}`,
      );
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== QU Course Catalog Scraper ===\n");

  let totalInserted = 0;

  for (const [major, slug] of Object.entries(MAJORS)) {
    const courses = await scrapeSubject(major, slug);
    await insertCourses(courses);
    totalInserted += courses.length;
    // Small delay to be polite to the server
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n✅ Done! Attempted to insert ${totalInserted} courses total.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
