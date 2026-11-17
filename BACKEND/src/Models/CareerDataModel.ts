import { supabase } from "../Database/supabaseClient.js";
import { CLASS_YEARS, type ClassYear } from "../Utils/progress.js";
import { overlapsCourseSkill, skillWays, type AiSuggestion } from "./AiSuggestionsModel.js";

// Skills for a career goal from U.S. Department of Labor data, so they cover
// any career:
//
//   O*NET Web Services (ONET_API_KEY)        https://services.onetcenter.org
//     goal -> occupations (keyword search), occupation -> technology skills
//
// Certifications come from the AI. (CareerOneStop was considered, but its
// terms only allow use on pages that need no log-in.)
//
// Only the career goal (or an O*NET code) is sent. Results are cached in
// the database for 30 days, so most lookups never leave the server.

export type Occupation = { code: string; title: string };

export type CareerSkill = {
  name: string;
  category: string; // O*NET technology category, e.g. "Web page creation software"
  hot: boolean; // O*NET "hot technology" / in demand in job postings
};

export type CareerData = {
  occupation: Occupation;
  skills: CareerSkill[];
};

const ONET_BASE = "https://api-v2.onetcenter.org";
const CACHE_DAYS = 30;
const TIMEOUT_MS = 8000;

export const goalKey = (goal: string) =>
  goal.toLowerCase().replace(/[^a-z0-9+# ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);

const text = (v: unknown, max = 150) =>
  typeof v === "string" ? v.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "";

const isFresh = (fetchedAt: string | null | undefined) =>
  !!fetchedAt && Date.now() - new Date(fetchedAt).getTime() < CACHE_DAYS * 86400 * 1000;

async function getJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<any>;
}

export const careerDataConfigured = () => !!process.env.ONET_API_KEY;

// ---------------------------------------------------------------------
// Parsing (exported for tests)
// ---------------------------------------------------------------------

export function parseOccupations(data: any): Occupation[] {
  return ((data?.occupation ?? []) as any[])
    .map((o) => ({ code: text(o?.code, 12), title: text(o?.title, 120) }))
    .filter((o) => /^\d{2}-\d{4}\.\d{2}$/.test(o.code) && o.title);
}

// Technology skills: categories with example products. Hot / in-demand
// technologies first, then the ones most often reported.
export function parseTechnologySkills(data: any, max = 12): CareerSkill[] {
  const categories = (Array.isArray(data) ? data : (data?.category ?? [])) as any[];
  const all: Array<CareerSkill & { score: number }> = [];
  for (const c of categories) {
    for (const e of (c?.example ?? []) as any[]) {
      const name = text(e?.title ?? e?.name, 80);
      if (!name) continue;
      const hot = e?.hot_technology === true || e?.in_demand === true;
      all.push({
        name,
        category: text(c?.title, 80),
        hot,
        score: (hot ? 1000 : 0) + (e?.in_demand === true ? 500 : 0) + Number(e?.percentage ?? 0),
      });
    }
  }
  const seen = new Set<string>();
  return all
    .sort((a, b) => b.score - a.score)
    .filter((s) => {
      const k = s.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max)
    .map(({ score: _score, ...s }) => s);
}

// ---------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------

async function fetchOccupations(goal: string): Promise<Occupation[]> {
  const params = new URLSearchParams({ keyword: goal, start: "1", end: "8" });
  const data = await getJson(`${ONET_BASE}/online/search?${params}`, {
    "X-API-Key": process.env.ONET_API_KEY!,
  });
  return parseOccupations(data);
}

async function fetchTechnologySkills(code: string): Promise<CareerSkill[]> {
  const data = await getJson(
    `${ONET_BASE}/online/occupations/${encodeURIComponent(code)}/summary/technology_skills`,
    { "X-API-Key": process.env.ONET_API_KEY! },
  );
  return parseTechnologySkills(data);
}

// ---------------------------------------------------------------------
// Cached lookups
// ---------------------------------------------------------------------

// Candidate occupations for a career goal, best match first.
export async function searchOccupations(goal: string): Promise<Occupation[]> {
  const key = goalKey(goal);
  if (!key || !careerDataConfigured()) return [];

  const { data: cached, error } = await supabase
    .from("career_goal_occupations")
    .select("occupations, fetched_at")
    .eq("goal_key", key)
    .maybeSingle();
  if (error) console.error("Occupation cache read failed:", error.message);
  if (cached && isFresh(cached.fetched_at)) return cached.occupations as Occupation[];

  try {
    const occupations = await fetchOccupations(goal);
    const { error: writeError } = await supabase.from("career_goal_occupations").upsert(
      { goal_key: key, occupations, fetched_at: new Date().toISOString() },
      { onConflict: "goal_key" },
    );
    if (writeError) console.error("Occupation cache write failed:", writeError.message);
    return occupations;
  } catch (e: any) {
    console.warn("O*NET occupation search failed:", e?.message ?? e);
    return (cached?.occupations as Occupation[] | undefined) ?? [];
  }
}

// Skills for one occupation. null when nothing could be looked up (not
// configured, or O*NET failed with nothing cached).
export async function getCareerData(occupation: Occupation): Promise<CareerData | null> {
  if (!careerDataConfigured()) return null;

  const { data: cached, error } = await supabase
    .from("occupation_career_data")
    .select("skills, fetched_at")
    .eq("onet_code", occupation.code)
    .maybeSingle();
  if (error) console.error("Career data cache read failed:", error.message);
  if (cached && isFresh(cached.fetched_at))
    return { occupation, skills: cached.skills as CareerSkill[] };

  let skills: CareerSkill[];
  try {
    skills = await fetchTechnologySkills(occupation.code);
  } catch (e: any) {
    console.warn("O*NET technology skills failed:", e?.message ?? e);
    return cached ? { occupation, skills: cached.skills as CareerSkill[] } : null;
  }

  const { error: writeError } = await supabase.from("occupation_career_data").upsert(
    {
      onet_code: occupation.code,
      title: occupation.title,
      skills,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "onet_code" },
  );
  if (writeError) console.error("Career data cache write failed:", writeError.message);
  return { occupation, skills };
}

// ---------------------------------------------------------------------
// Roadmap cards
// ---------------------------------------------------------------------

const MAX_SKILLS = 5;

const atLeast = (year: ClassYear, earliest: ClassYear): ClassYear =>
  CLASS_YEARS[Math.max(CLASS_YEARS.indexOf(year), CLASS_YEARS.indexOf(earliest))]!;

// Skill cards from the occupation's data. Skills the major's courses
// already teach are left out.
export function careerDataSuggestions(
  data: CareerData,
  { courseSkills, earliestYear }: { courseSkills: string[]; earliestYear: ClassYear },
): AiSuggestion[] {
  const job = data.occupation.title;
  return data.skills
    .filter((s) => !overlapsCourseSkill(s.name, courseSkills))
    .slice(0, MAX_SKILLS)
    .map((s) => ({
      category: "SKILL" as const,
      name: s.name,
      description: `${s.hot ? "An in-demand tool" : "A tool"} for ${job}${
        s.category ? ` (${s.category.toLowerCase()})` : ""
      }.`,
      classYear: atLeast("SOPH", earliestYear),
      resources: skillWays(s.name),
    }));
}
