import { CLASS_YEARS, type ClassYear } from "../Utils/progress.js";
import { certWays, type AiSuggestion } from "./AiSuggestionsModel.js";
import type { Occupation } from "./CareerDataModel.js";

// Certifications for an occupation from the Credential Engine Registry
// (https://credentialengine.org), a public registry where certifying
// bodies publish their own credentials, with official links.
//
//   CREDENTIAL_ENGINE_API_KEY   from the Credential Engine account, after
//                               Credential Engine approves "Consuming /
//                               Using Graph Search API" and the Developer
//                               Agreement is signed (its Terms of Use
//                               require that agreement for apps).
//   CREDENTIAL_ENGINE_SEARCH_URL  optional; defaults to production. Use the
//                               sandbox URL while testing.
//
// Only the occupation's SOC code is sent; nothing about the student.
// Results are kept in memory for a day, not stored in the database (the
// Terms of Use limit storing registry data).

export type RegistryCert = {
  name: string;
  organization: string | null;
  url: string | null;
  description: string;
};

const SEARCH_URL = "https://apps.credentialengine.org/assistant/search/ctdl";
const TIMEOUT_MS = 8000;
const CACHE_MS = 24 * 3600 * 1000;
const MAX_CERTS = 3;

export const credentialRegistryConfigured = () => !!process.env.CREDENTIAL_ENGINE_API_KEY;

const text = (v: unknown, max = 150): string => {
  // CTDL text is a language map ({ "en-US": "..." }) or a plain string.
  const s =
    typeof v === "string"
      ? v
      : v && typeof v === "object"
        ? String((v as any)["en-US"] ?? (v as any)["en"] ?? Object.values(v)[0] ?? "")
        : "";
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
};

function httpsUrl(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const u = new URL(v.trim().replace(/^http:\/\//i, "https://"));
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// O*NET code "15-1252.00" -> SOC code "15-1252"
export const socCode = (onetCode: string) => onetCode.slice(0, 7);

export function buildQuery(onetCode: string, take = 10) {
  return {
    Query: {
      "@type": "ceterms:Certification",
      "ceterms:occupationType": { "ceterms:codedNotation": socCode(onetCode) },
    },
    Skip: 0,
    Take: take,
    Sort: "search:relevance",
    DescriptionSetType: "Resource_RelatedURIs_RelatedData",
  };
}

// Exported for tests: registry search response -> certifications.
export function parseRegistryCerts(data: any, max = MAX_CERTS): RegistryCert[] {
  const records = (Array.isArray(data?.data) ? data.data : []) as any[];
  // Issuer names come back as related records, keyed by their URI.
  const related = [
    ...((data?.extra?.RelatedItems ?? data?.extra?.relatedItems ?? []) as any[]),
    ...((data?.relatedItems ?? []) as any[]),
  ];
  const names = new Map<string, string>();
  for (const r of related) {
    const id = r?.["@id"];
    const name = text(r?.["ceterms:name"], 150);
    if (typeof id === "string" && name) names.set(id, name);
  }

  const seen = new Set<string>();
  const out: RegistryCert[] = [];
  for (const r of records) {
    const status = JSON.stringify(r?.["ceterms:lifeCycleStatusType"] ?? "");
    if (/deprecated|ceased|suspended|teachout/i.test(status)) continue;
    const name = text(r?.["ceterms:name"], 150);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const owner = [r?.["ceterms:ownedBy"], r?.["ceterms:offeredBy"]]
      .flat()
      .find((o) => typeof o === "string" && names.has(o));
    out.push({
      name,
      organization: owner ? names.get(owner)! : null,
      url: httpsUrl(r?.["ceterms:subjectWebpage"]),
      description: text(r?.["ceterms:description"], 300),
    });
    if (out.length >= max) break;
  }
  return out;
}

const cache = new Map<string, { at: number; certs: RegistryCert[] }>();

// Certifications for an occupation. null when the registry is not set up
// or could not be reached, so the caller can fall back to the AI.
export async function getRegistryCerts(occupation: Occupation): Promise<RegistryCert[] | null> {
  const key = process.env.CREDENTIAL_ENGINE_API_KEY;
  if (!key) return null;
  const soc = socCode(occupation.code);
  const hit = cache.get(soc);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.certs;

  try {
    const res = await fetch(process.env.CREDENTIAL_ENGINE_SEARCH_URL || SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(buildQuery(occupation.code)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const certs = parseRegistryCerts(await res.json());
    cache.set(soc, { at: Date.now(), certs });
    return certs;
  } catch (e: any) {
    console.warn("Credential Engine search failed:", e?.message ?? e);
    return hit?.certs ?? null;
  }
}

const atLeast = (year: ClassYear, earliest: ClassYear): ClassYear =>
  CLASS_YEARS[Math.max(CLASS_YEARS.indexOf(year), CLASS_YEARS.indexOf(earliest))]!;

// Certification cards for the roadmap.
export function registryCertSuggestions(
  certs: RegistryCert[],
  occupation: Occupation,
  earliestYear: ClassYear,
): AiSuggestion[] {
  return certs.map((c) => ({
    category: "CERT" as const,
    name: c.name,
    description: c.description || `A certification for ${occupation.title}.`,
    classYear: atLeast("JUNIOR", earliestYear),
    resources: [
      ...(c.url ? [`Official certification page: ${c.url}`] : []),
      ...certWays(c.name, c.organization),
    ],
  }));
}
