import { supabase } from "../Database/supabaseClient.js";

// Current internship openings for a career goal, from free job APIs whose
// terms allow this use. Only the career goal is sent; nothing about the
// student. Results are cached per goal so most students share one lookup.
//
// Providers (each is skipped when its keys are not set):
//   Adzuna      ADZUNA_APP_ID, ADZUNA_APP_KEY   https://developer.adzuna.com
//   USAJobs     USAJOBS_API_KEY, USAJOBS_EMAIL  https://developer.usajobs.gov
//   The Muse    THEMUSE_API_KEY (optional)      https://www.themuse.com/developers/api/v2

export type InternshipListing = {
  title: string;
  company: string;
  location: string;
  url: string;
  source: "Adzuna" | "USAJobs" | "The Muse";
  postedAt: string | null;
};

export type InternshipListings = {
  goal: string;
  listings: InternshipListing[];
  sources: string[];
  fetchedAt: string;
};

const CACHE_TABLE = "internship_listing_cache";
const CACHE_HOURS = 12;
const PER_SOURCE = 8;
const MAX_LISTINGS = 15;
const TIMEOUT_MS = 8000;

const STOP_WORDS = new Set([
  "and", "the", "for", "with", "career", "careers", "work", "working", "job",
  "jobs", "role", "field", "become", "want", "industry", "intern", "internship",
]);

