import { supabase } from "../Database/supabaseClient.js";

// Current internship openings for a career goal, from free job APIs whose
// terms allow this use. Only the career goal is sent; nothing about the
// student. Results are cached per goal so most students share one lookup.
//
// Providers (each is skipped when its keys are not set):
//   Jooble      JOOBLE_API_KEY                  https://jooble.org/api/about
//   USAJobs     USAJOBS_API_KEY, USAJOBS_EMAIL  https://developer.usajobs.gov

export type InternshipListing = {
  title: string;
  company: string;
  location: string;
  url: string;
  source: "Jooble" | "USAJobs";
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

export const goalKey = (goal: string) =>
  goal.toLowerCase().replace(/[^a-z0-9+# ]+/g, " ").replace(/\s+/g, " ").trim();

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
    // Some job sites reject requests without a browser-like User-Agent
    // (Node's default is "node"); USAJobs sets its own.
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; QU-Career-Services/1.0)",
      ...headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return res.json() as Promise<any>;
}

// ---------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------

async function fromJooble(goal: string): Promise<InternshipListing[] | null> {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) return null;

  const res = await fetch(`https://jooble.org/api/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      keywords: /intern/i.test(goal) ? goal : `${goal} intern`,
      location: "United States",
      page: "1",
      ResultOnPage: String(PER_SOURCE * 2),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from jooble.org`);
  const data = (await res.json()) as any;
  return ((data?.jobs ?? []) as any[])
    .filter((r) => /intern/i.test(`${r?.title} ${r?.type} ${r?.snippet}`))
    .map((r) => ({
      title: text(r?.title),
      company: text(r?.company),
      location: text(r?.location),
      url: httpsUrl(r?.link) ?? "",
      source: "Jooble" as const,
      postedAt: typeof r?.updated === "string" ? r.updated : null,
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

const PROVIDERS = [
  { name: "Jooble", fetch: fromJooble },
  { name: "USAJobs", fetch: fromUsaJobs },
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
