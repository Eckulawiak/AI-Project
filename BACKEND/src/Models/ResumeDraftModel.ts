// A student's saved resume draft (REQ-RES-4): the blocks of bullet points
// as they last saved them, including their own edits. One draft per
// student; saving replaces it.
import { supabase } from "../Database/supabaseClient.js";

export type DraftBullet = { text: string; edited: boolean };

export type DraftBlock = {
  key: string;
  kind: "course" | "project";
  refId: number;
  heading: string;
  bullets: DraftBullet[];
};

export type ResumeDraft = { blocks: DraftBlock[]; updatedAt: string | null };

export const DRAFT_LIMITS = { maxBlocks: 40, maxBullets: 8, bullet: 400, heading: 200 };

export function parseDraft(body: unknown): { blocks: DraftBlock[] } | { error: string } {
  const raw = (body as { blocks?: unknown })?.blocks;
  if (!Array.isArray(raw)) return { error: "blocks must be a list." };
  if (raw.length > DRAFT_LIMITS.maxBlocks)
    return { error: `A resume can have up to ${DRAFT_LIMITS.maxBlocks} sections.` };

  const blocks: DraftBlock[] = [];
  const seen = new Set<string>();
  for (const b of raw as any[]) {
    const kind = b?.kind;
    const refId = Number(b?.refId);
    if ((kind !== "course" && kind !== "project") || !Number.isInteger(refId) || refId <= 0)
      return { error: "Each section needs a course or project." };
    const key = `${kind}:${refId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const heading = String(b?.heading ?? "").trim().slice(0, DRAFT_LIMITS.heading);
    if (!Array.isArray(b?.bullets)) return { error: "Each section needs a list of bullets." };
    if (b.bullets.length > DRAFT_LIMITS.maxBullets)
      return { error: `Keep each section to ${DRAFT_LIMITS.maxBullets} bullet points or fewer.` };

    const bullets: DraftBullet[] = [];
    for (const x of b.bullets) {
      const text = String(x?.text ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (text.length > DRAFT_LIMITS.bullet)
        return { error: `Keep each bullet point under ${DRAFT_LIMITS.bullet} characters.` };
      bullets.push({ text, edited: x?.edited === true });
    }
    blocks.push({ key, kind, refId, heading, bullets });
  }
  return { blocks };
}

export async function getDraft(studentId: number): Promise<ResumeDraft> {
  const { data, error } = await supabase
    .from("resume_drafts")
    .select("blocks, updated_at")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    blocks: Array.isArray(data?.blocks) ? (data!.blocks as DraftBlock[]) : [],
    updatedAt: (data?.updated_at as string | undefined) ?? null,
  };
}

export async function saveDraft(studentId: number, blocks: DraftBlock[]): Promise<ResumeDraft> {
  const { data, error } = await supabase
    .from("resume_drafts")
    .upsert(
      { student_id: studentId, blocks, updated_at: new Date().toISOString() },
      { onConflict: "student_id" },
    )
    .select("blocks, updated_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save your resume");
  return { blocks: data.blocks as DraftBlock[], updatedAt: data.updated_at as string };
}
