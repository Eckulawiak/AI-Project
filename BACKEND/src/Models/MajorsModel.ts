import { supabase } from "../Database/supabaseClient.js";

export async function getMajors() {
  // Fetches only the list of majors. very lightweight.
  const { data, error } = await supabase
    .from("majors")
    .select("name")
    .order("name", { ascending: true });

  if (error) throw error;

  return data?.map((m) => m.name) ?? [];
}

export async function getMajorsWithIds() {
  const { data, error } = await supabase
    .from("majors")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// NEW: resolve major name -> id
export async function findMajorByName(majorName: string) {
  const trimmed = majorName.trim();

  const { data, error } = await supabase
    .from("majors")
    .select("id, name")
    .ilike("name", trimmed)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}