export const goalKey = (goal: string) =>
  goal.toLowerCase().replace(/[^a-z0-9+# ]+/g, " ").replace(/\s+/g, " ").trim();

// Words that say what the goal is about, for filtering listings.
export function goalWords(goal: string) {
  return goalKey(goal)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const text = (v: unknown, max = 150) =>
  typeof v === "string" ? v.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "";

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<any>;
}

// ---------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------

async function fromAdzuna(goal: string): Promise<InternshipListing[] | null> {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return null;

  const params = new URLSearchParams({
    app_id: id,
    app_key: key,
    what: goal,
    what_or: "intern internship",
    results_per_page: String(PER_SOURCE * 2),
    max_days_old: "60",
    sort_by: "date",
  });
  const data = await getJson(`https://api.adzuna.com/v1/api/jobs/us/search/1?${params}`);
  return ((data?.results ?? []) as any[])
    .filter((r) => /intern/i.test(`${r?.title} ${r?.description}`))
    .map((r) => ({
      title: text(r?.title),
      company: text(r?.company?.display_name),
      location: text(r?.location?.display_name),
      url: httpsUrl(r?.redirect_url) ?? "",
      source: "Adzuna" as const,
      postedAt: typeof r?.created === "string" ? r.created : null,
    }));
}

// Federal internships: the "student" hiring path is the Pathways program.
async function fromUsaJobs(goal: string): Promise<InternshipListing[] | null> {
  const key = process.env.USAJOBS_API_KEY;
  const email = process.env.USAJOBS_EMAIL;
  if (!key || !email) return null;

  const params = new URLSearchParams({
    Keyword: goal,
    HiringPath: "student",
    ResultsPerPage: String(PER_SOURCE),
  });
  const data = await getJson(`https://data.usajobs.gov/api/search?${params}`, {
    Host: "data.usajobs.gov",
    "User-Agent": email,
    "Authorization-Key": key,
  });
  return ((data?.SearchResult?.SearchResultItems ?? []) as any[]).map((item) => {
    const d = item?.MatchedObjectDescriptor ?? {};
    return {
      title: text(d.PositionTitle),
      company: text(d.OrganizationName || d.DepartmentName),
      location: text(d.PositionLocationDisplay),
      url: httpsUrl(d.PositionURI) ?? httpsUrl(d.ApplyURI?.[0]) ?? "",
      source: "USAJobs" as const,
      postedAt: typeof d.PublicationStartDate === "string" ? d.PublicationStartDate : null,
    };
  });
}

// The Muse has no keyword search, so read its newest internships and keep
// the ones whose title or category matches the goal.
async function fromTheMuse(goal: string): Promise<InternshipListing[] | null> {
  const words = goalWords(goal);
  if (words.length === 0) return [];

  const out: InternshipListing[] = [];
  for (let page = 0; page < 3 && out.length < PER_SOURCE; page++) {
    const params = new URLSearchParams({ level: "Internship", page: String(page) });
    if (process.env.THEMUSE_API_KEY) params.set("api_key", process.env.THEMUSE_API_KEY);
    const data = await getJson(`https://www.themuse.com/api/public/jobs?${params}`);
    const results = (data?.results ?? []) as any[];
    for (const r of results) {
      const haystack = goalKey(
        `${r?.name} ${(r?.categories ?? []).map((c: any) => c?.name).join(" ")}`,
      );
      if (!words.some((w) => new RegExp(`\\b${w.replace(/[+#]/g, "\\$&")}`).test(haystack)))
        continue;
      out.push({
        title: text(r?.name),
        company: text(r?.company?.name),
        location: text((r?.locations ?? []).map((l: any) => l?.name).join(", ")) || "See listing",
        url: httpsUrl(r?.refs?.landing_page) ?? "",
        source: "The Muse",
        postedAt: typeof r?.publication_date === "string" ? r.publication_date : null,
      });
    }
    if (results.length === 0 || page + 1 >= Number(data?.page_count ?? 0)) break;
  }
  return out;
}

const PROVIDERS = [
  { name: "Adzuna", fetch: fromAdzuna },
  { name: "USAJobs", fetch: fromUsaJobs },
  { name: "The Muse", fetch: fromTheMuse },
];

// ---------------------------------------------------------------------
// Merge, cache, look up
// ---------------------------------------------------------------------

// Drop listings without a link and repeats, then take the newest, a few
// from each source so one site doesn't fill the list.
export function mergeListings(groups: InternshipListing[][]): InternshipListing[] {
  const seen = new Set<string>();
  const clean = groups.map((g) =>
    g
      .filter((l) => l.title && l.url)
      .filter((l) => {
        const key = `${goalKey(l.title)}|${goalKey(l.company)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))
      .slice(0, PER_SOURCE),
  );
  const out: InternshipListing[] = [];
  for (let i = 0; out.length < MAX_LISTINGS && clean.some((g) => i < g.length); i++) {
    for (const g of clean) if (g[i] && out.length < MAX_LISTINGS) out.push(g[i]!);
  }
  return out;
}

async function readCache(key: string) {
  const { data, error } = await supabase
    .from(CACHE_TABLE)
    .select("listings, sources, fetched_at")
    .eq("goal_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { listings: InternshipListing[]; sources: string[]; fetched_at: string } | null;
}

async function writeCache(key: string, value: InternshipListings) {
  const { error } = await supabase.from(CACHE_TABLE).upsert(
    {
      goal_key: key,
      listings: value.listings,
      sources: value.sources,
      fetched_at: value.fetchedAt,
    },
    { onConflict: "goal_key" },
  );
  if (error) throw new Error(error.message);
}

export async function getInternshipListings(careerGoal: string): Promise<InternshipListings> {
  const goal = careerGoal.trim().slice(0, 100);
  const key = goalKey(goal);
  const empty = { goal, listings: [], sources: [], fetchedAt: new Date().toISOString() };
  if (!key) return empty;

  let cached: Awaited<ReturnType<typeof readCache>> = null;
  try {
    cached = await readCache(key);
  } catch (e) {
    console.error("Internship cache read failed:", e);
  }
  const fresh =
    cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_HOURS * 3600 * 1000;
  if (cached && fresh)
    return { goal, listings: cached.listings, sources: cached.sources, fetchedAt: cached.fetched_at };

  const results = await Promise.all(
    PROVIDERS.map(async (p) => {
      try {
        const listings = await p.fetch(goal);
        return listings ? { name: p.name, listings } : null;
      } catch (e: any) {
        console.warn(`${p.name} internship lookup failed:`, e?.message ?? e);
        return null;
      }
    }),
  );
  const ok = results.filter((r): r is { name: string; listings: InternshipListing[] } => !!r);

  // Every provider failed: serve the old cache rather than nothing.
  if (ok.length === 0) {
    return cached
      ? { goal, listings: cached.listings, sources: cached.sources, fetchedAt: cached.fetched_at }
      : empty;
  }

  const value: InternshipListings = {
    goal,
    listings: mergeListings(ok.map((r) => r.listings)),
    sources: ok.map((r) => r.name),
    fetchedAt: new Date().toISOString(),
  };
  try {
    await writeCache(key, value);
  } catch (e) {
    console.error("Internship cache write failed:", e);
  }
  return value;
}
